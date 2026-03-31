import Testing
@testable import SearchFnAdapterContracts
@testable import SearchFnClient
import SearchFnConvenience
import SearchFnSQLiteAdapter

private actor MockAdapter: SearchFnAdapter {
    let name: String
    let capabilities: SearchFnAdapterCapabilities?

    private(set) var initializeCalls: [SearchFnInitializeParams] = []
    private(set) var indexCalls: [SearchFnIndexParams] = []
    private(set) var searchCalls: [SearchFnSearchParams] = []
    private(set) var searchAllCalls: [SearchFnSearchAllParams] = []
    private(set) var disposeCount = 0

    var searchHandler: @Sendable (SearchFnSearchParams) async throws -> [String]
    var searchAllHandler: @Sendable (SearchFnSearchAllParams) async throws -> [SearchFnSearchAllResult]?

    init(
        name: String = "mock",
        capabilities: SearchFnAdapterCapabilities? = SearchFnAdapterCapabilities(
            persistent: false,
            searchAll: true,
            fuzzy: true,
            prefix: true,
            fieldBoosts: true,
            maxBatchSize: 10_000
        ),
        searchHandler: @escaping @Sendable (SearchFnSearchParams) async throws -> [String] = { _ in [] },
        searchAllHandler: @escaping @Sendable (SearchFnSearchAllParams) async throws -> [SearchFnSearchAllResult]? = { _ in [] }
    ) {
        self.name = name
        self.capabilities = capabilities
        self.searchHandler = searchHandler
        self.searchAllHandler = searchAllHandler
    }

    func initialize(_ params: SearchFnInitializeParams) async throws {
        initializeCalls.append(params)
    }

    func index(_ params: SearchFnIndexParams) async throws {
        indexCalls.append(params)
    }

    func search(_ params: SearchFnSearchParams) async throws -> [String] {
        searchCalls.append(params)
        return try await searchHandler(params)
    }

    func searchAll(_ params: SearchFnSearchAllParams) async throws -> [SearchFnSearchAllResult]? {
        searchAllCalls.append(params)
        return try await searchAllHandler(params)
    }

    func remove(resource: String, ids: [String]) async throws {}

    func clear(resource: String) async throws {}

    func dispose() async throws {
        disposeCount += 1
    }
}

@Test("defaults apply to search and query-time values override them")
func searchAppliesDefaultsAndOverrides() async throws {
    let adapter = MockAdapter()
    let client = createSearchClient(
        SearchFnClientConfiguration(
            adapter: adapter,
            defaults: SearchFnDefaults(
                limit: 25,
                fuzzy: .enabled,
                prefix: true,
                fieldBoosts: ["title": 3.0]
            )
        )
    )

    _ = try await client.search(
        SearchFnSearchParams(resource: "tasks", query: "hyb")
    )
    let firstCall = await adapter.searchCalls[0]
    #expect(firstCall.limit == 25)
    #expect(firstCall.fuzzy == .enabled)
    #expect(firstCall.prefix == true)
    #expect(firstCall.fieldBoosts == ["title": 3.0])

    _ = try await client.search(
        SearchFnSearchParams(
            resource: "tasks",
            query: "hyb",
            prefix: false,
            fieldBoosts: ["body": 5.0]
        )
    )
    let secondCall = await adapter.searchCalls[1]
    #expect(secondCall.prefix == false)
    #expect(secondCall.fieldBoosts == ["body": 5.0])
    #expect(secondCall.fuzzy == .enabled)
}

@Test("search validation errors use canonical codes and details")
func searchValidationErrors() async throws {
    let adapter = MockAdapter()
    let client = createSearchClient(SearchFnClientConfiguration(adapter: adapter))

    await expectSearchFnError(
        code: "DFQL_INVALID",
        message: "resource must be a non-empty string",
        path: "resource"
    ) {
        _ = try await client.search(SearchFnSearchParams(resource: "", query: "hybrid"))
    }

    await expectSearchFnError(
        code: "DFQL_INVALID",
        message: "Search query must not be empty",
        path: "query"
    ) {
        _ = try await client.search(SearchFnSearchParams(resource: "tasks", query: "   "))
    }

    await expectSearchFnError(
        code: "LIMIT_EXCEEDED",
        message: "limit exceeds maximum of 10000",
        path: "limit"
    ) {
        _ = try await client.search(SearchFnSearchParams(resource: "tasks", query: "x", limit: 10_001))
    }
}

@Test("index validation rejects oversized batches")
func indexValidationRejectsOversizedBatches() async throws {
    let adapter = MockAdapter()
    let client = createSearchClient(SearchFnClientConfiguration(adapter: adapter))
    let documents = (0..<10_001).map { index in
        SearchFnDocument(id: "\(index)", fields: ["title": "value"])
    }

    await expectSearchFnError(
        code: "LIMIT_EXCEEDED",
        message: "documents exceeds maximum batch size of 10000",
        path: "documents"
    ) {
        try await client.index(SearchFnIndexParams(resource: "tasks", documents: documents))
    }
}

@Test("searchAll sorts native results deterministically")
func searchAllSortsNativeResultsDeterministically() async throws {
    let adapter = MockAdapter(searchAllHandler: { _ in
        [
            SearchFnSearchAllResult(resource: "beta", id: "b1", score: 5.0),
            SearchFnSearchAllResult(resource: "alpha", id: "a2", score: 5.0),
            SearchFnSearchAllResult(resource: "alpha", id: "a1", score: 5.0),
            SearchFnSearchAllResult(resource: "alpha", id: "a3", score: 10.0),
        ]
    })
    let client = createSearchClient(SearchFnClientConfiguration(adapter: adapter))

    let results = try await client.searchAll(
        SearchFnSearchAllParams(query: "incident", resources: ["alpha", "beta"])
    )

    #expect(results.map(\.id) == ["a3", "a1", "a2", "b1"])
}

