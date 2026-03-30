import Testing
import CoreData
import DatafnWebViewBridgeHost
@testable import DatafnCoreDataStore
@testable import DatafnServerSync

private final class LockedBox<Value>: @unchecked Sendable {
    private let lock = NSLock()
    private var storage: Value

    init(_ value: Value) {
        self.storage = value
    }

    func withValue<T>(_ transform: (inout Value) -> T) -> T {
        lock.lock()
        defer { lock.unlock() }
        return transform(&storage)
    }

    func get() -> Value {
        lock.lock()
        defer { lock.unlock() }
        return storage
    }
}

@Suite("Datafn server sync engine")
struct DatafnServerSyncEngineTests {
    @Test("TV-SYN-004: Swift DataFn-server sync uses the Core Data changelog and cursors")
    func swiftDatafnServerSyncUsesTheCoreDataChangelogAndCursors() async throws {
        let schema = makeSchema()
        let store = try makeStore(namespace: "org-1:user-1", schema: schema)
        let pushBodies = LockedBox<[Any]>([])
        let syncEvents = LockedBox<[String]>([])

        try store.setHydrationState(resource: "tasks", state: .hydrating)
        try store.setHydrationState(resource: "tasks", state: .ready)
        _ = try store.changelogAppend(entry: DatafnChangelogPendingEntry(
            clientId: "device-1",
            mutationId: "mut-1",
            mutation: [
                "resource": "tasks",
                "id": "task:1",
                "operation": "merge",
                "record": ["completed": true],
            ],
            timestampMs: 1
        ))
        _ = try store.changelogAppend(entry: DatafnChangelogPendingEntry(
            clientId: "device-1",
            mutationId: "mut-2",
            mutation: [
                "resource": "tasks",
                "id": "task:2",
                "operation": "insert",
                "record": ["id": "task:2", "title": "Queued"],
            ],
            timestampMs: 2
        ))

        let token = store.subscribe { event in
            if event.name == DatafnCoreDataStore.syncStatusEvent {
                syncEvents.withValue { $0.append(event.name) }
            }
        }
        defer { store.unsubscribe(token) }

        let executor = DatafnServerRemoteExecutor(
            configuration: DatafnServerRemoteExecutorConfiguration(
                baseURL: URL(string: "https://api.example.com/datafn")!,
                profileID: "default"
            ),
            httpSender: { request in
                guard let endpoint = request.url?.lastPathComponent else {
                    throw TestHelperError.missingURL
                }
                switch endpoint {
                case "push":
                    pushBodies.withValue { $0.append(try! requestBodyJSON(request)) }
                    return try makeHTTPResponse(
                        for: request,
                        statusCode: 200,
                        json: [
                            "ok": true,
                            "result": ["ok": true],
                        ]
                    )
                case "pull":
                    return try makeHTTPResponse(
                        for: request,
                        statusCode: 200,
                        json: [
                            "ok": true,
                            "result": [
                                "ok": true,
                                "records": [
                                    "tasks": [
                                        ["id": "task:server", "title": "From server"],
                                    ],
                                ],
                                "deleted": [:],
                                "cursors": ["tasks": "7"],
                                "hasMore": false,
                            ],
                        ]
                    )
                default:
                    Issue.record("Unexpected endpoint: \(endpoint)")
                    return try makeHTTPResponse(
                        for: request,
                        statusCode: 500,
                        json: ["ok": false]
                    )
                }
            }
        )

        let engine = DatafnServerSyncEngine(
            store: store,
            schema: schema,
            clientID: "device-1",
            remoteExecutor: executor
        )

        try await engine.schedulePush()
        try await engine.pullNow()

        let pushedMutations = try #require(pushBodies.get().first as? [Any])
        #expect(pushedMutations.count == 2)
        #expect((pushedMutations[0] as? [String: Any])?["id"] as? String == "task:1")
        #expect((pushedMutations[1] as? [String: Any])?["id"] as? String == "task:2")
        #expect(try store.changelogList().isEmpty)
        #expect(try store.getCursor(resource: "tasks") == "7")
        #expect(try store.getCursor(resource: "__global_cursor__") == "7")
        #expect(try store.getRecord(resource: "tasks", id: "task:server")?["title"] == "From server")
        #expect(syncEvents.get().contains("sync.status"))
    }

