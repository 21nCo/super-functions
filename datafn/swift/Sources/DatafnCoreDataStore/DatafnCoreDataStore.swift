import CloudKit
import CoreData
import Foundation

public typealias DatafnJSONObject = [String: DatafnJSONValue]

public enum DatafnJSONValue: Codable, Equatable, Sendable {
    case null
    case bool(Bool)
    case number(Double)
    case string(String)
    case array([DatafnJSONValue])
    case object(DatafnJSONObject)

    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()

        if container.decodeNil() {
            self = .null
        } else if let value = try? container.decode(Bool.self) {
            self = .bool(value)
        } else if let value = try? container.decode(Double.self) {
            self = .number(value)
        } else if let value = try? container.decode(String.self) {
            self = .string(value)
        } else if let value = try? container.decode([DatafnJSONValue].self) {
            self = .array(value)
        } else if let value = try? container.decode(DatafnJSONObject.self) {
            self = .object(value)
        } else {
            throw DecodingError.dataCorruptedError(
                in: container,
                debugDescription: "Unsupported JSON value"
            )
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()

        switch self {
        case .null:
            try container.encodeNil()
        case .bool(let value):
            try container.encode(value)
        case .number(let value):
            try container.encode(value)
        case .string(let value):
            try container.encode(value)
        case .array(let value):
            try container.encode(value)
        case .object(let value):
            try container.encode(value)
        }
    }

    public var stringValue: String? {
        guard case .string(let value) = self else { return nil }
        return value
    }

    public var objectValue: DatafnJSONObject? {
        guard case .object(let value) = self else { return nil }
        return value
    }

    public var arrayValue: [DatafnJSONValue]? {
        guard case .array(let value) = self else { return nil }
        return value
    }

    public var intValue: Int? {
        guard case .number(let value) = self else { return nil }
        return Int(exactly: value)
    }

    public func foundationValue() -> Any {
        switch self {
        case .null:
            return NSNull()
        case .bool(let value):
            return value
        case .number(let value):
            if let exactInt = Int(exactly: value) {
                return exactInt
            }
            return value
        case .string(let value):
            return value
        case .array(let value):
            return value.map { $0.foundationValue() }
        case .object(let value):
            return value.mapValues { $0.foundationValue() }
        }
    }
}

extension DatafnJSONValue: ExpressibleByNilLiteral {
    public init(nilLiteral: ()) {
        self = .null
    }
}

extension DatafnJSONValue: ExpressibleByBooleanLiteral {
    public init(booleanLiteral value: Bool) {
        self = .bool(value)
    }
}

extension DatafnJSONValue: ExpressibleByIntegerLiteral {
    public init(integerLiteral value: Int) {
        self = .number(Double(value))
    }
}

extension DatafnJSONValue: ExpressibleByFloatLiteral {
    public init(floatLiteral value: Double) {
        self = .number(value)
    }
}

extension DatafnJSONValue: ExpressibleByStringLiteral {
    public init(stringLiteral value: String) {
        self = .string(value)
    }
}

extension DatafnJSONValue: ExpressibleByArrayLiteral {
    public init(arrayLiteral elements: DatafnJSONValue...) {
        self = .array(elements)
    }
}

extension DatafnJSONValue: ExpressibleByDictionaryLiteral {
    public init(dictionaryLiteral elements: (String, DatafnJSONValue)...) {
        self = .object(Dictionary(uniqueKeysWithValues: elements))
    }
}

enum DatafnJSONValueError: Error, Equatable {
    case nonJSONObject
    case nonJSONValue(String)
}

extension DatafnJSONValue {
    init(any value: Any) throws {
        switch value {
        case is NSNull:
            self = .null
        case let bool as Bool:
            self = .bool(bool)
        case let number as NSNumber:
            if CFGetTypeID(number) == CFBooleanGetTypeID() {
                self = .bool(number.boolValue)
            } else {
                self = .number(number.doubleValue)
            }
        case let string as String:
            self = .string(string)
        case let array as [Any]:
            self = .array(try array.map(Self.init(any:)))
        case let dictionary as [String: Any]:
            self = .object(try dictionary.mapValues(Self.init(any:)))
        default:
            throw DatafnJSONValueError.nonJSONValue(String(describing: value))
        }
    }
}

public enum DatafnHydrationState: String, Codable, Sendable, Equatable {
    case notStarted
    case hydrating
    case ready
}

public struct DatafnHealthIssue: Codable, Equatable, Sendable {
    public let code: String
    public let message: String
    public let details: DatafnJSONObject?

    public init(
        code: String,
        message: String,
        details: DatafnJSONObject? = nil
    ) {
        self.code = code
        self.message = message
        self.details = details
    }

    public var jsonObject: DatafnJSONObject {
        var object: DatafnJSONObject = [
            "code": .string(code),
            "message": .string(message),
        ]
        if let details {
            object["details"] = .object(details)
        }
        return object
    }
}

public struct DatafnStorageHealthReport: Equatable, Sendable {
    public let ok: Bool
    public let issues: [String]

    public init(ok: Bool, issues: [String]) {
        self.ok = ok
        self.issues = issues
    }

    public var jsonObject: DatafnJSONObject {
        [
            "ok": .bool(ok),
            "issues": .array(issues.map(DatafnJSONValue.string))
        ]
    }
}

public struct DatafnChangelogPendingEntry: Codable, Equatable, Sendable {
    public let clientId: String
    public let mutationId: String
    public let mutation: DatafnJSONObject
    public let timestampMs: Int64
    public let actorId: String?
    public let timestamp: String?

