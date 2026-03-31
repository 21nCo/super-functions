import CryptoKit
import CoreData
import DatafnCloudKitSync
import DatafnCoreDataStore
import DatafnSearchContracts
import DatafnSearchFnBackend
import DatafnServerSync
import DatafnWebViewBridgeHost
import Foundation

public struct DatafnNativeHealthReport: Sendable, Equatable {
    public let mode: String
    public let storageBackend: String
    public let syncOwner: String
    public let remoteMode: String
    public let issues: [DatafnHealthIssue]

    public var ok: Bool {
        issues.isEmpty
    }

    public init(
        mode: String,
        storageBackend: String,
        syncOwner: String,
        remoteMode: String,
        issues: [DatafnHealthIssue]
    ) {
        self.mode = mode
        self.storageBackend = storageBackend
        self.syncOwner = syncOwner
        self.remoteMode = remoteMode
        self.issues = issues
    }
}

enum DatafnAppleRuntimeError: Error, Equatable {
    case schemaDecodingFailed
}

struct DatafnAppleRuntimeSnapshot: Sendable, Equatable {
    let schemaHash: String
    let namespace: String
    let clientID: String
    let resourceNames: [String]
    let entityNames: [String]
    let storeURL: URL
    let changeTrackingDomain: String
    let remoteMode: DatafnNativeRemoteMode
    let searchBackendKind: String?
    let searchResourceNames: [String]
    let searchRootURL: URL?
    let searchConfigDigest: String?
    let searchStatus: String?
    let searchStatusTransitions: [String]
    let usesCloudKitPersistentContainer: Bool
    let cloudKitContainerIdentifier: String?
    let cloudKitDatabaseScope: DatafnCloudKitDatabaseScope?
}

private final class DatafnNativeSearchLifecycleCoordinator: @unchecked Sendable {
    private unowned let store: DatafnCoreDataStore
    private let searchBackend: DatafnSearchFnBackend
    private let searchFieldsByResource: [String: [String]]
    private let lock = NSLock()
    private var pendingOperations = 0
    private var idleContinuations: [CheckedContinuation<Void, Never>] = []

    init(
        store: DatafnCoreDataStore,
        searchBackend: DatafnSearchFnBackend,
        searchFieldsByResource: [String: [String]]
    ) {
        self.store = store
        self.searchBackend = searchBackend
        self.searchFieldsByResource = searchFieldsByResource
    }

    func handle(_ event: DatafnStoreEvent) {
        guard event.name == DatafnCoreDataStore.storageChangedEvent else {
            return
        }
        guard let resource = event.payload["resource"]?.stringValue, resource != "*" else {
            return
        }
        guard let searchFields = searchFieldsByResource[resource] else {
            return
        }
        let ids = event.payload["ids"]?.arrayValue?.compactMap(\.stringValue) ?? []
        guard !ids.isEmpty else {
            return
        }

        lock.lock()
        pendingOperations += 1
        lock.unlock()

        Task { [store, searchBackend] in
            defer { self.finishOperation() }

            var upserts: [DatafnSearchDocument] = []
            var deletions: [DatafnSearchDocument] = []
            do {
                for id in ids {
                    let record = try store.getRecord(resource: resource, id: id)
                    if let record {
                        if let document = makeSearchDocument(record: record, fields: searchFields) {
                            upserts.append(document)
                        } else {
                            deletions.append(DatafnSearchDocument(id: id, fields: [:]))
                        }
                    } else {
                        deletions.append(DatafnSearchDocument(id: id, fields: [:]))
                    }
                }

                if !upserts.isEmpty {
                    try await searchBackend.applyUpdate(
                        DatafnSearchUpdateRequest(
                            resource: resource,
                            operation: .upsert,
                            documents: upserts
                        )
                    )
                }

                if !deletions.isEmpty {
                    try await searchBackend.applyUpdate(
                        DatafnSearchUpdateRequest(
                            resource: resource,
                            operation: .delete,
                            documents: deletions
                        )
                    )
                }
            } catch {
                store.publishHealthChanged([
                    "code": .string("SEARCH_INDEX_UPDATE_FAILED"),
                    "message": .string(String(describing: error)),
                    "resource": .string(resource),
                    "path": .string("search.index"),
                ])
            }
        }
    }

