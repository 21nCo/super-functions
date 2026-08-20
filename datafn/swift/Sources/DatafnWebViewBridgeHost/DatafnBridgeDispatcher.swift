import DatafnCloudKitSync
import DatafnCoreDataStore
import DatafnSearchContracts
import Foundation

public let DATAFN_BRIDGE_PROTOCOL = "datafn-bridge/v1"

public let DATAFN_BRIDGE_METHODS: [String] = [
    "handshake",
    "search.initialize",
    "search.search",
    "search.searchAll",
    "search.dispose",
    "storage.getRecord",
    "storage.listRecords",
    "storage.upsertRecord",
    "storage.deleteRecord",
    "storage.mergeRecord",
    "storage.findRecords",
    "storage.listJoinRows",
    "storage.getJoinRows",
    "storage.getJoinRowsInverse",
    "storage.upsertJoinRow",
    "storage.setJoinRows",
    "storage.deleteJoinRow",
    "storage.getCursor",
    "storage.setCursor",
    "storage.getHydrationState",
    "storage.setHydrationState",
    "storage.changelogAppend",
    "storage.changelogList",
    "storage.changelogAck",
    "storage.countRecords",
    "storage.countJoinRows",
    "storage.clearAll",
    "storage.close",
    "storage.healthCheck",
    "remote.query",
    "remote.mutation",
    "remote.transact",
    "remote.seed",
    "remote.clone",
    "remote.pull",
    "remote.push",
    "remote.reconcile",
    "sync.start",
    "sync.stop",
    "sync.pullNow",
    "sync.cloneNow",
    "sync.reconcileNow",
    "sync.schedulePush",
    "health.check",
]

public let DATAFN_BRIDGE_EVENT_NAMES: [String] = [
    DatafnCoreDataStore.bridgeReadyEvent,
    DatafnCoreDataStore.bridgeClosedEvent,
    DatafnCoreDataStore.storageChangedEvent,
    DatafnCoreDataStore.hydrationChangedEvent,
    DatafnCoreDataStore.mutationAppliedEvent,
    DatafnCoreDataStore.mutationRejectedEvent,
    DatafnCoreDataStore.syncStatusEvent,
    DatafnCoreDataStore.syncFailedEvent,
    DatafnCoreDataStore.healthChangedEvent,
]

public struct DatafnBridgeError: Codable, Equatable, Sendable, Error {
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

public struct DatafnBridgeRequestEnvelope: Codable, Equatable, Sendable {
    public let protocolVersion: String
    public let id: String
    public let method: String
    public let payload: DatafnJSONValue?

    enum CodingKeys: String, CodingKey {
        case protocolVersion = "protocol"
        case id
        case method
        case payload
    }

    public init(
        protocolVersion: String = DATAFN_BRIDGE_PROTOCOL,
        id: String,
        method: String,
        payload: DatafnJSONValue? = nil
    ) {
        self.protocolVersion = protocolVersion
        self.id = id
        self.method = method
        self.payload = payload
    }
}

public struct DatafnBridgeResponseEnvelope: Codable, Equatable, Sendable {
    public let protocolVersion: String
    public let id: String
    public let ok: Bool
    public let result: DatafnJSONValue?
    public let error: DatafnBridgeError?

    enum CodingKeys: String, CodingKey {
        case protocolVersion = "protocol"
        case id
        case ok
        case result
        case error
    }

    public static func success(id: String, result: DatafnJSONValue = .null) -> Self {
        Self(
            protocolVersion: DATAFN_BRIDGE_PROTOCOL,
            id: id,
            ok: true,
            result: result,
            error: nil
        )
    }

    public static func failure(id: String, error: DatafnBridgeError) -> Self {
        Self(
            protocolVersion: DATAFN_BRIDGE_PROTOCOL,
            id: id,
            ok: false,
            result: nil,
            error: error
        )
    }
}

public struct DatafnBridgeEventEnvelope: Codable, Equatable, Sendable {
    public let protocolVersion: String
    public let event: String
    public let payload: DatafnJSONValue

    enum CodingKeys: String, CodingKey {
        case protocolVersion = "protocol"
        case event
        case payload
    }

    public init(
        protocolVersion: String = DATAFN_BRIDGE_PROTOCOL,
        event: String,
        payload: DatafnJSONValue = .object([:])
    ) {
        self.protocolVersion = protocolVersion
        self.event = event
        self.payload = payload
    }
}

public struct DatafnBridgeHealthReport: Codable, Equatable, Sendable {
    public let mode: String
    public let storageBackend: String
    public let syncOwner: String
    public let remoteMode: String
    public let issues: [DatafnHealthIssue]

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