    public init(
        clientId: String,
        mutationId: String,
        mutation: DatafnJSONObject,
        timestampMs: Int64,
        actorId: String? = nil,
        timestamp: String? = nil
    ) {
        self.clientId = clientId
        self.mutationId = mutationId
        self.mutation = mutation
        self.timestampMs = timestampMs
        self.actorId = actorId
        self.timestamp = timestamp
    }
}

public struct DatafnChangelogEntry: Codable, Equatable, Sendable {
    public let seq: Int64
    public let clientId: String
    public let mutationId: String
    public let mutation: DatafnJSONObject
    public let timestampMs: Int64
    public let actorId: String?
    public let timestamp: String?

    public init(
        seq: Int64,
        clientId: String,
        mutationId: String,
        mutation: DatafnJSONObject,
        timestampMs: Int64,
        actorId: String? = nil,
        timestamp: String? = nil
    ) {
        self.seq = seq
        self.clientId = clientId
        self.mutationId = mutationId
        self.mutation = mutation
        self.timestampMs = timestampMs
        self.actorId = actorId
        self.timestamp = timestamp
    }

    public var jsonObject: DatafnJSONObject {
        var object: DatafnJSONObject = [
            "seq": .number(Double(seq)),
            "clientId": .string(clientId),
            "mutationId": .string(mutationId),
            "mutation": .object(mutation),
            "timestampMs": .number(Double(timestampMs)),
        ]

        if let actorId {
            object["actorId"] = .string(actorId)
        }
        if let timestamp {
            object["timestamp"] = .string(timestamp)
        }

        return object
    }
}

public struct DatafnStoreEvent: Equatable, Sendable {
    public let name: String
    public let payload: DatafnJSONObject

    public init(name: String, payload: DatafnJSONObject) {
        self.name = name
        self.payload = payload
    }
}

public enum DatafnSearchMetadataStatus: String, Codable, Sendable, Equatable {
    case unavailable
    case rebuilding
    case ready
}

public struct DatafnSearchMetadataSnapshot: Sendable, Equatable {
    public let backendKind: String?
    public let schemaHash: String?
    public let configDigest: String?
    public let status: DatafnSearchMetadataStatus

    public init(
        backendKind: String? = nil,
        schemaHash: String? = nil,
        configDigest: String? = nil,
        status: DatafnSearchMetadataStatus = .unavailable
    ) {
        self.backendKind = backendKind
        self.schemaHash = schemaHash
        self.configDigest = configDigest
        self.status = status
    }
}

public struct DatafnCoreDataStoreConfiguration: Sendable, Equatable {
    public let cloudKit: DatafnCoreDataStoreCloudKitConfiguration?
    public let schema: DatafnRuntimeSchema
    public let schemaHash: String
    public let namespace: String
    public let clientID: String
    public let backendKind: String
    public let storeURL: URL
    public let inMemory: Bool

    public init(
        schema: DatafnRuntimeSchema,
        schemaHash: String,
        namespace: String,
        clientID: String,
        backendKind: String,
        storeURL: URL,
        inMemory: Bool = false,
        cloudKit: DatafnCoreDataStoreCloudKitConfiguration? = nil
    ) {
        self.cloudKit = cloudKit
        self.schema = schema
        self.schemaHash = schemaHash
        self.namespace = namespace
        self.clientID = clientID
        self.backendKind = backendKind
        self.storeURL = storeURL
        self.inMemory = inMemory
    }
}

public enum DatafnCoreDataStoreCloudKitDatabaseScope: String, Codable, Sendable, Equatable {
    case privateDatabase = "private"
}

public struct DatafnCoreDataStoreCloudKitConfiguration: Sendable, Equatable {
    public let containerIdentifier: String
    public let databaseScope: DatafnCoreDataStoreCloudKitDatabaseScope

    public init(
        containerIdentifier: String,
        databaseScope: DatafnCoreDataStoreCloudKitDatabaseScope = .privateDatabase
    ) {
        self.containerIdentifier = containerIdentifier
        self.databaseScope = databaseScope
    }
}

public enum DatafnCoreDataStoreError: Error, Equatable {
    case persistentStoreLoadFailed(String)
    case storeClosed
    case unknownResource(String)
    case unknownRelationKey(String)
    case recordMissingID
    case joinRowMissingEndpoints
    case invalidHydrationTransition(from: DatafnHydrationState, to: DatafnHydrationState)
    case invalidCursor
    case invalidMutationField(String)
    case invalidMutationTimestamp
    case namespaceMetadataMissing
    case backendKindConflict(existing: String, requested: String)
    case recordEncodingFailed
    case recordDecodingFailed
}

struct DatafnPersistentContainerSnapshot: Equatable, Sendable {
    let kind: String
    let cloudKitContainerIdentifier: String?
    let cloudKitDatabaseScope: String?
}

public final class DatafnCoreDataStore: @unchecked Sendable {
    public static let bridgeReadyEvent = "bridge.ready"
    public static let bridgeClosedEvent = "bridge.closed"
    public static let storageChangedEvent = "storage.changed"
    public static let hydrationChangedEvent = "hydration.changed"
    public static let mutationAppliedEvent = "mutation.applied"
    public static let mutationRejectedEvent = "mutation.rejected"
    public static let syncStatusEvent = "sync.status"
    public static let syncFailedEvent = "sync.failed"
    public static let healthChangedEvent = "health.changed"

    private let configuration: DatafnCoreDataStoreConfiguration
    private let managedObjectModel: NSManagedObjectModel
    private let persistentContainer: NSPersistentContainer
    private let persistentContainerSnapshot: DatafnPersistentContainerSnapshot
    private let context: NSManagedObjectContext
    private let changelogStore = DatafnChangelogStore()
    private let observerLock = NSLock()
    private let stateLock = NSLock()