@Test("searchAll falls back to per-resource search and rejects missing resources")
func searchAllFallback() async throws {
    let adapter = MockAdapter(
        capabilities: SearchFnAdapterCapabilities(
            persistent: false,
            searchAll: false,
            fuzzy: true,
            prefix: true,
            fieldBoosts: true,
            maxBatchSize: 10_000
        ),
        searchHandler: { params in
            switch params.resource {
            case "alpha":
                return ["a1", "a2"]
            case "beta":
                return ["b1"]
            default:
                return []
            }
        },
        searchAllHandler: { _ in nil }
    )
    let client = createSearchClient(SearchFnClientConfiguration(adapter: adapter))

    let results = try await client.searchAll(
        SearchFnSearchAllParams(query: "hello", resources: ["alpha", "beta"], limitPerResource: 10)
    )
    #expect(results == [
        SearchFnSearchAllResult(resource: "alpha", id: "a1", score: 2.0),
        SearchFnSearchAllResult(resource: "alpha", id: "a2", score: 1.0),
        SearchFnSearchAllResult(resource: "beta", id: "b1", score: 1.0),
    ])

    await expectSearchFnError(
        code: "DFQL_INVALID",
        message: "resources are required when adapter.searchAll is unavailable",
        path: "resources"
    ) {
        _ = try await client.searchAll(
            SearchFnSearchAllParams(query: "hello")
        )
    }
}

@Test("initialize validates duplicate resources and empty search fields")
func initializeValidation() async throws {
    let adapter = MockAdapter()
    let client = createSearchClient(SearchFnClientConfiguration(adapter: adapter))

    await expectSearchFnError(
        code: "DFQL_INVALID",
        message: "resources contains duplicate names",
        path: "resources"
    ) {
        try await client.initialize(
            SearchFnInitializeParams(
                resources: [
                    SearchFnInitializeResourceConfig(name: "tasks", searchFields: ["title"]),
                    SearchFnInitializeResourceConfig(name: "tasks", searchFields: ["body"]),
                ]
            )
        )
    }

    await expectSearchFnError(
        code: "DFQL_INVALID",
        message: "searchFields must be a non-empty array",
        path: "resources[0].searchFields"
    ) {
        try await client.initialize(
            SearchFnInitializeParams(
                resources: [
                    SearchFnInitializeResourceConfig(name: "tasks", searchFields: []),
                ]
            )
        )
    }
}

@Test("convenience APIs can create clients without importing DataFn")
func convenienceAPIsCreateClients() throws {
    let inMemory = InMemorySearchFn()
    #expect(inMemory.client().adapterInfo().name == "memory")

    let sqliteType: SearchFn.Type = SearchFn.self
    let sqliteConfigType: SearchFnSQLiteAdapterConfiguration.Type = SearchFnSQLiteAdapterConfiguration.self
    #expect(sqliteType == SearchFn.self)
    #expect(sqliteConfigType == SearchFnSQLiteAdapterConfiguration.self)
}

@Test("diagnostics emit fallback searchAll events without leaking raw query text")
func diagnosticsEmitFallbackWithoutRawQueryLeaks() async throws {
    let adapter = MockAdapter(
        capabilities: SearchFnAdapterCapabilities(
            persistent: false,
            searchAll: false,
            fuzzy: true,
            prefix: true,
            fieldBoosts: true,
            maxBatchSize: 10_000
        ),
        searchHandler: { params in
            switch params.resource {
            case "alpha":
                return ["a1", "a2"]
            case "beta":
                return ["b1"]
            default:
                return []
            }
        },
        searchAllHandler: { _ in nil }
    )
    let recorder = DiagnosticsRecorder()
    let client = createSearchClient(
        SearchFnClientConfiguration(
            adapter: adapter,
            diagnostics: { event in
                recorder.record(event)
            }
        )
    )

    _ = try await client.searchAll(
        SearchFnSearchAllParams(query: "hello secret phrase", resources: ["alpha", "beta"], limitPerResource: 10)
    )

    let events = recorder.events
    #expect(events.contains { $0.name == SearchFnDiagnostics.searchAllFallback })
    let fallbackEvent = try #require(events.first { $0.name == SearchFnDiagnostics.searchAllFallback })
    #expect(fallbackEvent.attributes["queryLength"] == "19")
    #expect(fallbackEvent.attributes["resourcesCount"] == "2")
    for value in fallbackEvent.attributes.values {
        #expect(!value.contains("hello"))
        #expect(!value.contains("secret"))
        #expect(!value.contains("phrase"))
    }
}

private final class DiagnosticsRecorder: @unchecked Sendable {
    private(set) var events: [SearchFnDiagnosticsEvent] = []

    func record(_ event: SearchFnDiagnosticsEvent) {
        events.append(event)
    }
}

private func expectSearchFnError(
    code: String,
    message: String,
    path: String?,
    _ operation: () async throws -> Void
) async {
    do {
        try await operation()
        Issue.record("Expected SearchFnError to be thrown")
    } catch let error as SearchFnError {
        #expect(error.code == code)
        #expect(error.message == message)
        #expect(error.details?.path == path)
    } catch {
        Issue.record("Unexpected error type: \(error)")
    }
}