    public var jsonObject: DatafnJSONObject {
        [
            "mode": .string(mode),
            "storageBackend": .string(storageBackend),
            "syncOwner": .string(syncOwner),
            "remoteMode": .string(remoteMode),
            "issues": .array(issues.map { .object($0.jsonObject) }),
        ]
    }
}

public struct DatafnBridgeRemoteHandlers: @unchecked Sendable {
    public typealias Handler = @Sendable (DatafnJSONValue?) async throws -> DatafnJSONValue

    public let isAvailable: Bool
    public let query: Handler
    public let mutation: Handler
    public let transact: Handler
    public let seed: Handler
    public let clone: Handler
    public let pull: Handler
    public let push: Handler
    public let reconcile: Handler

    public init(
        isAvailable: Bool = true,
        query: @escaping Handler,
        mutation: @escaping Handler,
        transact: @escaping Handler,
        seed: @escaping Handler,
        clone: @escaping Handler,
        pull: @escaping Handler,
        push: @escaping Handler,
        reconcile: @escaping Handler
    ) {
        self.isAvailable = isAvailable
        self.query = query
        self.mutation = mutation
        self.transact = transact
        self.seed = seed
        self.clone = clone
        self.pull = pull
        self.push = push
        self.reconcile = reconcile
    }

    public static func unsupported(
        message: String = "Native remote handler is unavailable"
    ) -> Self {
        let handler: Handler = { _ in
            throw DatafnBridgeError(
                code: "DFQL_UNSUPPORTED",
                message: message,
                details: ["path": "method"]
            )
        }

        return Self(
            isAvailable: false,
            query: handler,
            mutation: handler,
            transact: handler,
            seed: handler,
            clone: handler,
            pull: handler,
            push: handler,
            reconcile: handler
        )
    }
}

public struct DatafnBridgeSyncHandlers: @unchecked Sendable {
    public typealias VoidHandler = @Sendable () async throws -> Void

    public let isAvailable: Bool
    public let start: VoidHandler
    public let stop: VoidHandler
    public let pullNow: VoidHandler
    public let cloneNow: VoidHandler
    public let reconcileNow: VoidHandler
    public let schedulePush: VoidHandler

    public init(
        isAvailable: Bool = true,
        start: @escaping VoidHandler,
        stop: @escaping VoidHandler,
        pullNow: @escaping VoidHandler,
        cloneNow: @escaping VoidHandler,
        reconcileNow: @escaping VoidHandler,
        schedulePush: @escaping VoidHandler
    ) {
        self.isAvailable = isAvailable
        self.start = start
        self.stop = stop
        self.pullNow = pullNow
        self.cloneNow = cloneNow
        self.reconcileNow = reconcileNow
        self.schedulePush = schedulePush
    }

    public static func noOp() -> Self {
        let handler: VoidHandler = {}
        return Self(
            isAvailable: false,
            start: handler,
            stop: handler,
            pullNow: handler,
            cloneNow: handler,
            reconcileNow: handler,
            schedulePush: handler
        )
    }
}

public struct DatafnBridgeSearchHandlers: @unchecked Sendable {
    public typealias InitializeHandler = @Sendable (DatafnSearchInitializeRequest) async throws -> Void
    public typealias SearchHandler = @Sendable (DatafnSearchRequest) async throws -> [String]
    public typealias SearchAllHandler = @Sendable (DatafnSearchAllRequest) async throws -> [DatafnSearchAllResult]
    public typealias DisposeHandler = @Sendable () async -> Void

    public let initialize: InitializeHandler
    public let search: SearchHandler
    public let searchAll: SearchAllHandler
    public let dispose: DisposeHandler

    public init(
        initialize: @escaping InitializeHandler,
        search: @escaping SearchHandler,
        searchAll: @escaping SearchAllHandler,
        dispose: @escaping DisposeHandler
    ) {
        self.initialize = initialize
        self.search = search
        self.searchAll = searchAll
        self.dispose = dispose
    }
}

public struct DatafnBridgeConfiguration: Sendable, Equatable {
    public let schemaHash: String
    public let namespace: String
    public let remoteMode: String
    public let remoteProfile: String?

    public init(
        schemaHash: String,
        namespace: String,
        remoteMode: String,
        remoteProfile: String? = nil
    ) {
        self.schemaHash = schemaHash
        self.namespace = namespace
        self.remoteMode = remoteMode
        self.remoteProfile = remoteProfile
    }
}

public final class DatafnBridgeDispatcher: @unchecked Sendable {
    private let configuration: DatafnBridgeConfiguration
    private let storage: DatafnCoreDataStore
    private let eventEmitter: DatafnBridgeEventEmitter
    private let remoteHandlers: DatafnBridgeRemoteHandlers
    private let searchHandlers: DatafnBridgeSearchHandlers?
    private let syncHandlers: DatafnBridgeSyncHandlers
    private let healthReportProvider: @Sendable () async -> DatafnBridgeHealthReport
    private let supportedMethods = Set(DATAFN_BRIDGE_METHODS)