    private var observers: [UUID: @Sendable (DatafnStoreEvent) -> Void] = [:]
    private var isClosed = false

    private let resourceEntities: [String: String]
    private let relationEntities: [String: String]
    private let validResources: Set<String>
    private let validRelationKeys: Set<String>

    public init(
        configuration: DatafnCoreDataStoreConfiguration,
        managedObjectModel: NSManagedObjectModel? = nil
    ) throws {
        try configuration.schema.validate()

        let model = try managedObjectModel
            ?? CoreDataModelBuilder().buildModel(
                from: configuration.schema,
                options: configuration.cloudKit == nil ? .default : .cloudKit
            )
        let resourceEntities = Self.makeResourceEntityMap(for: configuration.schema)
        let relationEntities = Self.makeRelationEntityMap(for: configuration.schema)
        let usesInMemoryStore = configuration.inMemory && configuration.cloudKit == nil

        if !usesInMemoryStore {
            try FileManager.default.createDirectory(
                at: configuration.storeURL.deletingLastPathComponent(),
                withIntermediateDirectories: true
            )
        }

        let container: NSPersistentContainer
        let persistentContainerSnapshot: DatafnPersistentContainerSnapshot
        let description = NSPersistentStoreDescription(
            url: usesInMemoryStore
                ? URL(fileURLWithPath: "/dev/null")
                : configuration.storeURL
        )
        description.shouldAddStoreAsynchronously = false
        if let cloudKit = configuration.cloudKit {
            let cloudKitContainer = NSPersistentCloudKitContainer(
                name: "DatafnAppleStore",
                managedObjectModel: model
            )
            let options = NSPersistentCloudKitContainerOptions(
                containerIdentifier: cloudKit.containerIdentifier
            )
            options.databaseScope = .private
            description.type = NSSQLiteStoreType
            description.cloudKitContainerOptions = options
            description.setOption(true as NSNumber, forKey: NSPersistentHistoryTrackingKey)
            description.setOption(
                true as NSNumber,
                forKey: NSPersistentStoreRemoteChangeNotificationPostOptionKey
            )
            cloudKitContainer.persistentStoreDescriptions = [description]
            container = cloudKitContainer
            persistentContainerSnapshot = DatafnPersistentContainerSnapshot(
                kind: "cloudkit",
                cloudKitContainerIdentifier: cloudKit.containerIdentifier,
                cloudKitDatabaseScope: cloudKit.databaseScope.rawValue
            )
        } else {
            let persistentContainer = NSPersistentContainer(
                name: "DatafnAppleStore",
                managedObjectModel: model
            )
            description.type = usesInMemoryStore ? NSInMemoryStoreType : NSSQLiteStoreType
            persistentContainer.persistentStoreDescriptions = [description]
            container = persistentContainer
            persistentContainerSnapshot = DatafnPersistentContainerSnapshot(
                kind: "persistent",
                cloudKitContainerIdentifier: nil,
                cloudKitDatabaseScope: nil
            )
        }

        let semaphore = DispatchSemaphore(value: 0)
        var loadError: Error?
        container.loadPersistentStores { _, error in
            loadError = error
            semaphore.signal()
        }
        semaphore.wait()

        if let loadError {
            throw DatafnCoreDataStoreError.persistentStoreLoadFailed(String(describing: loadError))
        }

        let context = container.newBackgroundContext()
        context.mergePolicy = NSMergeByPropertyObjectTrumpMergePolicy

        self.configuration = configuration
        self.managedObjectModel = model
        self.persistentContainer = container
        self.persistentContainerSnapshot = persistentContainerSnapshot
        self.context = context
        self.resourceEntities = resourceEntities
        self.relationEntities = relationEntities
        self.validResources = Set(resourceEntities.keys).union([Self.kvResourceName])
        self.validRelationKeys = Set(relationEntities.keys)

        try bootstrapStore()
    }

    @discardableResult
    public func subscribe(
        _ observer: @escaping @Sendable (DatafnStoreEvent) -> Void
    ) -> UUID {
        let token = UUID()
        observerLock.lock()
        observers[token] = observer
        observerLock.unlock()
        return token
    }

    public func unsubscribe(_ token: UUID) {
        observerLock.lock()
        observers.removeValue(forKey: token)
        observerLock.unlock()
    }

    public func getRecord(resource: String, id: String) throws -> DatafnJSONObject? {
        try ensureOpen()
        return try performSync { context in
            try self.loadRecord(resource: resource, id: id, in: context)
        }
    }

    public func listRecords(resource: String) throws -> [DatafnJSONObject] {
        try ensureOpen()
        return try performSync { context in
            if resource == Self.kvResourceName {
                let request = NSFetchRequest<NSManagedObject>(entityName: Self.kvEntityName)
                request.sortDescriptors = [NSSortDescriptor(key: "key", ascending: true)]
                return try context.fetch(request).map(Self.decodeKVRecord)
            }

            let entityName = try self.entityName(forResource: resource)
            let request = NSFetchRequest<NSManagedObject>(entityName: entityName)
            request.sortDescriptors = [NSSortDescriptor(key: "id", ascending: true)]
            return try context.fetch(request).map(Self.decodeRecord)
        }
    }

    public func upsertRecord(resource: String, record: DatafnJSONObject) throws {
        let id = try Self.requireRecordID(record)
        let event = try performMutatingOperation {
            try self.storeRecord(resource: resource, record: record, in: $0)
            return Self.makeStorageChangedEvent(resource: resource, ids: [id])
        }
        emit(event)
    }