    func waitForIdle() async {
        let shouldReturnImmediately = withLock { pendingOperations == 0 }
        if shouldReturnImmediately { return }
        await withCheckedContinuation { continuation in
            let shouldResumeImmediately = withLock {
                if pendingOperations == 0 {
                    return true
                }
                idleContinuations.append(continuation)
                return false
            }
            if shouldResumeImmediately {
                continuation.resume()
            }
        }
    }

    private func finishOperation() {
        let continuations = withLock { () -> [CheckedContinuation<Void, Never>] in
            pendingOperations -= 1
            if pendingOperations == 0 {
                let continuations = idleContinuations
                idleContinuations.removeAll()
                return continuations
            }
            return []
        }

        if !continuations.isEmpty {
            continuations.forEach { $0.resume() }
        }
    }

    private func withLock<T>(_ body: () -> T) -> T {
        lock.lock()
        defer { lock.unlock() }
        return body()
    }
}

private struct DatafnRuntimeSearchMetadata: Sendable, Equatable {
    let backendKind: String
    let schemaHash: String
    let configDigest: String

    var snapshot: DatafnSearchMetadataSnapshot {
        DatafnSearchMetadataSnapshot(
            backendKind: backendKind,
            schemaHash: schemaHash,
            configDigest: configDigest,
            status: .ready
        )
    }
}

public struct DatafnRuntimeObservationSource: @unchecked Sendable {
    public typealias EventHandler = @Sendable (DatafnStoreEvent) -> Void

    private let listRecordsHandler: @Sendable (String) throws -> [DatafnJSONObject]
    private let getRecordHandler: @Sendable (String, String) throws -> DatafnJSONObject?
    private let subscribeHandler: (@escaping EventHandler) -> UUID
    private let unsubscribeHandler: @Sendable (UUID) -> Void

    init(
        listRecords: @escaping @Sendable (String) throws -> [DatafnJSONObject],
        getRecord: @escaping @Sendable (String, String) throws -> DatafnJSONObject?,
        subscribe: @escaping (@escaping EventHandler) -> UUID,
        unsubscribe: @escaping @Sendable (UUID) -> Void
    ) {
        self.listRecordsHandler = listRecords
        self.getRecordHandler = getRecord
        self.subscribeHandler = subscribe
        self.unsubscribeHandler = unsubscribe
    }

    public func listRecords(resource: String) throws -> [DatafnJSONObject] {
        try listRecordsHandler(resource)
    }

    public func getRecord(resource: String, id: String) throws -> DatafnJSONObject? {
        try getRecordHandler(resource, id)
    }

    @discardableResult
    public func subscribe(_ handler: @escaping EventHandler) -> UUID {
        subscribeHandler(handler)
    }

    public func unsubscribe(_ token: UUID) {
        unsubscribeHandler(token)
    }
}

private struct DatafnAppleRuntimeBootstrap {
    let configuration: DatafnAppleRuntimeConfiguration
    let schema: DatafnRuntimeSchema
    let managedObjectModel: NSManagedObjectModel
    let storeLocation: NamespaceStoreLocation
    let store: DatafnCoreDataStore
    let searchBackend: DatafnSearchFnBackend?
    let searchBackendKind: String?
    let searchResources: [DatafnSearchResourceConfiguration]
    let searchRootURL: URL?
    let searchConfigDigest: String?
    let searchStatus: String?
    let searchStatusTransitions: [String]
    let serverRemoteExecutor: DatafnServerRemoteExecutor?
    let serverSyncEngine: DatafnServerSyncEngine?
    let cloudKitSyncEngine: DatafnCloudKitSyncEngine?
}