    public init(
        configuration: DatafnBridgeConfiguration,
        storage: DatafnCoreDataStore,
        eventEmitter: DatafnBridgeEventEmitter,
        remoteHandlers: DatafnBridgeRemoteHandlers = .unsupported(),
        searchHandlers: DatafnBridgeSearchHandlers? = nil,
        syncHandlers: DatafnBridgeSyncHandlers = .noOp(),
        healthReportProvider: @escaping @Sendable () async -> DatafnBridgeHealthReport
    ) {
        self.configuration = configuration
        self.storage = storage
        self.eventEmitter = eventEmitter
        self.remoteHandlers = remoteHandlers
        self.searchHandlers = searchHandlers
        self.syncHandlers = syncHandlers
        self.healthReportProvider = healthReportProvider
    }

    public func dispatch(rawMessage: Any) async -> DatafnBridgeResponseEnvelope {
        let requestID = Self.extractRequestID(from: rawMessage)

        do {
            let request = try Self.decodeRequest(from: rawMessage)

            guard request.protocolVersion == DATAFN_BRIDGE_PROTOCOL else {
                throw DatafnBridgeError(
                    code: "BRIDGE_PROTOCOL_MISMATCH",
                    message: "Bridge protocol version mismatch",
                    details: ["path": "protocol"]
                )
            }

            guard supportedMethods.contains(request.method) else {
                throw DatafnBridgeError(
                    code: "BRIDGE_METHOD_UNSUPPORTED",
                    message: "Unsupported bridge method",
                    details: [
                        "path": "method",
                        "method": .string(request.method),
                    ]
                )
            }

            let result = try await handle(request)
            return .success(id: request.id, result: result)
        } catch let error as DatafnBridgeError {
            return .failure(id: requestID, error: error)
        } catch {
            return .failure(
                id: requestID,
                error: Self.mapError(error)
            )
        }
    }