    public func deleteRecord(resource: String, id: String) throws {
        let event = try performMutatingOperation {
            try self.deleteRecord(resource: resource, id: id, in: $0)
            return Self.makeStorageChangedEvent(resource: resource, ids: [id])
        }
        emit(event)
    }

    public func mergeRecord(
        resource: String,
        id: String,
        partial: DatafnJSONObject,
        ifMissing: DatafnJSONObject? = nil
    ) throws -> DatafnJSONObject {
        let result = try performMutatingOperation { context in
            let existing = try self.loadRecord(resource: resource, id: id, in: context)
            let merged: DatafnJSONObject
            if let existing {
                merged = Self.deepMergeOneLevel(base: existing, patch: partial, forcedID: id)
            } else {
                // Match the JS adapter contract: ifMissing is the complete
                // creation payload selected atomically instead of partial.
                merged = Self.deepMergeOneLevel(
                    base: [:],
                    patch: ifMissing ?? partial,
                    forcedID: id
                )
            }
            try self.storeRecord(resource: resource, record: merged, in: context)
            return (merged, Self.makeStorageChangedEvent(resource: resource, ids: [id]))
        }
        emit(result.1)
        return result.0
    }

    public func listJoinRows(relationKey: String) throws -> [DatafnJSONObject] {
        try ensureOpen()
        return try performSync { context in
            let entityName = try self.entityName(forRelationKey: relationKey)
            let request = NSFetchRequest<NSManagedObject>(entityName: entityName)
            request.sortDescriptors = [
                NSSortDescriptor(key: "fromID", ascending: true),
                NSSortDescriptor(key: "toID", ascending: true),
            ]
            return try context.fetch(request).map(Self.decodeJoinRow)
        }
    }

    public func getJoinRows(
        relationKey: String,
        fromId: String
    ) throws -> [DatafnJSONObject] {
        try ensureOpen()
        return try performSync { context in
            let entityName = try self.entityName(forRelationKey: relationKey)
            let request = NSFetchRequest<NSManagedObject>(entityName: entityName)
            request.predicate = NSPredicate(format: "fromID == %@", fromId)
            request.sortDescriptors = [NSSortDescriptor(key: "toID", ascending: true)]
            return try context.fetch(request).map(Self.decodeJoinRow)
        }
    }

    public func getJoinRowsInverse(
        relationKey: String,
        toId: String
    ) throws -> [DatafnJSONObject] {
        try ensureOpen()
        return try performSync { context in
            let entityName = try self.entityName(forRelationKey: relationKey)
            let request = NSFetchRequest<NSManagedObject>(entityName: entityName)
            request.predicate = NSPredicate(format: "toID == %@", toId)
            request.sortDescriptors = [NSSortDescriptor(key: "fromID", ascending: true)]
            return try context.fetch(request).map(Self.decodeJoinRow)
        }
    }

    public func upsertJoinRow(
        relationKey: String,
        row: DatafnJSONObject
    ) throws {
        let endpoints = try Self.requireJoinEndpoints(row)
        let event = try performMutatingOperation {
            try self.storeJoinRow(relationKey: relationKey, row: row, in: $0)
            return Self.makeJoinChangedEvent(
                relationKey: relationKey,
                ids: ["\(endpoints.from)->\(endpoints.to)"]
            )
        }
        emit(event)
    }

    public func setJoinRows(
        relationKey: String,
        rows: [DatafnJSONObject]
    ) throws {
        let ids = try rows.map { row -> String in
            let endpoints = try Self.requireJoinEndpoints(row)
            return "\(endpoints.from)->\(endpoints.to)"
        }
        let event = try performMutatingOperation {
            for row in rows {
                try self.storeJoinRow(relationKey: relationKey, row: row, in: $0)
            }
            return Self.makeJoinChangedEvent(relationKey: relationKey, ids: ids)
        }
        emit(event)
    }

    public func deleteJoinRow(
        relationKey: String,
        from: String,
        to: String
    ) throws {
        let event = try performMutatingOperation {
            try self.deleteJoinRow(relationKey: relationKey, from: from, to: to, in: $0)
            return Self.makeJoinChangedEvent(relationKey: relationKey, ids: ["\(from)->\(to)"])
        }
        emit(event)
    }

    public func findRecords(
        resource: String,
        field: String,
        value: DatafnJSONValue
    ) throws -> [DatafnJSONObject] {
        try listRecords(resource: resource)
            .filter { $0[field] == value }
            .sorted { ($0["id"]?.stringValue ?? "") < ($1["id"]?.stringValue ?? "") }
    }

    public func getCursor(resource: String) throws -> String? {
        try ensureOpen()
        try validateCursorScope(resource)

        return try performSync { context in
            let request = NSFetchRequest<NSManagedObject>(entityName: Self.cursorEntityName)
            request.fetchLimit = 1
            request.predicate = NSPredicate(format: "resourceName == %@", resource)
            return try context.fetch(request).first?.value(forKey: "cursorValue") as? String
        }
    }

    public func setCursor(resource: String, cursor: String?) throws {
        try validateCursorScope(resource)

        let event = try performMutatingOperation { context in
            let object = try self.fetchCursorState(resource: resource, in: context)
            if let cursor {
                let target = object ?? NSEntityDescription.insertNewObject(
                    forEntityName: Self.cursorEntityName,
                    into: context
                )
                target.setValue(resource, forKey: "resourceName")
                target.setValue(cursor, forKey: "cursorValue")
                target.setValue(Date(), forKey: "updatedAt")
            } else if let object {
                context.delete(object)
            }
            return Self.makeStorageChangedEvent(resource: resource, ids: [resource])
        }
        emit(event)
    }

    public func publishSyncStatus(_ payload: DatafnJSONObject) {
        emit(DatafnStoreEvent(name: Self.syncStatusEvent, payload: payload))
    }

