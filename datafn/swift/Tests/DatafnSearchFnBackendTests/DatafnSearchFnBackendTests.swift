import Testing
@testable import DatafnAppleRuntime
@testable import DatafnSearchContracts
@testable import DatafnSearchFnBackend
@testable import DatafnWebViewBridgeHost

@Suite("Datafn SearchFn backend")
struct DatafnSearchFnBackendTests {
    @Test("TV-DFS-002: SearchFn backend initializes from search resources and returns deterministic results")
    func searchFnBackendInitializesAndSearches() async throws {
        let backend = DatafnSearchFnBackendFactory.make(
            searchConfiguration: DatafnSearchBackendConfiguration(),
            namespace: "org-1:user-1",
            supportDirectoryURL: makeSupportDirectoryURLForTesting()
        )

        try await backend.initialize(
            DatafnSearchInitializeRequest(
                resources: [
                    DatafnSearchResourceConfiguration(name: "todos", searchFields: ["text"]),
                    DatafnSearchResourceConfiguration(name: "categories", searchFields: ["name"]),
                    DatafnSearchResourceConfiguration(name: "audit", searchFields: []),
                ]
            )
        )
        try await backend.applyUpdate(
            DatafnSearchUpdateRequest(
                resource: "todos",
                operation: .upsert,
                documents: [
                    DatafnSearchDocument(id: "todo:1", fields: ["text": "buy milk"]),
                    DatafnSearchDocument(id: "todo:2", fields: ["text": "milk delivery"]),
                ]
            )
        )
        try await backend.applyUpdate(
            DatafnSearchUpdateRequest(
                resource: "categories",
                operation: .upsert,
                documents: [
                    DatafnSearchDocument(id: "cat:1", fields: ["name": "milk"]),
                ]
            )
        )

        let ids = try await backend.search(
            DatafnSearchRequest(resource: "todos", query: "milk")
        )
        let allResults = try await backend.searchAll(
            DatafnSearchAllRequest(query: "milk", resources: ["todos", "categories"])
        )
        let layout = await backend.storageLayoutForTesting()

        #expect(ids == ["todo:1", "todo:2"])
        #expect(allResults.map { $0.resource } == ["categories", "todos", "todos"])
        #expect(layout.rootURL.lastPathComponent == "SearchFn")
        #expect(layout.indexKey == "org-1:user-1")
    }

    @Test("DRT-001 / TV-DFS-010: direct runtime search and bridge search share the same native backend")
    func runtimeAndBridgeShareTheSameNativeBackend() async throws {
        let runtime = try await DatafnAppleRuntime(
            configuration: DatafnAppleRuntimeConfiguration(
                schemaJSON: makeSearchSchemaJSONForTesting(),
                schemaHash: "abc123",
                namespace: "org-1:user-1",
                clientID: "device-1",
                storeRootURL: makeStoreRootURLForTesting(),
                search: DatafnSearchBackendConfiguration(),
                syncBackend: makeDatafnServerSyncBackendForTesting()
            )
        )
        let snapshot = await runtime.snapshotForTesting()
        let backend = try #require(await runtime.searchBackendForTesting())
        let host = await runtime.makeBridgeHost(handlerName: "datafn")

        try await backend.applyUpdate(
            DatafnSearchUpdateRequest(
                resource: "todos",
                operation: .upsert,
                documents: [
                    DatafnSearchDocument(id: "todo:1", fields: ["text": "buy milk"]),
                    DatafnSearchDocument(id: "todo:2", fields: ["text": "buy bread"]),
                ]
            )
        )

        let directResults = try await runtime.search(
            DatafnSearchRequest(resource: "todos", query: "milk")
        )
        let bridgeResults = await host.handleMessageForTesting([
            "protocol": DATAFN_BRIDGE_PROTOCOL,
            "id": "req-search",
            "method": "search.search",
            "payload": [
                "resource": "todos",
                "query": "milk",
            ],
        ])
        let bridgeAllResults = await host.handleMessageForTesting([
            "protocol": DATAFN_BRIDGE_PROTOCOL,
            "id": "req-search-all",
            "method": "search.searchAll",
            "payload": [
                "query": "milk",
                "resources": ["todos"],
            ],
        ])
        let handshake = await host.handleMessageForTesting([
            "protocol": DATAFN_BRIDGE_PROTOCOL,
            "id": "req-handshake",
            "method": "handshake",
            "payload": [
                "schemaHash": "abc123",
                "namespace": "org-1:user-1",
                "clientId": "device-1",
                "remoteMode": "datafn-server",
                "remoteProfile": "default",
            ],
        ])

        #expect(snapshot.searchBackendKind == "searchfn")
        #expect(snapshot.searchResourceNames == ["categories", "todos"])
        #expect(snapshot.searchRootURL?.lastPathComponent == "SearchFn")
        #expect(directResults == ["todo:1"])
        #expect(handshake.ok)

        let handshakeResult = try #require(handshake.result?.objectValue)
        #expect(
            handshakeResult["capabilities"]
                == [
                    "search",
                    "storage",
                    "storage.atomicMergeIfMissing",
                    "remote",
                    "sync",
                    "events",
                    "health",
                ]
        )

        #expect(bridgeResults.ok)
        let bridgeSearchResult = try #require(bridgeResults.result?.objectValue)
        #expect(bridgeSearchResult["ids"] == ["todo:1"])

        #expect(bridgeAllResults.ok)
        let bridgeSearchAllResult = try #require(bridgeAllResults.result?.objectValue)
        let results = try #require(bridgeSearchAllResult["results"]?.arrayValue)
        #expect(results.count == 1)
        let firstResult = try #require(results.first?.objectValue)
        #expect(firstResult["resource"] == "todos")
        #expect(firstResult["id"] == "todo:1")
    }

    @Test("TV-DFS-005 negative / TV-DFS-009: runtime search fails deterministically when native search is unavailable")
    func runtimeSearchFailsDeterministicallyWithoutConfiguredBackend() async throws {
        let runtime = try await DatafnAppleRuntime(
            configuration: DatafnAppleRuntimeConfiguration(
                schemaJSON: makeSearchSchemaJSONForTesting(),
                schemaHash: "abc123",
                namespace: "org-1:user-2",
                clientID: "device-2",
                storeRootURL: makeStoreRootURLForTesting(),
                syncBackend: makeDatafnServerSyncBackendForTesting()
            )
        )

        do {
            _ = try await runtime.search(DatafnSearchRequest(resource: "todos", query: "milk"))
            Issue.record("Expected runtime search to fail without native search backend")
        } catch let error as DatafnSearchError {
            #expect(error.code == DATAFN_NATIVE_SEARCH_UNAVAILABLE)
            #expect(error.details?.path == "search.state")
        }
    }
}