    private func handle(_ request: DatafnBridgeRequestEnvelope) async throws -> DatafnJSONValue {
        switch request.method {
        case "handshake":
            return try await handleHandshake(request)

        case "search.initialize":
            guard let searchHandlers else {
                throw DatafnBridgeError(
                    code: DATAFN_NATIVE_SEARCH_UNAVAILABLE,
                    message: "Native search backend is unavailable",
                    details: ["path": "search.state"]
                )
            }
            let payload = try requireObjectPayload(request, path: "payload")
            let resources = try requireObjectArray(payload, key: "resources", path: "payload.resources")
                .enumerated()
                .map { index, resource in
                    DatafnSearchResourceConfiguration(
                        name: try requireString(resource, key: "name", path: "payload.resources[\(index)].name"),
                        searchFields: try requireStringArray(
                            resource,
                            key: "searchFields",
                            path: "payload.resources[\(index)].searchFields"
                        )
                    )
                }
            try await searchHandlers.initialize(DatafnSearchInitializeRequest(resources: resources))
            return .object(["initialized": .bool(true)])

        case "search.search":
            guard let searchHandlers else {
                throw DatafnBridgeError(
                    code: DATAFN_NATIVE_SEARCH_UNAVAILABLE,
                    message: "Native search backend is unavailable",
                    details: ["path": "search.state"]
                )
            }
            let payload = try requireObjectPayload(request, path: "payload")
            let result = try await searchHandlers.search(
                DatafnSearchRequest(
                    resource: try requireString(payload, key: "resource", path: "payload.resource"),
                    query: try requireString(payload, key: "query", path: "payload.query"),
                    type: try decodeSearchType(payload["type"], path: "payload.type"),
                    fields: try optionalStringArray(payload, key: "fields", path: "payload.fields"),
                    limit: try optionalInt(payload, key: "limit", path: "payload.limit"),
                    prefix: try optionalBool(payload, key: "prefix", path: "payload.prefix"),
                    fuzzy: try decodeFuzzy(payload["fuzzy"], path: "payload.fuzzy"),
                    fieldBoosts: try optionalFieldBoosts(payload, key: "fieldBoosts", path: "payload.fieldBoosts")
                )
            )
            return .object(["ids": .array(result.map(DatafnJSONValue.string))])

        case "search.searchAll":
            guard let searchHandlers else {
                throw DatafnBridgeError(
                    code: DATAFN_NATIVE_SEARCH_UNAVAILABLE,
                    message: "Native search backend is unavailable",
                    details: ["path": "search.state"]
                )
            }
            let payload = try requireObjectPayload(request, path: "payload")
            let result = try await searchHandlers.searchAll(
                DatafnSearchAllRequest(
                    query: try requireString(payload, key: "query", path: "payload.query"),
                    resources: try optionalStringArray(payload, key: "resources", path: "payload.resources"),
                    fields: try optionalStringArray(payload, key: "fields", path: "payload.fields"),
                    limit: try optionalInt(payload, key: "limit", path: "payload.limit"),
                    limitPerResource: try optionalInt(
                        payload,
                        key: "limitPerResource",
                        path: "payload.limitPerResource"
                    ),
                    prefix: try optionalBool(payload, key: "prefix", path: "payload.prefix"),
                    fuzzy: try decodeFuzzy(payload["fuzzy"], path: "payload.fuzzy"),
                    fieldBoosts: try optionalFieldBoosts(payload, key: "fieldBoosts", path: "payload.fieldBoosts")
                )
            )
            return .object([
                "results": .array(result.map {
                    DatafnJSONValue.object([
                        "resource": .string($0.resource),
                        "id": .string($0.id),
                        "score": .number($0.score),
                    ])
                }),
            ])

        case "search.dispose":
            await searchHandlers?.dispose()
            return .null

        case "storage.getRecord":
            let payload = try requireObjectPayload(request, path: "payload")
            let resource = try requireString(payload, key: "resource", path: "payload.resource")
            let id = try requireString(payload, key: "id", path: "payload.id")
            if let record = try storage.getRecord(resource: resource, id: id) {
                return .object(record)
            }
            return .null

        case "storage.listRecords":
            let payload = try requireObjectPayload(request, path: "payload")
            let resource = try requireString(payload, key: "resource", path: "payload.resource")
            return .array(try storage.listRecords(resource: resource).map(DatafnJSONValue.object))

        case "storage.upsertRecord":
            let payload = try requireObjectPayload(request, path: "payload")
            let resource = try requireString(payload, key: "resource", path: "payload.resource")
            let record = try requireObject(payload, key: "record", path: "payload.record")
            try storage.upsertRecord(resource: resource, record: record)
            return .null

        case "storage.deleteRecord":
            let payload = try requireObjectPayload(request, path: "payload")
            let resource = try requireString(payload, key: "resource", path: "payload.resource")
            let id = try requireString(payload, key: "id", path: "payload.id")
            try storage.deleteRecord(resource: resource, id: id)
            return .null

        case "storage.mergeRecord":
            let payload = try requireObjectPayload(request, path: "payload")
            let resource = try requireString(payload, key: "resource", path: "payload.resource")
            let id = try requireString(payload, key: "id", path: "payload.id")
            let partial = try requireObject(payload, key: "partial", path: "payload.partial")
            let ifMissing = payload["options"]?.objectValue?["ifMissing"]?.objectValue
            return .object(try storage.mergeRecord(
                resource: resource,
                id: id,
                partial: partial,
                ifMissing: ifMissing
            ))

        case "storage.findRecords":
            let payload = try requireObjectPayload(request, path: "payload")
            let resource = try requireString(payload, key: "resource", path: "payload.resource")
            let field = try requireString(payload, key: "field", path: "payload.field")
            let value = try requireValue(payload, key: "value", path: "payload.value")
            return .array(try storage.findRecords(resource: resource, field: field, value: value).map(DatafnJSONValue.object))

        case "storage.listJoinRows":
            let payload = try requireObjectPayload(request, path: "payload")
            let relationKey = try requireString(payload, key: "relationKey", path: "payload.relationKey")
            return .array(try storage.listJoinRows(relationKey: relationKey).map(DatafnJSONValue.object))

        case "storage.getJoinRows":
            let payload = try requireObjectPayload(request, path: "payload")
            let relationKey = try requireString(payload, key: "relationKey", path: "payload.relationKey")
            let fromId = try requireString(payload, key: "fromId", path: "payload.fromId")
            return .array(try storage.getJoinRows(relationKey: relationKey, fromId: fromId).map(DatafnJSONValue.object))

        case "storage.getJoinRowsInverse":
            let payload = try requireObjectPayload(request, path: "payload")
            let relationKey = try requireString(payload, key: "relationKey", path: "payload.relationKey")
            let toId = try requireString(payload, key: "toId", path: "payload.toId")
            return .array(try storage.getJoinRowsInverse(relationKey: relationKey, toId: toId).map(DatafnJSONValue.object))

        case "storage.upsertJoinRow":
            let payload = try requireObjectPayload(request, path: "payload")
            let relationKey = try requireString(payload, key: "relationKey", path: "payload.relationKey")
            let row = try requireObject(payload, key: "row", path: "payload.row")
            try storage.upsertJoinRow(relationKey: relationKey, row: row)
            return .null

        case "storage.setJoinRows":
            let payload = try requireObjectPayload(request, path: "payload")
            let relationKey = try requireString(payload, key: "relationKey", path: "payload.relationKey")
            let rows = try requireObjectArray(payload, key: "rows", path: "payload.rows")
            try storage.setJoinRows(relationKey: relationKey, rows: rows)
            return .null

        case "storage.deleteJoinRow":
            let payload = try requireObjectPayload(request, path: "payload")
            let relationKey = try requireString(payload, key: "relationKey", path: "payload.relationKey")
            let from = try requireString(payload, key: "from", path: "payload.from")
            let to = try requireString(payload, key: "to", path: "payload.to")
            try storage.deleteJoinRow(relationKey: relationKey, from: from, to: to)
            return .null

        case "storage.getCursor":
            let payload = try requireObjectPayload(request, path: "payload")
            let resource = try requireString(payload, key: "resource", path: "payload.resource")
            if let cursor = try storage.getCursor(resource: resource) {
                return .string(cursor)
            }
            return .null

        case "storage.setCursor":
            let payload = try requireObjectPayload(request, path: "payload")
            let resource = try requireString(payload, key: "resource", path: "payload.resource")
            let cursor = payload["cursor"]?.stringValue
            try storage.setCursor(resource: resource, cursor: cursor)
            return .null

        case "storage.getHydrationState":
            let payload = try requireObjectPayload(request, path: "payload")
            let resource = try requireString(payload, key: "resource", path: "payload.resource")
            return .string(try storage.getHydrationState(resource: resource).rawValue)

        case "storage.setHydrationState":
            let payload = try requireObjectPayload(request, path: "payload")
            let resource = try requireString(payload, key: "resource", path: "payload.resource")
            let stateRaw = try requireString(payload, key: "state", path: "payload.state")
            guard let state = DatafnHydrationState(rawValue: stateRaw) else {
                throw DatafnBridgeError(
                    code: "DFQL_INVALID",
                    message: "Invalid hydration state",
                    details: ["path": "payload.state"]
                )
            }
            try storage.setHydrationState(resource: resource, state: state)
            return .null

        case "storage.changelogAppend":
            let payload = try requireObjectPayload(request, path: "payload")
            let entryObject = try requireObject(payload, key: "entry", path: "payload.entry")
            let entry = try Self.decode(entryObject, as: DatafnChangelogPendingEntry.self)
            return .object(try storage.changelogAppend(entry: entry).jsonObject)

        case "storage.changelogList":
            let payload = request.payload?.objectValue ?? [:]
            let options = payload["options"]?.objectValue ?? [:]
            let limit = options["limit"]?.intValue ?? 100
            return .array(try storage.changelogList(limit: limit).map { .object($0.jsonObject) })

        case "storage.changelogAck":
            let payload = try requireObjectPayload(request, path: "payload")
            let options = try requireObject(payload, key: "options", path: "payload.options")
            let throughSeq = try requireInt(options, key: "throughSeq", path: "payload.options.throughSeq")
            try storage.changelogAck(throughSeq: Int64(throughSeq))
            return .null

        case "storage.countRecords":
            let payload = try requireObjectPayload(request, path: "payload")
            let resource = try requireString(payload, key: "resource", path: "payload.resource")
            return .number(Double(try storage.countRecords(resource: resource)))

        case "storage.countJoinRows":
            let payload = try requireObjectPayload(request, path: "payload")
            let relationKey = try requireString(payload, key: "relationKey", path: "payload.relationKey")
            return .number(Double(try storage.countJoinRows(relationKey: relationKey)))

        case "storage.clearAll":
            try storage.clearAll()
            return .null

        case "storage.close":
            storage.close()
            return .null

        case "storage.healthCheck":
            return .object(storage.healthCheck().jsonObject)

        case "remote.query":
            return try await remoteHandlers.query(request.payload)
        case "remote.mutation":
            return try await remoteHandlers.mutation(request.payload)
        case "remote.transact":
            return try await remoteHandlers.transact(request.payload)
        case "remote.seed":
            return try await remoteHandlers.seed(request.payload)
        case "remote.clone":
            return try await remoteHandlers.clone(request.payload)
        case "remote.pull":
            return try await remoteHandlers.pull(request.payload)
        case "remote.push":
            return try await remoteHandlers.push(request.payload)
        case "remote.reconcile":
            return try await remoteHandlers.reconcile(request.payload)

        case "sync.start":
            try await syncHandlers.start()
            return .null
        case "sync.stop":
            try await syncHandlers.stop()
            return .null
        case "sync.pullNow":
            try await syncHandlers.pullNow()
            return .null
        case "sync.cloneNow":
            try await syncHandlers.cloneNow()
            return .null
        case "sync.reconcileNow":
            try await syncHandlers.reconcileNow()
            return .null
        case "sync.schedulePush":
            try await syncHandlers.schedulePush()
            return .null

        case "health.check":
            let report = await healthReportProvider()
            let redacted = DatafnBridgeEventEmitter.redact(.object(report.jsonObject))
            guard let object = redacted.objectValue else {
                throw DatafnBridgeError(
                    code: "INTERNAL",
                    message: "Health report could not be serialized",
                    details: ["path": "health.check"]
                )
            }
            return .object(object)

        default:
            throw DatafnBridgeError(
                code: "BRIDGE_METHOD_UNSUPPORTED",
                message: "Unsupported bridge method",
                details: [
                    "path": "method",
                    "method": .string(request.method),
                ]
            )
        }
    }