    public func publishSyncFailure(_ payload: DatafnJSONObject) {
        emit(DatafnStoreEvent(name: Self.syncFailedEvent, payload: payload))
    }

    public func publishHealthChanged(_ payload: DatafnJSONObject) {
        emit(DatafnStoreEvent(name: Self.healthChangedEvent, payload: payload))
    }

    public func getHydrationState(resource: String) throws -> DatafnHydrationState {
        try ensureOpen()
        try validateResource(resource)

        return try performSync { context in
            let request = NSFetchRequest<NSManagedObject>(entityName: Self.hydrationEntityName)
            request.fetchLimit = 1
            request.predicate = NSPredicate(format: "resourceName == %@", resource)
            guard
                let object = try context.fetch(request).first,
                let raw = object.value(forKey: "state") as? String,
                let state = DatafnHydrationState(rawValue: raw)
            else {
                return .notStarted
            }
            return state
        }
    }

    public func setHydrationState(
        resource: String,
        state: DatafnHydrationState
    ) throws {
        let event = try performMutatingOperation { context in
            let current = try self.currentHydrationState(resource: resource, in: context)
            try Self.validateHydrationTransition(from: current, to: state)
            let object = try self.fetchHydrationState(resource: resource, in: context)
                ?? NSEntityDescription.insertNewObject(
                    forEntityName: Self.hydrationEntityName,
                    into: context
                )
            object.setValue(resource, forKey: "resourceName")
            object.setValue(state.rawValue, forKey: "state")
            object.setValue(Date(), forKey: "updatedAt")

            return DatafnStoreEvent(
                name: Self.hydrationChangedEvent,
                payload: [
                    "resource": .string(resource),
                    "state": .string(state.rawValue),
                ]
            )
        }
        emit(event)
    }

    public func changelogAppend(
        entry: DatafnChangelogPendingEntry
    ) throws -> DatafnChangelogEntry {
        let result = try performMutatingOperation { context in
            let metadata = try self.fetchNamespaceMetadata(in: context)
            let changelogEntry = try self.changelogStore.append(
                entry: entry,
                metadata: metadata,
                in: context
            )
            let event = DatafnStoreEvent(
                name: Self.mutationAppliedEvent,
                payload: [
                    "clientId": .string(changelogEntry.clientId),
                    "mutationId": .string(changelogEntry.mutationId),
                    "seq": .number(Double(changelogEntry.seq)),
                ]
            )
            return (changelogEntry, event)
        }
        emit(result.1)
        return result.0
    }

    public func changelogList(limit: Int = 100) throws -> [DatafnChangelogEntry] {
        try ensureOpen()
        return try performSync { context in
            try self.changelogStore.list(limit: limit, in: context)
        }
    }

    public func changelogAck(throughSeq: Int64) throws {
        let event = try performMutatingOperation { context in
            try self.changelogStore.ack(throughSeq: throughSeq, in: context)
            return DatafnStoreEvent(
                name: Self.storageChangedEvent,
                payload: [
                    "resource": .string("changelog"),
                    "throughSeq": .number(Double(throughSeq)),
                ]
            )
        }
        emit(event)
    }

    public func countRecords(resource: String) throws -> Int {
        try ensureOpen()
        return try performSync { context in
            if resource == Self.kvResourceName {
                let request = NSFetchRequest<NSManagedObject>(entityName: Self.kvEntityName)
                return try context.count(for: request)
            }
            let request = NSFetchRequest<NSManagedObject>(entityName: try self.entityName(forResource: resource))
            return try context.count(for: request)
        }
    }

    public func countJoinRows(relationKey: String) throws -> Int {
        try ensureOpen()
        return try performSync { context in
            let request = NSFetchRequest<NSManagedObject>(entityName: try self.entityName(forRelationKey: relationKey))
            return try context.count(for: request)
        }
    }

    public func clearAll() throws {
        let event = try performMutatingOperation { context in
            for entity in self.managedObjectModel.entities {
                guard let entityName = entity.name else { continue }
                let request = NSFetchRequest<NSFetchRequestResult>(entityName: entityName)
                let objects = try context.fetch(request) as? [NSManagedObject] ?? []
                objects.forEach(context.delete)
            }

            try self.ensureNamespaceMetadata(in: context)
            return DatafnStoreEvent(
                name: Self.storageChangedEvent,
                payload: [
                    "resource": .string("*"),
                    "ids": .array([]),
                ]
            )
        }
        emit(event)
    }

    public func close() {
        stateLock.lock()
        isClosed = true
        stateLock.unlock()

        context.performAndWait {
            context.reset()
        }
    }

    public func healthCheck() -> DatafnStorageHealthReport {
        var issues: [String] = []

        stateLock.lock()
        let closed = isClosed
        stateLock.unlock()

        if closed {
            issues.append("Store is closed")
        }

        do {
            try performSync { context in
                let requiredEntities = Set(self.resourceEntities.values)
                    .union(self.relationEntities.values)
                    .union([
                        Self.kvEntityName,
                        Self.cursorEntityName,
                        Self.hydrationEntityName,
                        Self.namespaceMetadataEntityName,
                        Self.changelogEntityName,
                    ])

                for entityName in requiredEntities where self.managedObjectModel.entitiesByName[entityName] == nil {
                    issues.append("Missing entity: \(entityName)")
                }

                let metadata = try self.fetchNamespaceMetadata(in: context)
                if metadata.value(forKey: "schemaHash") as? String != self.configuration.schemaHash {
                    issues.append("Schema hash metadata mismatch")
                }
                if metadata.value(forKey: "namespace") as? String != self.configuration.namespace {
                    issues.append("Namespace metadata mismatch")
                }
                if metadata.value(forKey: "backendKind") as? String != self.configuration.backendKind {
                    issues.append("Backend kind metadata mismatch")
                }
                if let cloudKit = self.configuration.cloudKit {
                    if !(self.persistentContainer is NSPersistentCloudKitContainer) {
                        issues.append("CloudKit private database unavailable")
                    }
                    let options = self.persistentContainer.persistentStoreDescriptions.first?.cloudKitContainerOptions
                    if options?.containerIdentifier != cloudKit.containerIdentifier {
                        issues.append("CloudKit container identifier mismatch")
                    }
                    if options?.databaseScope != .private {
                        issues.append("CloudKit database scope mismatch")
                    }
                }
            }
        } catch {
            issues.append("Storage access error: \(String(describing: error))")
        }

        return DatafnStorageHealthReport(ok: issues.isEmpty, issues: issues)
    }

