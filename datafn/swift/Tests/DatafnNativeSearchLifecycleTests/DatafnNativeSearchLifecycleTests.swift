import CoreData
import Testing
@testable import DatafnAppleRuntime
@testable import DatafnCloudKitSync
@testable import DatafnCoreDataStore
@testable import DatafnSearchContracts
@testable import DatafnServerSync
@testable import DatafnWebViewBridgeHost

@Suite("Datafn native search lifecycle")
struct DatafnNativeSearchLifecycleTests {
    @Test("TV-DFS-004: local bridge writes update the native search index in datafn-server mode")
    func localBridgeWritesUpdateNativeSearchIndex() async throws {
        let runtime = try await makeServerRuntime(namespace: "org-1:user-local-search")
        let host = await runtime.makeBridgeHost(handlerName: "datafn")

        let response = await host.handleMessageForTesting([
            "protocol": DATAFN_BRIDGE_PROTOCOL,
            "id": "req-local-upsert",
            "method": "storage.upsertRecord",
            "payload": [
                "resource": "todos",
                "record": [
                    "id": "td-2",
                    "text": "buy milk",
                    "note": "ignored field",
                ],
            ],
        ])

        #expect(response.ok)
        await runtime.waitForSearchIndexingForTesting()
        let searchResults = await host.handleMessageForTesting([
            "protocol": DATAFN_BRIDGE_PROTOCOL,
            "id": "req-local-search",
            "method": "search.search",
            "payload": [
                "resource": "todos",
                "query": "milk",
            ],
        ])

        #expect(searchResults.ok)
        let result = try #require(searchResults.result?.objectValue)
        #expect(result["ids"] == ["td-2"])
    }

    @Test("DIDX-001: local deletes remove native search results")
    func localDeletesRemoveNativeSearchResults() async throws {
        let runtime = try await makeServerRuntime(namespace: "org-1:user-local-delete")
        let store = await runtime.storeForTesting()

        try store.upsertRecord(
            resource: "todos",
            record: [
                "id": "td-delete",
                "text": "remove me",
            ]
        )
        await runtime.waitForSearchIndexingForTesting()
        #expect(
            try await runtime.search(DatafnSearchRequest(resource: "todos", query: "remove"))
                == ["td-delete"]
        )

        try store.deleteRecord(resource: "todos", id: "td-delete")
        await runtime.waitForSearchIndexingForTesting()
        #expect(
            try await runtime.search(DatafnSearchRequest(resource: "todos", query: "remove"))
                == []
        )
    }

    @Test("TV-DFS-005: DataFn-server clone and pull writes update the native search backend")
    func serverSyncWritesUpdateNativeSearchBackend() async throws {
        let runtime = try await makeServerRuntime(namespace: "org-1:user-sync-search")
        let store = await runtime.storeForTesting()
        let executor = DatafnServerRemoteExecutor(
            configuration: DatafnServerRemoteExecutorConfiguration(
                baseURL: URL(string: "https://api.example.com/datafn")!,
                profileID: "default"
            ),
            httpSender: { request in
                guard let endpoint = request.url?.lastPathComponent else {
                    throw URLError(.badURL)
                }
                switch endpoint {
                case "clone":
                    return try makeHTTPResponse(
                        for: request,
                        statusCode: 200,
                        json: [
                            "ok": true,
                            "result": [
                                "ok": true,
                                "data": [
                                    "todos": [
                                        ["id": "td-10", "text": "incident report"],
                                    ],
                                ],
                                "cursors": ["todos": "5"],
                                "joins": [:],
                                "next": [:],
                            ],
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
                                    "todos": [
                                        ["id": "td-11", "text": "incident plan"],
                                    ],
                                ],
                                "deleted": [:],
                                "cursors": ["todos": "6"],
                                "hasMore": false,
                            ],
                        ]
                    )
                default:
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
            schema: makeSearchSchemaForTesting(),
            clientID: "device-sync",
            remoteExecutor: executor
        )

        try await engine.cloneNow()
        await runtime.waitForSearchIndexingForTesting()
        #expect(
            try await runtime.search(DatafnSearchRequest(resource: "todos", query: "incident"))
                == ["td-10"]
        )

        try await engine.pullNow()
        await runtime.waitForSearchIndexingForTesting()
        #expect(
            try await runtime.search(DatafnSearchRequest(resource: "todos", query: "incident"))
                == ["td-10", "td-11"]
        )
    }

    @Test("TV-DFS-006: CloudKit-backed store merges update the native search backend while search files stay local-only")
    func cloudKitStoreMergesUpdateNativeSearchBackend() async throws {
        let runtime = try await DatafnAppleRuntime(
            configuration: DatafnAppleRuntimeConfiguration(
                schemaJSON: makeSearchSchemaJSONForTesting(),
                schemaHash: "icloud-live-search",
                namespace: "personal:user-live-search",
                clientID: "device-cloud",
                storeRootURL: makeStoreRootURLForTesting(),
                search: DatafnSearchBackendConfiguration(),
                syncBackend: .iCloud(
                    DatafnCloudKitConfiguration(containerIdentifier: "iCloud.com.example.app")
                )
            )
        )
        let store = await runtime.storeForTesting()
        let snapshot = await runtime.snapshotForTesting()

        try store.upsertRecord(
            resource: "todos",
            record: [
                "id": "td-20",
                "text": "vacation plan",
            ]
        )
        await runtime.waitForSearchIndexingForTesting()

        #expect(snapshot.remoteMode == DatafnNativeRemoteMode.iCloud)
        #expect(snapshot.searchRootURL != snapshot.storeURL)
        #expect(
            try await runtime.search(DatafnSearchRequest(resource: "todos", query: "vacation"))
                == ["td-20"]
        )
    }

    private func makeServerRuntime(namespace: String) async throws -> DatafnAppleRuntime {
        try await DatafnAppleRuntime(
            configuration: DatafnAppleRuntimeConfiguration(
                schemaJSON: makeSearchSchemaJSONForTesting(),
                schemaHash: "abc123",
                namespace: namespace,
                clientID: "device-1",
                storeRootURL: makeStoreRootURLForTesting(),
                search: DatafnSearchBackendConfiguration(),
                syncBackend: makeDatafnServerSyncBackendForTesting()
            )
        )
    }

    private func makeHTTPResponse(
        for request: URLRequest,
        statusCode: Int,
        json: Any
    ) throws -> (Data, HTTPURLResponse) {
        let data = try JSONSerialization.data(withJSONObject: json)
        guard let url = request.url else {
            throw URLError(.badURL)
        }
        guard let response = HTTPURLResponse(
            url: url,
            statusCode: statusCode,
            httpVersion: nil,
            headerFields: ["Content-Type": "application/json"]
        ) else {
            throw URLError(.badServerResponse)
        }
        return (data, response)
    }
}