    private func handleHandshake(
        _ request: DatafnBridgeRequestEnvelope
    ) async throws -> DatafnJSONValue {
        let payload = try requireObjectPayload(request, path: "payload")
        let schemaHash = try requireString(payload, key: "schemaHash", path: "payload.schemaHash")
        let namespace = try requireString(payload, key: "namespace", path: "payload.namespace")
        _ = try requireString(payload, key: "clientId", path: "payload.clientId")
        let remoteMode = try requireString(payload, key: "remoteMode", path: "payload.remoteMode")
        let remoteProfile = payload["remoteProfile"]?.stringValue

        guard schemaHash == configuration.schemaHash else {
            throw DatafnBridgeError(
                code: "BRIDGE_PROTOCOL_MISMATCH",
                message: "Schema hash mismatch",
                details: ["path": "payload.schemaHash"]
            )
        }

        guard namespace == configuration.namespace else {
            throw DatafnBridgeError(
                code: "BRIDGE_PROTOCOL_MISMATCH",
                message: "Namespace mismatch",
                details: ["path": "payload.namespace"]
            )
        }

        guard remoteMode == configuration.remoteMode else {
            throw DatafnBridgeError(
                code: "BRIDGE_PROTOCOL_MISMATCH",
                message: "Remote mode mismatch",
                details: ["path": "payload.remoteMode"]
            )
        }

        if let expectedProfile = configuration.remoteProfile {
            guard remoteProfile == expectedProfile else {
                throw DatafnBridgeError(
                    code: "BRIDGE_PROTOCOL_MISMATCH",
                    message: "Remote profile mismatch",
                    details: ["path": "payload.remoteProfile"]
                )
            }
        }

        let capabilities = [
            searchHandlers == nil ? nil : "search",
            "storage",
            remoteHandlers.isAvailable ? "remote" : nil,
            syncHandlers.isAvailable ? "sync" : nil,
            "events",
            "health",
        ].compactMap { $0 }

        let result: DatafnJSONObject = [
            "bridgeVersion": 1,
            "schemaHash": .string(configuration.schemaHash),
            "namespace": .string(configuration.namespace),
            "storageBackend": .string("coredata"),
            "syncOwner": .string("native"),
            "remoteMode": .string(configuration.remoteMode),
            "indexedDbDisabled": .bool(true),
            "capabilities": .array(capabilities.map(DatafnJSONValue.string)),
        ]

        var handshakeResult = result
        if configuration.remoteMode == "icloud" {
            handshakeResult["cloudKitPrivateOnly"] = .bool(true)
        }

        eventEmitter.emit(
            event: DatafnCoreDataStore.bridgeReadyEvent,
            payload: handshakeResult
        )

        return .object(handshakeResult)
    }