    func persistentContainerSnapshotForTesting() -> DatafnPersistentContainerSnapshot {
        persistentContainerSnapshot
    }

    public func searchMetadataSnapshot() throws -> DatafnSearchMetadataSnapshot {
        try ensureOpen()
        return try performSync { context in
            let metadata = try self.fetchNamespaceMetadata(in: context)
            return Self.makeSearchMetadataSnapshot(from: metadata)
        }
    }

    public func setSearchMetadata(_ metadata: DatafnSearchMetadataSnapshot) throws {
        let event = try performMutatingOperation { context in
            let object = try self.fetchNamespaceMetadata(in: context)
            object.setValue(metadata.backendKind, forKey: "searchBackendKind")
            object.setValue(metadata.schemaHash, forKey: "searchSchemaHash")
            object.setValue(metadata.configDigest, forKey: "searchConfigDigest")
            object.setValue(metadata.status.rawValue, forKey: "searchStatus")
            return DatafnStoreEvent(
                name: Self.healthChangedEvent,
                payload: [
                    "searchStatus": .string(metadata.status.rawValue),
                ]
            )
        }
        emit(event)
    }

    private func bootstrapStore() throws {
        try performSync { context in
            try self.ensureNamespaceMetadata(in: context)
            if context.hasChanges {
                try context.save()
            }
        }
    }

    private func performSync<T>(
        _ work: @escaping (NSManagedObjectContext) throws -> T
    ) throws -> T {
        var result: Result<T, Error>!
        context.performAndWait {
            result = Result {
                try work(context)
            }
        }
        return try result.get()
    }

    private func performMutatingOperation<T>(
        _ work: @escaping (NSManagedObjectContext) throws -> T
    ) throws -> T {
        try ensureOpen()
        return try performSync { context in
            let value = try work(context)
            if context.hasChanges {
                try context.save()
            }
            return value
        }
    }

    private func emit(_ event: DatafnStoreEvent) {
        observerLock.lock()
        let currentObservers = Array(observers.values)
        observerLock.unlock()

        for observer in currentObservers {
            observer(event)
        }
    }

    private func ensureOpen() throws {
        stateLock.lock()
        let closed = isClosed
        stateLock.unlock()

        if closed {
            throw DatafnCoreDataStoreError.storeClosed
        }
    }

    private func validateResource(_ resource: String) throws {
        if !validResources.contains(resource) {
            throw DatafnCoreDataStoreError.unknownResource(resource)
        }
    }

    private func validateCursorScope(_ resource: String) throws {
        if resource == Self.globalCursorKey || resource == Self.actorFeedCursorKey {
            return
        }
        if validResources.contains(resource) || validRelationKeys.contains(resource) {
            return
        }
        throw DatafnCoreDataStoreError.unknownResource(resource)
    }

    private func entityName(forResource resource: String) throws -> String {
        try validateResource(resource)
        guard let entityName = resourceEntities[resource] else {
            throw DatafnCoreDataStoreError.unknownResource(resource)
        }
        return entityName
    }

    private func entityName(forRelationKey relationKey: String) throws -> String {
        guard let entityName = relationEntities[relationKey], validRelationKeys.contains(relationKey) else {
            throw DatafnCoreDataStoreError.unknownRelationKey(relationKey)
        }
        return entityName
    }

    private func loadRecord(
        resource: String,
        id: String,
        in context: NSManagedObjectContext
    ) throws -> DatafnJSONObject? {
        if resource == Self.kvResourceName {
            let request = NSFetchRequest<NSManagedObject>(entityName: Self.kvEntityName)
            request.fetchLimit = 1
            request.predicate = NSPredicate(format: "key == %@", id)
            return try context.fetch(request).first.map(Self.decodeKVRecord)
        }

        let request = NSFetchRequest<NSManagedObject>(entityName: try entityName(forResource: resource))
        request.fetchLimit = 1
        request.predicate = NSPredicate(format: "id == %@", id)
        return try context.fetch(request).first.map(Self.decodeRecord)
    }

    private func storeRecord(
        resource: String,
        record: DatafnJSONObject,
        in context: NSManagedObjectContext
    ) throws {
        let id = try Self.requireRecordID(record)

        if resource == Self.kvResourceName {
            let request = NSFetchRequest<NSManagedObject>(entityName: Self.kvEntityName)
            request.fetchLimit = 1
            request.predicate = NSPredicate(format: "key == %@", id)
            let object = try context.fetch(request).first
                ?? NSEntityDescription.insertNewObject(
                    forEntityName: Self.kvEntityName,
                    into: context
                )
            object.setValue(id, forKey: "key")
            object.setValue(try Self.encodeJSONObject(record), forKey: "valueData")
            return
        }

        let entityName = try entityName(forResource: resource)
        let request = NSFetchRequest<NSManagedObject>(entityName: entityName)
        request.fetchLimit = 1
        request.predicate = NSPredicate(format: "id == %@", id)
        let object = try context.fetch(request).first
            ?? NSEntityDescription.insertNewObject(forEntityName: entityName, into: context)
        object.setValue(id, forKey: "id")
        object.setValue(record["version"]?.intValue ?? 0, forKey: "version")
        object.setValue(try Self.encodeJSONObject(record), forKey: "recordData")
    }

