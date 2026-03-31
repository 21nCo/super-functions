import DatafnCoreDataStore
import DatafnWebViewBridgeHost
import Foundation

private struct DatafnServerErrorEnvelope: Codable {
    let code: String
    let message: String
    let details: DatafnJSONObject?
}

private struct DatafnServerEnvelope<Result: Decodable>: Decodable {
    let ok: Bool
    let result: Result?
    let error: DatafnServerErrorEnvelope?
}

private protocol DatafnServerOperationResult: Decodable {
    var ok: Bool { get }
}

private struct DatafnServerBooleanResult: Codable, DatafnServerOperationResult {
    let ok: Bool
}

private struct DatafnServerCloneResult: Codable, DatafnServerOperationResult {
    let ok: Bool
    let data: [String: [DatafnJSONObject]]
    let cursors: [String: String]
    let joins: [String: [DatafnJSONObject]]?
    let next: [String: String?]?
}

private struct DatafnServerJoinDelta: Codable {
    let upsert: [DatafnJSONObject]
    let delete: [DatafnJoinDelete]
}

private struct DatafnJoinDelete: Codable {
    let from: String
    let to: String
}

private struct DatafnServerPullResult: Codable, DatafnServerOperationResult {
    let ok: Bool
    let records: [String: [DatafnJSONObject]]
    let merged: [String: [DatafnJSONObject]]?
    let deleted: [String: [String]]
    let joins: [String: DatafnServerJoinDelta]?
    let cursors: [String: String]
    let hasMore: Bool?
}

private struct DatafnServerReconcileResult: Codable, DatafnServerOperationResult {
    let ok: Bool
    let counts: [String: Int]
    let joinCounts: [String: Int]?
}