public actor DatafnAppleRuntime {
    private let configuration: DatafnAppleRuntimeConfiguration
    private let schema: DatafnRuntimeSchema
    private let managedObjectModel: NSManagedObjectModel
    private let storeLocation: NamespaceStoreLocation
    private let store: DatafnCoreDataStore
    private let searchBackend: DatafnSearchFnBackend?
    private let searchBackendKind: String?
    private let searchResources: [DatafnSearchResourceConfiguration]
    private let searchRootURL: URL?
    private let searchConfigDigest: String?
    private let searchStatus: String?
    private let searchStatusTransitions: [String]
    private let searchLifecycleCoordinator: DatafnNativeSearchLifecycleCoordinator?
    private let searchObserverToken: UUID?
    private let serverRemoteExecutor: DatafnServerRemoteExecutor?
    private let serverSyncEngine: DatafnServerSyncEngine?
    private let cloudKitSyncEngine: DatafnCloudKitSyncEngine?
    private var started = false

    public init(configuration: DatafnAppleRuntimeConfiguration) async throws {
        let bootstrap = try await Self.bootstrap(configuration: configuration, cloudKitHealthMonitor: nil)
        self.init(bootstrap: bootstrap)
    }

    init(
        configuration: DatafnAppleRuntimeConfiguration,
        cloudKitHealthMonitor: DatafnCloudKitHealthMonitor?
    ) async throws {
        let bootstrap = try await Self.bootstrap(configuration: configuration, cloudKitHealthMonitor: cloudKitHealthMonitor)
        self.init(bootstrap: bootstrap)
    }

    private init(bootstrap: DatafnAppleRuntimeBootstrap) {
        self.configuration = bootstrap.configuration
        self.schema = bootstrap.schema
        self.storeLocation = bootstrap.storeLocation
        self.managedObjectModel = bootstrap.managedObjectModel
        self.store = bootstrap.store
        self.searchBackend = bootstrap.searchBackend
        self.searchBackendKind = bootstrap.searchBackendKind
        self.searchResources = bootstrap.searchResources
        self.searchRootURL = bootstrap.searchRootURL
        self.searchConfigDigest = bootstrap.searchConfigDigest
        self.searchStatus = bootstrap.searchStatus
        self.searchStatusTransitions = bootstrap.searchStatusTransitions
        self.searchLifecycleCoordinator = bootstrap.searchBackend.flatMap {
            let coordinator = DatafnNativeSearchLifecycleCoordinator(
                store: bootstrap.store,
                searchBackend: $0,
                searchFieldsByResource: Dictionary(
                    uniqueKeysWithValues: bootstrap.searchResources.map { ($0.name, $0.searchFields) }
                )
            )
            return coordinator
        }
        if let searchLifecycleCoordinator {
            self.searchObserverToken = bootstrap.store.subscribe { [weak searchLifecycleCoordinator] event in
                searchLifecycleCoordinator?.handle(event)
            }
        } else {
            self.searchObserverToken = nil
        }
        self.serverRemoteExecutor = bootstrap.serverRemoteExecutor
        self.serverSyncEngine = bootstrap.serverSyncEngine
        self.cloudKitSyncEngine = bootstrap.cloudKitSyncEngine
    }

    public func start() async throws {
        guard !started else { return }
        if let serverSyncEngine {
            try await serverSyncEngine.start()
        }
        if let cloudKitSyncEngine {
            try await cloudKitSyncEngine.start()
        }
        started = true
    }

    public func stop() async {
        guard started else { return }
        if let serverSyncEngine {
            await serverSyncEngine.stop()
        }
        if let cloudKitSyncEngine {
            await cloudKitSyncEngine.stop()
        }
        started = false
    }

    public func healthCheck() async -> DatafnNativeHealthReport {
        var issues: [DatafnHealthIssue] = []
        if managedObjectModel.entities.isEmpty {
            issues.append(
                DatafnHealthIssue(
                    code: "INTERNAL",
                    message: "Core Data model has no entities",
                    details: ["path": "storage.coredata.model"]
                )
            )
        }

        let storageHealth = store.healthCheck()
        issues.append(contentsOf: storageHealth.issues.map {
            DatafnHealthIssue(
                code: "INTERNAL",
                message: $0,
                details: ["path": "storage.coredata"]
            )
        })

        if let serverSyncEngine {
            issues.append(contentsOf: await serverSyncEngine.healthIssues())
        }
        if let cloudKitSyncEngine {
            issues.append(contentsOf: await cloudKitSyncEngine.healthIssues())
        }

        return DatafnNativeHealthReport(
            mode: "native",
            storageBackend: "coredata",
            syncOwner: "native",
            remoteMode: configuration.syncBackend.remoteMode.rawValue,
            issues: issues
        )
    }

    public func makeObservationSource() -> DatafnRuntimeObservationSource {
        let store = self.store
        return DatafnRuntimeObservationSource(
            listRecords: { try store.listRecords(resource: $0) },
            getRecord: { try store.getRecord(resource: $0, id: $1) },
            subscribe: { store.subscribe($0) },
            unsubscribe: { store.unsubscribe($0) }
        )
    }

    public func search(_ request: DatafnSearchRequest) async throws -> [String] {
        guard let searchBackend else {
            throw DatafnSearchError.nativeSearchUnavailable("Native search backend is unavailable")
        }
        return try await searchBackend.search(request)
    }

    public func searchAll(_ request: DatafnSearchAllRequest) async throws -> [DatafnSearchAllResult] {
        guard let searchBackend else {
            throw DatafnSearchError.nativeSearchUnavailable("Native search backend is unavailable")
        }
        return try await searchBackend.searchAll(request)
    }

    public func makeBridgeHost(handlerName: String) -> DatafnWKWebViewBridgeHost {
        let configuration = self.configuration
        let store = self.store
        let serverRemoteExecutor = self.serverRemoteExecutor
        let serverSyncEngine = self.serverSyncEngine
        let cloudKitSyncEngine = self.cloudKitSyncEngine
        let searchBackend = self.searchBackend
        let remoteHandlers: DatafnBridgeRemoteHandlers
        let searchHandlers: DatafnBridgeSearchHandlers?
        let syncHandlers: DatafnBridgeSyncHandlers?

        if
            configuration.syncBackend.remoteMode == .datafnServer,
            let serverRemoteExecutor,
            let serverSyncEngine
        {
            remoteHandlers = DatafnBridgeRemoteHandlers(
                query: { try await serverRemoteExecutor.query($0) },
                mutation: { try await serverRemoteExecutor.mutation($0) },
                transact: { try await serverRemoteExecutor.transact($0) },
                seed: { try await serverRemoteExecutor.seed($0) },
                clone: { try await serverRemoteExecutor.clone($0) },
                pull: { try await serverRemoteExecutor.pull($0) },
                push: { try await serverRemoteExecutor.push($0) },
                reconcile: { try await serverRemoteExecutor.reconcile($0) }
            )
            syncHandlers = DatafnBridgeSyncHandlers(
                start: { try await serverSyncEngine.start() },
                stop: { await serverSyncEngine.stop() },
                pullNow: { try await serverSyncEngine.pullNow() },
                cloneNow: { try await serverSyncEngine.cloneNow() },
                reconcileNow: { try await serverSyncEngine.reconcileNow() },
                schedulePush: { try await serverSyncEngine.schedulePush() }
            )
        } else if configuration.syncBackend.remoteMode == .iCloud, let cloudKitSyncEngine {
            remoteHandlers = .unsupported(
                message: "CloudKit mode does not expose DataFn server remote operations"
            )
            syncHandlers = DatafnBridgeSyncHandlers(
                start: { try await cloudKitSyncEngine.start() },
                stop: { await cloudKitSyncEngine.stop() },
                pullNow: { try await cloudKitSyncEngine.pullNow() },
                cloneNow: { try await cloudKitSyncEngine.cloneNow() },
                reconcileNow: { try await cloudKitSyncEngine.reconcileNow() },
                schedulePush: { try await cloudKitSyncEngine.schedulePush() }
            )
        } else {
            remoteHandlers = .unsupported(
                message: configuration.syncBackend.remoteMode == .iCloud
                    ? "Native iCloud remote routing is not implemented yet"
                    : "Native DataFn-server remote routing is not implemented yet"
            )
            syncHandlers = nil
        }

        if let searchBackend {
            searchHandlers = DatafnBridgeSearchHandlers(
                initialize: { try await searchBackend.initialize($0) },
                search: { try await searchBackend.search($0) },
                searchAll: { try await searchBackend.searchAll($0) },
                dispose: { await searchBackend.dispose() }
            )
        } else {
            searchHandlers = nil
        }

        return DatafnWKWebViewBridgeHost(
            handlerName: handlerName,
            bridgeConfiguration: DatafnBridgeConfiguration(
                schemaHash: configuration.schemaHash,
                namespace: configuration.namespace,
                remoteMode: configuration.syncBackend.remoteMode.rawValue,
                remoteProfile: configuration.syncBackend.serverProfileID
            ),
            storage: store,
            remoteHandlers: remoteHandlers,
            searchHandlers: searchHandlers,
            syncHandlers: syncHandlers,
            healthReportProvider: { [store, configuration] in
                let storageHealth = store.healthCheck()
                var issues = storageHealth.issues.map {
                    DatafnHealthIssue(
                        code: "INTERNAL",
                        message: $0,
                        details: ["path": "storage.coredata"]
                    )
                }
                if let serverSyncEngine {
                    issues.append(contentsOf: await serverSyncEngine.healthIssues())
                }
                if let cloudKitSyncEngine {
                    issues.append(contentsOf: await cloudKitSyncEngine.healthIssues())
                }
                return DatafnBridgeHealthReport(
                    mode: "native",
                    storageBackend: "coredata",
                    syncOwner: "native",
                    remoteMode: configuration.syncBackend.remoteMode.rawValue,
                    issues: issues
                )
            }
        )
    }

    func snapshotForTesting() -> DatafnAppleRuntimeSnapshot {
        DatafnAppleRuntimeSnapshot(
            schemaHash: configuration.schemaHash,
            namespace: configuration.namespace,
            clientID: configuration.clientID,
            resourceNames: schema.resources.map(\.name).sorted(),
            entityNames: managedObjectModel.entities.compactMap(\.name).sorted(),
            storeURL: storeLocation.storeURL,
            changeTrackingDomain: storeLocation.changeTrackingDomain,
            remoteMode: configuration.syncBackend.remoteMode,
            searchBackendKind: searchBackendKind,
            searchResourceNames: searchResources.map(\.name).sorted(),
            searchRootURL: searchRootURL,
            searchConfigDigest: searchConfigDigest,
            searchStatus: searchStatus,
            searchStatusTransitions: searchStatusTransitions,
            usesCloudKitPersistentContainer: configuration.syncBackend.remoteMode == .iCloud,
            cloudKitContainerIdentifier: {
                guard case .iCloud(let cloudKit) = configuration.syncBackend else {
                    return nil
                }
                return cloudKit.containerIdentifier
            }(),
            cloudKitDatabaseScope: {
                guard case .iCloud(let cloudKit) = configuration.syncBackend else {
                    return nil
                }
                return cloudKit.databaseScope
            }()
        )
    }

    func storeForTesting() -> DatafnCoreDataStore {
        store
    }

    func searchBackendForTesting() -> DatafnSearchFnBackend? {
        searchBackend
    }

    func waitForSearchIndexingForTesting() async {
        await searchLifecycleCoordinator?.waitForIdle()
    }

    deinit {
        if let searchObserverToken {
            store.unsubscribe(searchObserverToken)
        }
    }
}