    private static func decodeRequest(from rawMessage: Any) throws -> DatafnBridgeRequestEnvelope {
        if let envelope = rawMessage as? DatafnBridgeRequestEnvelope {
            return envelope
        }

        let jsonObject: Any
        if let value = rawMessage as? DatafnJSONValue {
            jsonObject = value.foundationValue()
        } else {
            jsonObject = rawMessage
        }

        guard JSONSerialization.isValidJSONObject(jsonObject) else {
            throw DatafnBridgeError(
                code: "BRIDGE_METHOD_UNSUPPORTED",
                message: "Only JSON bridge envelopes are supported",
                details: ["path": "payload"]
            )
        }

        let data = try JSONSerialization.data(withJSONObject: jsonObject)
        return try JSONDecoder().decode(DatafnBridgeRequestEnvelope.self, from: data)
    }

    private static func extractRequestID(from rawMessage: Any) -> String {
        if let envelope = rawMessage as? DatafnBridgeRequestEnvelope {
            return envelope.id
        }
        if let dictionary = rawMessage as? [String: Any], let id = dictionary["id"] as? String {
            return id
        }
        if let value = rawMessage as? DatafnJSONValue, let object = value.objectValue, let id = object["id"]?.stringValue {
            return id
        }
        return "__invalid__"
    }