public actor DatafnServerSyncEngine {
    private let store: DatafnCoreDataStore
    private let schema: DatafnRuntimeSchema
    private let clientID: String
    private let remoteExecutor: DatafnServerRemoteExecutor

    private var started = false
    private var pushInFlight = false
    private var pullInFlight = false
    private var cloneInFlight = false
    private var reconcileInFlight = false
    private var pushRequested = false
    private var pullRequested = false
    private var websocketConnection: DatafnServerWebSocketConnection?
    private var websocketReceiveTask: Task<Void, Never>?
    private var lastFailure: DatafnBridgeError?

    public init(
        store: DatafnCoreDataStore,
        schema: DatafnRuntimeSchema,
        clientID: String,
        remoteExecutor: DatafnServerRemoteExecutor
    ) {
        self.store = store
        self.schema = schema
        self.clientID = clientID
        self.remoteExecutor = remoteExecutor
    }

    public func start() async throws {
        guard !started else { return }
        started = true
        lastFailure = nil

        do {
            try await connectWebSocketIfNeeded()
            publishStatus([
                "state": .string("running"),
                "action": .string("start"),
                "backend": .string("datafn-server"),
            ])

            if try needsClone() {
                try await cloneNow()
            } else {
                try await pullNow()
            }
        } catch {
            started = false
            websocketReceiveTask?.cancel()
            websocketReceiveTask = nil
            websocketConnection?.cancel()
            websocketConnection = nil
            throw error
        }
    }

    public func stop() async {
        started = false
        websocketReceiveTask?.cancel()
        websocketReceiveTask = nil
        websocketConnection?.cancel()
        websocketConnection = nil

        publishStatus([
            "state": .string("stopped"),
            "action": .string("stop"),
            "backend": .string("datafn-server"),
        ])
    }

    public func pullNow() async throws {
        pullRequested = true
        if pullInFlight { return }
        pullInFlight = true
        defer { pullInFlight = false }

        do {
            var lastResult: DatafnServerPullResult?
            repeat {
                pullRequested = false

                var cursors = try buildPullCursors()
                var hasMore = true
                var iteration = 0

                while hasMore && iteration < 50 {
                    iteration += 1
                    let payload: DatafnJSONObject = [
                        "clientId": .string(clientID),
                        "cursors": .object(cursors.mapValues(DatafnJSONValue.string)),
                        "limit": .number(200),
                        "includeJoins": .bool(true),
                    ]
                    let envelope = try await remoteExecutor.pull(.object(payload))
                    let result: DatafnServerPullResult = try Self.requireResult(
                        from: envelope,
                        as: DatafnServerPullResult.self,
                        fallbackPath: "sync.pull"
                    )
                    try applyPullResult(result)
                    lastResult = result
                    hasMore = result.hasMore == true
                    for (resource, cursor) in result.cursors {
                        cursors[resource] = cursor
                    }
                }
            } while pullRequested

            if let lastResult {
                publishStatus([
                    "state": .string("running"),
                    "action": .string("pullNow"),
                    "backend": .string("datafn-server"),
                    "resources": .array(lastResult.records.keys.sorted().map(DatafnJSONValue.string)),
                ])
            }
            lastFailure = nil
        } catch {
            let mapped = Self.bridgeError(from: error, fallbackPath: "sync.pull")
            lastFailure = mapped
            publishFailure([
                "state": .string("failed"),
                "action": .string("pullNow"),
                "backend": .string("datafn-server"),
                "error": .object(mapped.jsonObject),
            ])
            throw mapped
        }
    }

    public func cloneNow() async throws {
        if cloneInFlight { return }
        cloneInFlight = true
        defer { cloneInFlight = false }
        do {
            let tables = localResourceNames()
            try await cloneResources(tables)
            lastFailure = nil
        } catch {
            let mapped = Self.bridgeError(from: error, fallbackPath: "sync.clone")
            lastFailure = mapped
            publishFailure([
                "state": .string("failed"),
                "action": .string("cloneNow"),
                "backend": .string("datafn-server"),
                "error": .object(mapped.jsonObject),
            ])
            throw mapped
        }
    }

    public func reconcileNow() async throws {
        if reconcileInFlight { return }
        reconcileInFlight = true
        defer { reconcileInFlight = false }
        do {
            let payload: DatafnJSONObject = [
                "clientId": .string(clientID),
                "resources": .array(localResourceNames().map(DatafnJSONValue.string)),
                "includeJoins": .bool(true),
            ]
            let envelope = try await remoteExecutor.reconcile(.object(payload))
            let result: DatafnServerReconcileResult = try Self.requireResult(
                from: envelope,
                as: DatafnServerReconcileResult.self,
                fallbackPath: "sync.reconcile"
            )

            let mismatched = try collectMismatchedResources(reconcileResult: result)
            if !mismatched.isEmpty {
                try await cloneResources(mismatched.sorted())
            }

            publishStatus([
                "state": .string("running"),
                "action": .string("reconcileNow"),
                "backend": .string("datafn-server"),
                "reclonedResources": .array(mismatched.sorted().map(DatafnJSONValue.string)),
            ])
            lastFailure = nil
        } catch {
            let mapped = Self.bridgeError(from: error, fallbackPath: "sync.reconcile")
            lastFailure = mapped
            publishFailure([
                "state": .string("failed"),
                "action": .string("reconcileNow"),
                "backend": .string("datafn-server"),
                "error": .object(mapped.jsonObject),
            ])
            throw mapped
        }
    }

    public func schedulePush() async throws {
        pushRequested = true
        if pushInFlight { return }
        pushInFlight = true
        defer { pushInFlight = false }

        do {
            var lastThroughSeq: Int64?
            var lastPendingCount = 0

            repeat {
                pushRequested = false

                while true {
                    let pending = try store.changelogList(limit: 100)
                    guard let throughSeq = pending.last?.seq else {
                        lastPendingCount = 0
                        break
                    }

                    let payload = DatafnJSONValue.array(pending.map { .object($0.mutation) })
                    let envelope = try await remoteExecutor.push(payload)
                    _ = try Self.requireResult(
                        from: envelope,
                        as: DatafnServerBooleanResult.self,
                        fallbackPath: "sync.push"
                    )
                    try store.changelogAck(throughSeq: throughSeq)
                    lastThroughSeq = throughSeq
                    lastPendingCount = pending.count
                }
            } while pushRequested

            var statusPayload: DatafnJSONObject = [
                "state": .string("running"),
                "action": .string("schedulePush"),
                "backend": .string("datafn-server"),
                "pendingMutations": .number(Double(lastPendingCount))
            ]
            if let lastThroughSeq {
                statusPayload["throughSeq"] = .number(Double(lastThroughSeq))
            }
            publishStatus(statusPayload)
            lastFailure = nil
        } catch {
            let mapped = Self.bridgeError(from: error, fallbackPath: "sync.push")
            lastFailure = mapped
            publishFailure([
                "state": .string("failed"),
                "action": .string("schedulePush"),
                "backend": .string("datafn-server"),
                "error": .object(mapped.jsonObject),
            ])
            throw mapped
        }
    }

    public func healthIssues() -> [DatafnHealthIssue] {
        guard let lastFailure else {
            return []
        }
        return [
            DatafnHealthIssue(
                code: lastFailure.code,
                message: lastFailure.message,
                details: lastFailure.details
            ),
        ]
    }

    private func connectWebSocketIfNeeded() async throws {
        guard websocketConnection == nil else { return }
        guard let connection = try await remoteExecutor.makeWebSocketConnection() else {
            return
        }

        websocketConnection = connection
        connection.resume()

        let helloPayload: DatafnJSONObject = [
            "type": .string("hello"),
            "clientId": .string(clientID),
            "cursors": .object(try buildPullCursors().mapValues(DatafnJSONValue.string)),
        ]
        try await connection.sendString(Self.makeJSONString(from: .object(helloPayload)))

        websocketReceiveTask = Task {
            while !Task.isCancelled {
                do {
                    let message = try await connection.receiveString()
                    await self.handleWebSocketMessage(message)
                } catch {
                    if !Task.isCancelled {
                        await self.handleWebSocketFailure(error)
                    }
                    break
                }
            }
        }
    }

    private func handleWebSocketMessage(_ message: String) async {
        guard
            let data = message.data(using: .utf8),
            let value = try? JSONDecoder().decode(DatafnJSONValue.self, from: data),
            let payload = value.objectValue
        else {
            return
        }

        guard payload["type"]?.stringValue == "cursor" else {
            return
        }

        guard
            let nextCursor = payload["cursor"]?.stringValue,
            let nextValue = Int(nextCursor)
        else {
            return
        }

        let currentCursor = (try? store.getCursor(resource: "__global_cursor__")) ?? "0"
        let currentValue = Int(currentCursor) ?? 0
        if nextValue > currentValue {
            try? await pullNow()
        }
    }

    private func handleWebSocketFailure(_ error: Error) async {
        let mapped = Self.bridgeError(from: error, fallbackPath: "sync.websocket")
        lastFailure = mapped
        publishFailure([
            "state": .string("failed"),
            "action": .string("websocket"),
            "backend": .string("datafn-server"),
            "error": .object(mapped.jsonObject),
        ])
    }

    private func needsClone() throws -> Bool {
        for resource in schema.resources where resource.isRemoteOnly != true {
            if try store.getHydrationState(resource: resource.name) != .ready {
                return true
            }
        }
        return false
    }

    private func buildPullCursors() throws -> [String: String] {
        var cursors: [String: String] = [:]

        for resource in schema.resources where resource.isRemoteOnly != true {
            cursors[resource.name] = try store.getCursor(resource: resource.name) ?? "0"
        }

        for relation in schema.relations where relation.type == .manyMany {
            for target in relation.to.values {
                let relationKey = "join_\(relation.from)_\(relation.name)_\(target)"
                cursors[relationKey] = try store.getCursor(resource: relationKey) ?? "0"
            }
        }

        cursors["__datafn_actor_feed__"] = try store.getCursor(resource: "__datafn_actor_feed__") ?? "0"
        return cursors
    }

    private func localResourceNames() -> [String] {
        schema.resources
            .filter { $0.isRemoteOnly != true }
            .map(\.name)
            .sorted()
    }

    private func localJoinRelationKeys() -> [String] {
        schema.relations
            .filter { $0.type == .manyMany }
            .flatMap { relation in
                relation.to.values.map { "join_\(relation.from)_\(relation.name)_\($0)" }
            }
            .sorted()
    }

    private func cloneResources(_ tables: [String]) async throws {
        if tables.isEmpty {
            publishStatus([
                "state": .string("running"),
                "action": .string("cloneNow"),
                "backend": .string("datafn-server"),
                "resources": .array([]),
            ])
            return
        }

        for table in tables {
            try store.setHydrationState(resource: table, state: .hydrating)
        }

        let payload: DatafnJSONObject = [
            "clientId": .string(clientID),
            "tables": .array(tables.map(DatafnJSONValue.string)),
            "includeJoins": .bool(true),
        ]
        let envelope = try await remoteExecutor.clone(.object(payload))
        let result: DatafnServerCloneResult = try Self.requireResult(
            from: envelope,
            as: DatafnServerCloneResult.self,
            fallbackPath: "sync.clone"
        )
        try applyCloneResult(result, expectedTables: tables)
        publishStatus([
            "state": .string("running"),
            "action": .string("cloneNow"),
            "backend": .string("datafn-server"),
            "resources": .array(tables.sorted().map(DatafnJSONValue.string)),
        ])
    }

    private func applyCloneResult(
        _ result: DatafnServerCloneResult,
        expectedTables: [String]
    ) throws {
        for resource in expectedTables {
            let remoteRecords = result.data[resource] ?? []
            let remoteIDs = Set(remoteRecords.compactMap { $0["id"]?.stringValue })
            let localIDs = try Set(store.listRecords(resource: resource).compactMap { $0["id"]?.stringValue })
            for staleID in localIDs.subtracting(remoteIDs) {
                try store.deleteRecord(resource: resource, id: staleID)
            }
        }

        for (resource, records) in result.data {
            for record in records {
                try store.upsertRecord(resource: resource, record: record)
            }
            if let cursor = result.cursors[resource] {
                try setCursorMonotonically(resource: resource, cursor: cursor)
            }
            if try store.getHydrationState(resource: resource) != .ready {
                try store.setHydrationState(resource: resource, state: .ready)
            }
        }

        for relationKey in localJoinRelationKeys() {
            let remoteRows = result.joins?[relationKey] ?? []
            let remoteEdges = Set(remoteRows.compactMap { row -> String? in
                guard
                    let from = row["from"]?.stringValue,
                    let to = row["to"]?.stringValue
                else {
                    return nil
                }
                return "\(from)->\(to)"
            })
            let localEdges = try Set(store.listJoinRows(relationKey: relationKey).compactMap { row -> String? in
                guard
                    let from = row["from"]?.stringValue,
                    let to = row["to"]?.stringValue
                else {
                    return nil
                }
                return "\(from)->\(to)"
            })
            for staleEdge in localEdges.subtracting(remoteEdges) {
                let parts = staleEdge.split(separator: "->", maxSplits: 1).map(String.init)
                guard parts.count == 2 else { continue }
                try store.deleteJoinRow(relationKey: relationKey, from: parts[0], to: parts[1])
            }
        }

        if let joins = result.joins {
            for (relationKey, rows) in joins {
                for row in rows {
                    try store.upsertJoinRow(relationKey: relationKey, row: row)
                }
                if let cursor = result.cursors[relationKey] {
                    try setCursorMonotonically(resource: relationKey, cursor: cursor)
                }
            }
        }

        for table in expectedTables where !result.data.keys.contains(table) {
            if let cursor = result.cursors[table] {
                try setCursorMonotonically(resource: table, cursor: cursor)
            }
            if try store.getHydrationState(resource: table) != .ready {
                try store.setHydrationState(resource: table, state: .ready)
            }
        }

        for relationKey in localJoinRelationKeys() {
            if let cursor = result.cursors[relationKey] {
                try setCursorMonotonically(resource: relationKey, cursor: cursor)
            }
        }

        try updateGlobalCursor(from: result.cursors)
    }

    private func applyPullResult(_ result: DatafnServerPullResult) throws {
        for (resource, records) in result.records {
            for record in records {
                try store.upsertRecord(resource: resource, record: record)
            }
        }

        if let merged = result.merged {
            for (resource, records) in merged {
                for record in records {
                    guard let id = record["id"]?.stringValue else { continue }
                    _ = try store.mergeRecord(resource: resource, id: id, partial: record)
                }
            }
        }

        for (resource, ids) in result.deleted {
            for id in ids {
                try store.deleteRecord(resource: resource, id: id)
            }
        }

        if let joins = result.joins {
            for (relationKey, delta) in joins {
                for row in delta.upsert {
                    try store.upsertJoinRow(relationKey: relationKey, row: row)
                }
                for edge in delta.delete {
                    try store.deleteJoinRow(relationKey: relationKey, from: edge.from, to: edge.to)
                }
            }
        }

        for (resource, cursor) in result.cursors {
            try setCursorMonotonically(resource: resource, cursor: cursor)
        }
        try updateGlobalCursor(from: result.cursors)
    }

    private func collectMismatchedResources(
        reconcileResult: DatafnServerReconcileResult
    ) throws -> Set<String> {
        var mismatched: Set<String> = []

        for resource in localResourceNames() {
            if try store.countRecords(resource: resource) != (reconcileResult.counts[resource] ?? 0) {
                mismatched.insert(resource)
            }
        }

        if let joinCounts = reconcileResult.joinCounts {
            for relation in schema.relations where relation.type == .manyMany {
                for target in relation.to.values {
                    let relationKey = "join_\(relation.from)_\(relation.name)_\(target)"
                    let localCount = try store.countJoinRows(relationKey: relationKey)
                    if localCount != (joinCounts[relationKey] ?? 0) {
                        mismatched.insert(relation.from)
                        mismatched.insert(target)
                    }
                }
            }
        }

        return mismatched
    }

    private func setCursorMonotonically(resource: String, cursor: String) throws {
        let existing = try store.getCursor(resource: resource)
        if
            let existing,
            let existingValue = Int(existing),
            let nextValue = Int(cursor),
            nextValue < existingValue
        {
            throw DatafnBridgeError(
                code: "DFQL_INVALID",
                message: "Cursor regression detected",
                details: ["path": .string("cursors.\(resource)")]
            )
        }
        try store.setCursor(resource: resource, cursor: cursor)
    }

    private func updateGlobalCursor(from cursors: [String: String]) throws {
        let maxCursor = cursors.values.compactMap(Int.init).max() ?? 0
        if maxCursor > 0 {
            try setCursorMonotonically(resource: "__global_cursor__", cursor: String(maxCursor))
        }
    }

    private func publishStatus(_ payload: DatafnJSONObject) {
        store.publishSyncStatus(payload)
    }

    private func publishFailure(_ payload: DatafnJSONObject) {
        store.publishSyncFailure(payload)
    }

    private static func requireResult<Result: DatafnServerOperationResult>(
        from envelopeValue: DatafnJSONValue,
        as type: Result.Type,
        fallbackPath: String
    ) throws -> Result {
        let envelope = try decode(envelopeValue, as: DatafnServerEnvelope<Result>.self)
        if envelope.ok, let result = envelope.result, result.ok {
            return result
        }

        if let error = envelope.error {
            throw DatafnBridgeError(
                code: error.code,
                message: error.message,
                details: error.details
            )
        }

        if envelope.ok, let result = envelope.result, !result.ok {
            throw DatafnBridgeError(
                code: "TRANSPORT_ERROR",
                message: "DataFn server sync failed",
                details: ["path": .string(fallbackPath)]
            )
        }

        throw DatafnBridgeError(
            code: "TRANSPORT_ERROR",
            message: "DataFn server sync failed",
            details: ["path": .string(fallbackPath)]
        )
    }

    private static func bridgeError(
        from error: Error,
        fallbackPath: String
    ) -> DatafnBridgeError {
        if let bridgeError = error as? DatafnBridgeError {
            return bridgeError
        }
        return DatafnBridgeError(
            code: "TRANSPORT_ERROR",
            message: "DataFn server sync failed",
            details: ["path": .string(fallbackPath)]
        )
    }

    private static func decode<T: Decodable>(
        _ value: DatafnJSONValue,
        as type: T.Type
    ) throws -> T {
        let data = try JSONEncoder().encode(value)
        return try JSONDecoder().decode(T.self, from: data)
    }

    private static func makeJSONString(from value: DatafnJSONValue) throws -> String {
        let foundationValue = value.foundationValue()
        if foundationValue is NSNull {
            return "null"
        }
        let data = try JSONSerialization.data(withJSONObject: foundationValue)
        return String(decoding: data, as: UTF8.self)
    }
}