    private func deleteRecord(
        resource: String,
        id: String,
        in context: NSManagedObjectContext
    ) throws {
        if resource == Self.kvResourceName {
            let request = NSFetchRequest<NSManagedObject>(entityName: Self.kvEntityName)
            request.fetchLimit = 1
            request.predicate = NSPredicate(format: "key == %@", id)
            if let object = try context.fetch(request).first {
                context.delete(object)
            }
            return
        }

        let request = NSFetchRequest<NSManagedObject>(entityName: try entityName(forResource: resource))
        request.fetchLimit = 1
        request.predicate = NSPredicate(format: "id == %@", id)
        if let object = try context.fetch(request).first {
            context.delete(object)
        }
    }

    private func storeJoinRow(
        relationKey: String,
        row: DatafnJSONObject,
        in context: NSManagedObjectContext
    ) throws {
        let endpoints = try Self.requireJoinEndpoints(row)
        let entityName = try entityName(forRelationKey: relationKey)
        let request = NSFetchRequest<NSManagedObject>(entityName: entityName)
        request.fetchLimit = 1
        request.predicate = NSPredicate(format: "fromID == %@ AND toID == %@", endpoints.from, endpoints.to)
        let object = try context.fetch(request).first
            ?? NSEntityDescription.insertNewObject(forEntityName: entityName, into: context)
        object.setValue(endpoints.from, forKey: "fromID")
        object.setValue(endpoints.to, forKey: "toID")
        object.setValue(try Self.encodeJSONObject(row), forKey: "relationData")
    }

    private func deleteJoinRow(
        relationKey: String,
        from: String,
        to: String,
        in context: NSManagedObjectContext
    ) throws {
        let entityName = try entityName(forRelationKey: relationKey)
        let request = NSFetchRequest<NSManagedObject>(entityName: entityName)
        request.fetchLimit = 1
        request.predicate = NSPredicate(format: "fromID == %@ AND toID == %@", from, to)
        if let object = try context.fetch(request).first {
            context.delete(object)
        }
    }

    private func fetchCursorState(
        resource: String,
        in context: NSManagedObjectContext
    ) throws -> NSManagedObject? {
        let request = NSFetchRequest<NSManagedObject>(entityName: Self.cursorEntityName)
        request.fetchLimit = 1
        request.predicate = NSPredicate(format: "resourceName == %@", resource)
        return try context.fetch(request).first
    }

    private func fetchHydrationState(
        resource: String,
        in context: NSManagedObjectContext
    ) throws -> NSManagedObject? {
        let request = NSFetchRequest<NSManagedObject>(entityName: Self.hydrationEntityName)
        request.fetchLimit = 1
        request.predicate = NSPredicate(format: "resourceName == %@", resource)
        return try context.fetch(request).first
    }

    private func currentHydrationState(
        resource: String,
        in context: NSManagedObjectContext
    ) throws -> DatafnHydrationState {
        try validateResource(resource)

        guard
            let object = try fetchHydrationState(resource: resource, in: context),
            let rawValue = object.value(forKey: "state") as? String,
            let state = DatafnHydrationState(rawValue: rawValue)
        else {
            return .notStarted
        }

        return state
    }

    private func ensureNamespaceMetadata(
        in context: NSManagedObjectContext
    ) throws {
        let request = NSFetchRequest<NSManagedObject>(entityName: Self.namespaceMetadataEntityName)
        request.fetchLimit = 1
        request.predicate = NSPredicate(format: "namespace == %@", configuration.namespace)
        let object = try context.fetch(request).first
            ?? NSEntityDescription.insertNewObject(
                forEntityName: Self.namespaceMetadataEntityName,
                into: context
            )
        if
            let existingBackendKind = object.value(forKey: "backendKind") as? String,
            !existingBackendKind.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
            existingBackendKind != configuration.backendKind
        {
            throw DatafnCoreDataStoreError.backendKindConflict(
                existing: existingBackendKind,
                requested: configuration.backendKind
            )
        }
        object.setValue(configuration.namespace, forKey: "namespace")
        object.setValue(configuration.schemaHash, forKey: "schemaHash")
        object.setValue(configuration.clientID, forKey: "clientID")
        object.setValue(configuration.backendKind, forKey: "backendKind")
        if object.value(forKey: "searchStatus") == nil {
            object.setValue(DatafnSearchMetadataStatus.unavailable.rawValue, forKey: "searchStatus")
        }
        if object.value(forKey: "lastChangelogSequence") == nil {
            object.setValue(0, forKey: "lastChangelogSequence")
        }
    }

    private func fetchNamespaceMetadata(
        in context: NSManagedObjectContext
    ) throws -> NSManagedObject {
        let request = NSFetchRequest<NSManagedObject>(entityName: Self.namespaceMetadataEntityName)
        request.fetchLimit = 1
        request.predicate = NSPredicate(format: "namespace == %@", configuration.namespace)
        guard let metadata = try context.fetch(request).first else {
            throw DatafnCoreDataStoreError.namespaceMetadataMissing
        }
        return metadata
    }