    private static func mapError(_ error: Error) -> DatafnBridgeError {
        if let bridgeError = error as? DatafnBridgeError {
            return bridgeError
        }

        switch error as? DatafnCoreDataStoreError {
        case .storeClosed:
            return DatafnBridgeError(
                code: "BRIDGE_UNAVAILABLE",
                message: "Native bridge store is closed",
                details: ["path": "bridge"]
            )
        case .unknownResource(let resource):
            return DatafnBridgeError(
                code: "DFQL_UNKNOWN_RESOURCE",
                message: "Unknown resource",
                details: [
                    "path": "payload.resource",
                    "resource": .string(resource),
                ]
            )
        case .unknownRelationKey(let relationKey):
            return DatafnBridgeError(
                code: "DFQL_UNKNOWN_RELATION",
                message: "Unknown relation",
                details: [
                    "path": "payload.relationKey",
                    "relationKey": .string(relationKey),
                ]
            )
        case .recordMissingID:
            return DatafnBridgeError(
                code: "DFQL_INVALID",
                message: "record.id is required",
                details: ["path": "payload.record.id"]
            )
        case .joinRowMissingEndpoints:
            return DatafnBridgeError(
                code: "DFQL_INVALID",
                message: "join row from/to is required",
                details: ["path": "payload.row"]
            )
        case .invalidHydrationTransition:
            return DatafnBridgeError(
                code: "DFQL_INVALID",
                message: "Invalid hydration transition",
                details: ["path": "payload.state"]
            )
        case .invalidCursor:
            return DatafnBridgeError(
                code: "DFQL_INVALID",
                message: "Invalid cursor format",
                details: ["path": "payload.cursor"]
            )
        case .invalidMutationField(let field):
            return DatafnBridgeError(
                code: "DFQL_INVALID",
                message: "\(field) is required",
                details: ["path": .string("payload.entry.\(field)")]
            )
        case .invalidMutationTimestamp:
            return DatafnBridgeError(
                code: "DFQL_INVALID",
                message: "timestampMs must be non-negative",
                details: ["path": "payload.entry.timestampMs"]
            )
        default:
            if let cloudKitError = error as? DatafnCloudKitSyncError {
                return DatafnBridgeError(
                    code: cloudKitError.code,
                    message: cloudKitError.message,
                    details: cloudKitError.details
                )
            }
            if let searchError = error as? DatafnSearchError {
                var details: DatafnJSONObject = [:]
                if let path = searchError.details?.path {
                    details["path"] = .string(path)
                }
                if let reason = searchError.details?.reason {
                    details["reason"] = .string(reason)
                }
                if let resource = searchError.details?.resource {
                    details["resource"] = .string(resource)
                }
                return DatafnBridgeError(
                    code: searchError.code,
                    message: searchError.message,
                    details: details.isEmpty ? nil : details
                )
            }
            return DatafnBridgeError(
                code: "INTERNAL",
                message: String(describing: error),
                details: ["path": "bridge"]
            )
        }
    }

    private func decodeSearchType(
        _ value: DatafnJSONValue?,
        path: String
    ) throws -> DatafnSearchQueryType? {
        guard let value else {
            return nil
        }
        guard let rawValue = value.stringValue,
              let queryType = DatafnSearchQueryType(rawValue: rawValue)
        else {
            throw DatafnBridgeError(
                code: "DFQL_INVALID",
                message: "type must be one of fullText or semantic",
                details: ["path": .string(path)]
            )
        }
        return queryType
    }

    private func decodeFuzzy(
        _ value: DatafnJSONValue?,
        path: String
    ) throws -> DatafnSearchFuzzyOption? {
        guard let value else {
            return nil
        }
        if case .bool(let boolValue) = value {
            return boolValue ? .enabled : .disabled
        }
        if let intValue = value.intValue {
            return .distance(intValue)
        }
        throw DatafnBridgeError(
            code: "DFQL_INVALID",
            message: "fuzzy must be a boolean or integer",
            details: ["path": .string(path)]
        )
    }

    private func requireObjectPayload(
        _ request: DatafnBridgeRequestEnvelope,
        path: String
    ) throws -> DatafnJSONObject {
        guard let object = request.payload?.objectValue else {
            throw DatafnBridgeError(
                code: "DFQL_INVALID",
                message: "\(path) must be an object",
                details: ["path": .string(path)]
            )
        }
        return object
    }