extension DatafnAppleRuntime {
    private static func bootstrap(
        configuration: DatafnAppleRuntimeConfiguration,
        cloudKitHealthMonitor: DatafnCloudKitHealthMonitor?
    ) async throws -> DatafnAppleRuntimeBootstrap {
        try configuration.validate()

        let schema: DatafnRuntimeSchema
        do {
            schema = try DatafnRuntimeSchema.decode(from: configuration.schemaJSON)
            try schema.validate()
        } catch let schemaError as DatafnRuntimeSchemaError {
            throw schemaError
        } catch {
            throw DatafnAppleRuntimeError.schemaDecodingFailed
        }

        let locator = NamespaceStoreLocator()
        let storeLocation = try locator.locate(
            namespace: configuration.namespace,
            under: configuration.storeRootURL
        )
        try FileManager.default.createDirectory(
            at: storeLocation.directoryURL,
            withIntermediateDirectories: true
        )
        try FileManager.default.createDirectory(
            at: storeLocation.supportDirectoryURL,
            withIntermediateDirectories: true
        )

        let model = try CoreDataModelBuilder().buildModel(
            from: schema,
            options: configuration.syncBackend.remoteMode == .iCloud
                ? .cloudKit
                : .default
        )

        let storeConfiguration = DatafnCoreDataStoreConfiguration(
            schema: schema,
            schemaHash: configuration.schemaHash,
            namespace: configuration.namespace,
            clientID: configuration.clientID,
            backendKind: configuration.syncBackend.remoteMode.rawValue,
            storeURL: storeLocation.storeURL,
            cloudKit: {
                guard case .iCloud(let cloudKit) = configuration.syncBackend else {
                    return nil
                }
                return DatafnCoreDataStoreCloudKitConfiguration(
                    containerIdentifier: cloudKit.containerIdentifier,
                    databaseScope: DatafnCoreDataStoreCloudKitDatabaseScope(
                        rawValue: cloudKit.databaseScope.rawValue
                    ) ?? .privateDatabase
                )
            }()
        )

        let store: DatafnCoreDataStore
        do {
            store = try DatafnCoreDataStore(
                configuration: storeConfiguration,
                managedObjectModel: model
            )
        } catch {
            throw BackendExclusivityGuard.normalize(error)
        }

        let searchResources = schema.resources
            .filter { $0.isRemoteOnly != true }
            .compactMap { resource -> DatafnSearchResourceConfiguration? in
                let fields = resource.indices?.search
                    .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
                    .filter { !$0.isEmpty } ?? []
                guard !fields.isEmpty else {
                    return nil
                }
                    return DatafnSearchResourceConfiguration(
                        name: resource.name,
                        searchFields: Array(NSOrderedSet(array: fields)) as? [String] ?? fields
                    )
            }
        let searchRootURL = configuration.search?.searchRootURL
            ?? storeLocation.supportDirectoryURL.appendingPathComponent("SearchFn", isDirectory: true)
        let currentSearchMetadata = !searchResources.isEmpty
            ? Self.makeSearchMetadata(schemaHash: configuration.schemaHash, resources: searchResources)
            : nil
        let searchBackend: DatafnSearchFnBackend?
        let searchBackendKind: String?
        let searchConfigDigest: String?
        let searchStatus: String?
        let searchStatusTransitions: [String]
        if let searchConfiguration = configuration.search, !searchResources.isEmpty {
            let searchMetadata = currentSearchMetadata
            ?? Self.makeSearchMetadata(schemaHash: configuration.schemaHash, resources: searchResources)
            let storedSearchMetadata = try store.searchMetadataSnapshot()
            let requiresRebuild = Self.requiresSearchRebuild(
                stored: storedSearchMetadata,
                current: searchMetadata
            )
            var transitions: [String] = []

            do {
                if requiresRebuild {
                    transitions.append(DatafnSearchMetadataStatus.rebuilding.rawValue)
                    try store.setSearchMetadata(
                        DatafnSearchMetadataSnapshot(
                            backendKind: searchMetadata.backendKind,
                            schemaHash: searchMetadata.schemaHash,
                            configDigest: searchMetadata.configDigest,
                            status: .rebuilding
                        )
                    )
                    try Self.clearSearchRootIfPresent(searchRootURL)
                }

                let backend = DatafnSearchFnBackendFactory.make(
                    searchConfiguration: searchConfiguration,
                    namespace: configuration.namespace,
                    supportDirectoryURL: storeLocation.supportDirectoryURL
                )
                try await backend.initialize(DatafnSearchInitializeRequest(resources: searchResources))
                if requiresRebuild {
                    try await Self.rebuildSearchBackend(
                        backend,
                        store: store,
                        resources: searchResources
                    )
                }
                try store.setSearchMetadata(
                    DatafnSearchMetadataSnapshot(
                        backendKind: searchMetadata.backendKind,
                        schemaHash: searchMetadata.schemaHash,
                        configDigest: searchMetadata.configDigest,
                        status: .ready
                    )
                )
                transitions.append(DatafnSearchMetadataStatus.ready.rawValue)
                searchBackend = backend
                searchBackendKind = searchMetadata.backendKind
                searchConfigDigest = searchMetadata.configDigest
                searchStatus = DatafnSearchMetadataStatus.ready.rawValue
                searchStatusTransitions = transitions
            } catch {
                let rebuildError = DatafnSearchError.rebuildFailed(
                    String(describing: error),
                    path: "search.rebuild"
                )
                try? store.setSearchMetadata(
                    DatafnSearchMetadataSnapshot(
                        backendKind: searchMetadata.backendKind,
                        schemaHash: searchMetadata.schemaHash,
                        configDigest: searchMetadata.configDigest,
                        status: .unavailable
                    )
                )
                if searchConfiguration.failIfUnavailable {
                    throw rebuildError
                }
                searchBackend = nil
                searchBackendKind = nil
                searchConfigDigest = searchMetadata.configDigest
                searchStatus = DatafnSearchMetadataStatus.unavailable.rawValue
                searchStatusTransitions = transitions
            }
        } else {
            searchBackend = nil
            searchBackendKind = nil
            searchConfigDigest = nil
            searchStatus = nil
            searchStatusTransitions = []
        }

        let serverRemoteExecutor: DatafnServerRemoteExecutor?
        let serverSyncEngine: DatafnServerSyncEngine?
        let cloudKitSyncEngine: DatafnCloudKitSyncEngine?
        switch configuration.syncBackend {
        case .datafnServer(let serverConfiguration):
            let authorizer = serverConfiguration.auth?.makeRequestAuthorizer(
                profileID: serverConfiguration.profileID
            )
            let remoteExecutor = DatafnServerRemoteExecutor(
                configuration: DatafnServerRemoteExecutorConfiguration(
                    baseURL: serverConfiguration.baseURL,
                    websocketURL: serverConfiguration.websocketURL,
                    profileID: serverConfiguration.profileID,
                    requestAuthorizer: authorizer
                )
            )
            serverRemoteExecutor = remoteExecutor
            serverSyncEngine = DatafnServerSyncEngine(
                store: store,
                schema: schema,
                clientID: configuration.clientID,
                remoteExecutor: remoteExecutor
            )
            cloudKitSyncEngine = nil
        case .iCloud(let cloudKit):
            serverRemoteExecutor = nil
            serverSyncEngine = nil
            cloudKitSyncEngine = DatafnCloudKitSyncEngine(
                store: store,
                containerIdentifier: cloudKit.containerIdentifier,
                databaseScope: cloudKit.databaseScope.rawValue,
                healthMonitor: cloudKitHealthMonitor
                    ?? .live(containerIdentifier: cloudKit.containerIdentifier)
            )
        }

        return DatafnAppleRuntimeBootstrap(
            configuration: configuration,
            schema: schema,
            managedObjectModel: model,
            storeLocation: storeLocation,
            store: store,
            searchBackend: searchBackend,
            searchBackendKind: searchBackendKind,
            searchResources: searchResources,
            searchRootURL: configuration.search == nil ? nil : searchRootURL,
            searchConfigDigest: searchConfigDigest,
            searchStatus: searchStatus,
            searchStatusTransitions: searchStatusTransitions,
            serverRemoteExecutor: serverRemoteExecutor,
            serverSyncEngine: serverSyncEngine,
            cloudKitSyncEngine: cloudKitSyncEngine
        )
    }