    private static func decodeRecord(_ object: NSManagedObject) throws -> DatafnJSONObject {
        guard let data = object.value(forKey: "recordData") as? Data else {
            throw DatafnCoreDataStoreError.recordDecodingFailed
        }
        return try decodeJSONObject(from: data)
    }

    private static func decodeKVRecord(_ object: NSManagedObject) throws -> DatafnJSONObject {
        guard let data = object.value(forKey: "valueData") as? Data else {
            throw DatafnCoreDataStoreError.recordDecodingFailed
        }
        return try decodeJSONObject(from: data)
    }

    private static func decodeJoinRow(_ object: NSManagedObject) throws -> DatafnJSONObject {
        guard let data = object.value(forKey: "relationData") as? Data else {
            throw DatafnCoreDataStoreError.recordDecodingFailed
        }
        return try decodeJSONObject(from: data)
    }

    private static func decodeJSONObject(from data: Data) throws -> DatafnJSONObject {
        let decoder = JSONDecoder()
        return try decoder.decode(DatafnJSONObject.self, from: data)
    }

    private static func makeSearchMetadataSnapshot(from metadata: NSManagedObject) -> DatafnSearchMetadataSnapshot {
        DatafnSearchMetadataSnapshot(
            backendKind: metadata.value(forKey: "searchBackendKind") as? String,
            schemaHash: metadata.value(forKey: "searchSchemaHash") as? String,
            configDigest: metadata.value(forKey: "searchConfigDigest") as? String,
            status: {
                guard
                    let rawValue = metadata.value(forKey: "searchStatus") as? String,
                    let status = DatafnSearchMetadataStatus(rawValue: rawValue)
                else {
                    return .unavailable
                }
                return status
            }()
        )
    }

    private static func deepMergeOneLevel(
        base: DatafnJSONObject,
        patch: DatafnJSONObject,
        forcedID: String
    ) -> DatafnJSONObject {
        var merged = base
        for (key, patchValue) in patch {
            if
                case .object(let patchObject) = patchValue,
                case .object(let baseObject) = merged[key]
            {
                merged[key] = .object(baseObject.merging(patchObject) { _, new in new })
            } else {
                merged[key] = patchValue
            }
        }
        merged["id"] = .string(forcedID)
        return merged
    }

    private static func validateHydrationTransition(
        from: DatafnHydrationState,
        to: DatafnHydrationState
    ) throws {
        if from == to { return }
        if from == .notStarted && to == .hydrating { return }
        if from == .hydrating && to == .ready { return }
        if from == .ready && to == .hydrating { return }

        throw DatafnCoreDataStoreError.invalidHydrationTransition(from: from, to: to)
    }

    private static func requireRecordID(_ record: DatafnJSONObject) throws -> String {
        guard let id = record["id"]?.stringValue, !id.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            throw DatafnCoreDataStoreError.recordMissingID
        }
        return id
    }

    private static func requireJoinEndpoints(_ row: DatafnJSONObject) throws -> (from: String, to: String) {
        guard
            let from = row["from"]?.stringValue,
            let to = row["to"]?.stringValue,
            !from.isEmpty,
            !to.isEmpty
        else {
            throw DatafnCoreDataStoreError.joinRowMissingEndpoints
        }

        return (from, to)
    }

    private static func encodeJSONObject(_ value: DatafnJSONObject) throws -> Data {
        let encoder = JSONEncoder()
        return try encoder.encode(value)
    }

    private static func makeStorageChangedEvent(
        resource: String,
        ids: [String]
    ) -> DatafnStoreEvent {
        DatafnStoreEvent(
            name: storageChangedEvent,
            payload: [
                "resource": .string(resource),
                "ids": .array(ids.map(DatafnJSONValue.string)),
            ]
        )
    }

    private static func makeJoinChangedEvent(
        relationKey: String,
        ids: [String]
    ) -> DatafnStoreEvent {
        DatafnStoreEvent(
            name: storageChangedEvent,
            payload: [
                "relationKey": .string(relationKey),
                "ids": .array(ids.map(DatafnJSONValue.string)),
            ]
        )
    }

    private static func makeResourceEntityMap(for schema: DatafnRuntimeSchema) -> [String: String] {
        Dictionary(
            uniqueKeysWithValues: schema.resources
                .filter { $0.isRemoteOnly != true }
                .map { ($0.name, "df_record_\(sanitize($0.name))") }
        )
    }

    private static func makeRelationEntityMap(for schema: DatafnRuntimeSchema) -> [String: String] {
        var mapping: [String: String] = [:]

        for relation in schema.relations where relation.type == .manyMany {
            for target in relation.to.values {
                let relationKey = "join_\(relation.from)_\(relation.name)_\(target)"
                mapping[relationKey] = "df_join_\(sanitize(relation.from))_\(sanitize(relation.name))_\(sanitize(target))"
            }
        }

        return mapping
    }

    private static func sanitize(_ raw: String) -> String {
        let sanitized = raw.unicodeScalars.map { scalar -> Character in
            if CharacterSet.alphanumerics.contains(scalar) {
                return Character(String(scalar).lowercased())
            }
            return "_"
        }

        return String(sanitized)
            .replacingOccurrences(of: "__+", with: "_", options: .regularExpression)
            .trimmingCharacters(in: CharacterSet(charactersIn: "_"))
    }

    private static let kvResourceName = "kv"
    private static let kvEntityName = "df_kv_entry"
    private static let cursorEntityName = "df_cursor_state"
    private static let hydrationEntityName = "df_hydration_state"
    private static let namespaceMetadataEntityName = "df_namespace_metadata"
    private static let changelogEntityName = "df_changelog_entry"
    private static let globalCursorKey = "__global_cursor__"
    private static let actorFeedCursorKey = "__datafn_actor_feed__"
}
