import Testing
@testable import DatafnSearchContracts

@Suite("Datafn search contracts")
struct DatafnSearchContractsTests {
    @Test("TV-DFS-002: initialize request normalizes resources and excludes empty search fields")
    func initializeRequestNormalizesResourcesAndExcludesEmptySearchFields() throws {
        let request = try DatafnSearchInitializeRequest(
            resources: [
                DatafnSearchResourceConfiguration(name: "todos", searchFields: ["text"]),
                DatafnSearchResourceConfiguration(name: "categories", searchFields: ["name", "name"]),
                DatafnSearchResourceConfiguration(name: "audit", searchFields: []),
            ]
        ).validated()

        #expect(request.resources == [
            DatafnSearchResourceConfiguration(name: "todos", searchFields: ["text"]),
            DatafnSearchResourceConfiguration(name: "categories", searchFields: ["name"]),
        ])
    }

    @Test("TV-DFS-002N: duplicate normalized search resources are rejected with DFQL_INVALID")
    func duplicateNormalizedSearchResourcesAreRejected() throws {
        do {
            _ = try DatafnSearchInitializeRequest(
                resources: [
                    DatafnSearchResourceConfiguration(name: "todos", searchFields: ["text"]),
                    DatafnSearchResourceConfiguration(name: " Todos ", searchFields: ["text"]),
                ]
            ).validated()
            Issue.record("Expected duplicate resources to throw")
        } catch let error as DatafnSearchError {
            #expect(error.code == "DFQL_INVALID")
            #expect(error.details?.path == "resources")
        }
    }

    @Test("Search request contracts preserve typed options")
    func searchRequestContractsPreserveTypedOptions() {
        let request = DatafnSearchRequest(
            resource: "todos",
            query: "milk",
            type: .fullText,
            fields: ["text"],
            limit: 10,
            prefix: true,
            fuzzy: .distance(2),
            fieldBoosts: ["title": 2]
        )
        let allRequest = DatafnSearchAllRequest(
            query: "milk",
            resources: ["todos"],
            fields: ["text"],
            limit: 10,
            limitPerResource: 5,
            prefix: true,
            fuzzy: .enabled,
            fieldBoosts: ["title": 2]
        )
        let result = DatafnSearchAllResult(resource: "todos", id: "td-1", score: 1.0)

        #expect(request.resource == "todos")
        #expect(request.query == "milk")
        #expect(request.type == .fullText)
        #expect(request.fuzzy == .distance(2))
        #expect(allRequest.resources == ["todos"])
        #expect(allRequest.limitPerResource == 5)
        #expect(allRequest.fuzzy == .enabled)
        #expect(result == DatafnSearchAllResult(resource: "todos", id: "td-1", score: 1.0))
    }

    @Test("DERR-001: canonical native search errors carry stable codes and paths")
    func canonicalNativeSearchErrorsCarryStableCodesAndPaths() {
        let bridgeUnavailable = DatafnSearchError.nativeBridgeUnavailable(
            "Bridge is unavailable",
            path: "window.webkit.messageHandlers.datafn"
        )
        let searchUnavailable = DatafnSearchError.nativeSearchUnavailable(
            "Search backend is rebuilding",
            path: "search.state",
            resource: "todos"
        )
        let rebuildFailed = DatafnSearchError.rebuildFailed(
            "Search rebuild failed",
            path: "search.rebuild",
            resource: "todos"
        )

        #expect(bridgeUnavailable.code == DATAFN_NATIVE_BRIDGE_UNAVAILABLE)
        #expect(bridgeUnavailable.details?.path == "window.webkit.messageHandlers.datafn")
        #expect(searchUnavailable.code == DATAFN_NATIVE_SEARCH_UNAVAILABLE)
        #expect(searchUnavailable.details?.path == "search.state")
        #expect(searchUnavailable.details?.resource == "todos")
        #expect(rebuildFailed.code == DATAFN_SEARCH_INDEX_REBUILD_FAILED)
        #expect(rebuildFailed.details?.path == "search.rebuild")
    }
}