    @Test("TV-SYN-004 negative: transport failures surface as sync.push errors")
    func transportFailuresSurfaceAsSyncPushErrors() async throws {
        let schema = makeSchema()
        let store = try makeStore(namespace: "org-1:user-2", schema: schema)
        _ = try store.changelogAppend(entry: DatafnChangelogPendingEntry(
            clientId: "device-1",
            mutationId: "mut-3",
            mutation: [
                "resource": "tasks",
                "id": "task:3",
                "operation": "merge",
                "record": ["completed": true],
            ],
            timestampMs: 3
        ))

        let executor = DatafnServerRemoteExecutor(
            configuration: DatafnServerRemoteExecutorConfiguration(
                baseURL: URL(string: "https://api.example.com/datafn")!,
                profileID: "default"
            ),
            httpSender: { _ in
                throw URLError(.cannotConnectToHost)
            }
        )

        let engine = DatafnServerSyncEngine(
            store: store,
            schema: schema,
            clientID: "device-1",
            remoteExecutor: executor
        )

        do {
            try await engine.schedulePush()
            Issue.record("Expected schedulePush to fail")
        } catch let error as DatafnBridgeError {
            #expect(error.code == "TRANSPORT_ERROR")
            #expect(error.message == "DataFn server sync failed")
            #expect(error.details?["path"] == "sync.push")
        } catch {
            Issue.record("Unexpected error: \(String(describing: error))")
        }

        let issues = await engine.healthIssues()
        #expect(issues.first?.code == "TRANSPORT_ERROR")
    }

    private func makeSchema() -> DatafnRuntimeSchema {
        DatafnRuntimeSchema(
            resources: [
                .init(
                    name: "tasks",
                    version: 1,
                    fields: [
                        .init(name: "title", type: "string"),
                        .init(name: "completed", type: "boolean"),
                    ]
                ),
                .init(
                    name: "tags",
                    version: 1,
                    fields: [
                        .init(name: "label", type: "string"),
                    ]
                ),
            ],
            relations: [
                .init(
                    from: "tasks",
                    to: .single("tags"),
                    type: .manyMany,
                    name: "tags",
                    inverse: "tasks"
                ),
            ]
        )
    }

    private func makeStore(
        namespace: String,
        schema: DatafnRuntimeSchema
    ) throws -> DatafnCoreDataStore {
        try DatafnCoreDataStore(
            configuration: DatafnCoreDataStoreConfiguration(
                schema: schema,
                schemaHash: "abc123",
                namespace: namespace,
                clientID: "device-1",
                backendKind: "datafn-server",
                storeURL: FileManager.default.temporaryDirectory
                    .appendingPathComponent(UUID().uuidString)
                    .appendingPathComponent("datafn.sqlite"),
                inMemory: true
            )
        )
    }
}

enum TestHelperError: Error {
    case missingURL
    case missingBody
}

private func requestBodyJSON(_ request: URLRequest) throws -> Any {
    guard let body = request.httpBody else {
        throw TestHelperError.missingBody
    }
    return try JSONSerialization.jsonObject(with: body)
}

func makeHTTPResponse(
    for request: URLRequest,
    statusCode: Int,
    json: Any
) throws -> (Data, HTTPURLResponse) {
    let data = try JSONSerialization.data(withJSONObject: json)
    guard let url = request.url else {
        throw TestHelperError.missingURL
    }
    guard let response = HTTPURLResponse(
        url: url,
        statusCode: statusCode,
        httpVersion: nil,
        headerFields: ["Content-Type": "application/json"]
    ) else {
        throw TestHelperError.missingURL
    }
    return (data, response)
}