    private func requireObject(
        _ object: DatafnJSONObject,
        key: String,
        path: String
    ) throws -> DatafnJSONObject {
        guard let nested = object[key]?.objectValue else {
            throw DatafnBridgeError(
                code: "DFQL_INVALID",
                message: "\(key) must be an object",
                details: ["path": .string(path)]
            )
        }
        return nested
    }

    private func requireObjectArray(
        _ object: DatafnJSONObject,
        key: String,
        path: String
    ) throws -> [DatafnJSONObject] {
        guard let array = object[key]?.arrayValue else {
            throw DatafnBridgeError(
                code: "DFQL_INVALID",
                message: "\(key) must be an array",
                details: ["path": .string(path)]
            )
        }
        return try array.enumerated().map { index, value in
            guard let nested = value.objectValue else {
                throw DatafnBridgeError(
                    code: "DFQL_INVALID",
                    message: "rows[\(index)] must be an object",
                    details: ["path": .string("\(path)[\(index)]")]
                )
            }
            return nested
        }
    }

    private func requireStringArray(
        _ object: DatafnJSONObject,
        key: String,
        path: String
    ) throws -> [String] {
        guard let array = object[key]?.arrayValue else {
            throw DatafnBridgeError(
                code: "DFQL_INVALID",
                message: "\(key) must be an array",
                details: ["path": .string(path)]
            )
        }

        return try array.enumerated().map { index, value in
            guard let stringValue = value.stringValue,
                  !stringValue.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            else {
                throw DatafnBridgeError(
                    code: "DFQL_INVALID",
                    message: "\(key)[\(index)] must be a non-empty string",
                    details: ["path": .string("\(path)[\(index)]")]
                )
            }
            return stringValue
        }
    }

    private func optionalStringArray(
        _ object: DatafnJSONObject,
        key: String,
        path: String
    ) throws -> [String]? {
        guard object[key] != nil else {
            return nil
        }
        return try requireStringArray(object, key: key, path: path)
    }

    private func optionalInt(
        _ object: DatafnJSONObject,
        key: String,
        path: String
    ) throws -> Int? {
        guard let value = object[key] else {
            return nil
        }
        guard let intValue = value.intValue else {
            throw DatafnBridgeError(
                code: "DFQL_INVALID",
                message: "\(key) must be an integer",
                details: ["path": .string(path)]
            )
        }
        return intValue
    }

    private func optionalBool(
        _ object: DatafnJSONObject,
        key: String,
        path: String
    ) throws -> Bool? {
        guard let value = object[key] else {
            return nil
        }
        guard case .bool(let boolValue) = value else {
            throw DatafnBridgeError(
                code: "DFQL_INVALID",
                message: "\(key) must be a boolean",
                details: ["path": .string(path)]
            )
        }
        return boolValue
    }

    private func optionalFieldBoosts(
        _ object: DatafnJSONObject,
        key: String,
        path: String
    ) throws -> [String: Double]? {
        guard let value = object[key] else {
            return nil
        }
        guard let nested = value.objectValue else {
            throw DatafnBridgeError(
                code: "DFQL_INVALID",
                message: "\(key) must be an object",
                details: ["path": .string(path)]
            )
        }
        var result: [String: Double] = [:]
        for (field, value) in nested {
            guard case .number(let numberValue) = value else {
                throw DatafnBridgeError(
                    code: "DFQL_INVALID",
                    message: "\(key).\(field) must be numeric",
                    details: ["path": .string("\(path).\(field)")]
                )
            }
            result[field] = numberValue
        }
        return result
    }

    private func requireString(
        _ object: DatafnJSONObject,
        key: String,
        path: String
    ) throws -> String {
        guard let value = object[key]?.stringValue, !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            throw DatafnBridgeError(
                code: "DFQL_INVALID",
                message: "\(key) is required",
                details: ["path": .string(path)]
            )
        }
        return value
    }

    private func requireInt(
        _ object: DatafnJSONObject,
        key: String,
        path: String
    ) throws -> Int {
        guard let value = object[key]?.intValue else {
            throw DatafnBridgeError(
                code: "DFQL_INVALID",
                message: "\(key) must be an integer",
                details: ["path": .string(path)]
            )
        }
        return value
    }

    private func requireValue(
        _ object: DatafnJSONObject,
        key: String,
        path: String
    ) throws -> DatafnJSONValue {
        guard let value = object[key] else {
            throw DatafnBridgeError(
                code: "DFQL_INVALID",
                message: "\(key) is required",
                details: ["path": .string(path)]
            )
        }
        return value
    }

    private static func decode<T: Decodable>(
        _ object: DatafnJSONObject,
        as type: T.Type
    ) throws -> T {
        let data = try JSONEncoder().encode(object)
        return try JSONDecoder().decode(T.self, from: data)
    }
}