    private static func makeSearchMetadata(
        schemaHash: String,
        resources: [DatafnSearchResourceConfiguration]
    ) -> DatafnRuntimeSearchMetadata {
        let normalizedResources = resources
            .map {
                DatafnSearchResourceConfiguration(
                    name: $0.name.trimmingCharacters(in: .whitespacesAndNewlines),
                    searchFields: $0.searchFields
                        .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
                        .filter { !$0.isEmpty }
                        .sorted()
                )
            }
            .sorted { lhs, rhs in
                if lhs.name != rhs.name {
                    return lhs.name < rhs.name
                }
                return lhs.searchFields.lexicographicallyPrecedes(rhs.searchFields)
            }
        let payload = normalizedResources.map {
            "\($0.name):\($0.searchFields.joined(separator: ","))"
        }.joined(separator: "|")
        let digestInput = "searchfn|\(schemaHash)|\(payload)"
        let digest = SHA256.hash(data: Data(digestInput.utf8)).map { String(format: "%02x", $0) }.joined()
        return DatafnRuntimeSearchMetadata(
            backendKind: "searchfn",
            schemaHash: schemaHash,
            configDigest: digest
        )
    }

    private static func requiresSearchRebuild(
        stored: DatafnSearchMetadataSnapshot,
        current: DatafnRuntimeSearchMetadata
    ) -> Bool {
        stored.backendKind != current.backendKind
            || stored.schemaHash != current.schemaHash
            || stored.configDigest != current.configDigest
            || stored.status != .ready
    }

    private static func clearSearchRootIfPresent(_ searchRootURL: URL) throws {
        if FileManager.default.fileExists(atPath: searchRootURL.path) {
            try FileManager.default.removeItem(at: searchRootURL)
        }
    }

    private static func rebuildSearchBackend(
        _ backend: DatafnSearchFnBackend,
        store: DatafnCoreDataStore,
        resources: [DatafnSearchResourceConfiguration]
    ) async throws {
        for resource in resources.sorted(by: { $0.name < $1.name }) {
            let records = try store.listRecords(resource: resource.name)
            let documents = records.compactMap { record in
                makeSearchDocument(record: record, fields: resource.searchFields)
            }
            guard !documents.isEmpty else {
                continue
            }
            try await backend.applyUpdate(
                DatafnSearchUpdateRequest(
                    resource: resource.name,
                    operation: .upsert,
                    documents: documents
                )
            )
        }
    }

}

private func makeSearchDocument(
    record: DatafnJSONObject,
    fields: [String]
) -> DatafnSearchDocument? {
    guard let id = record["id"]?.stringValue, !id.isEmpty else {
        return nil
    }

    var searchFields: [String: String] = [:]
    for field in fields {
        guard let value = record[field] else {
            continue
        }
        switch value {
        case .string(let stringValue):
            searchFields[field] = stringValue
        case .number(let numberValue):
            searchFields[field] = String(numberValue)
        case .bool(let boolValue):
            searchFields[field] = String(boolValue)
        case .object, .array:
            let foundationValue = value.foundationValue()
            if JSONSerialization.isValidJSONObject(foundationValue),
               let data = try? JSONSerialization.data(withJSONObject: foundationValue),
               let stringValue = String(data: data, encoding: .utf8)
            {
                searchFields[field] = stringValue
            }
        case .null:
            continue
        }
    }

    return DatafnSearchDocument(id: id, fields: searchFields)
}
