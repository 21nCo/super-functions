import Testing
@testable import SearchFnAdapterContracts
import SearchFnClient
import SearchFnConvenience
import SearchFnMemoryAdapter

@Test("standalone in-memory client indexes and searches documents end to end")
func inMemoryClientIndexesAndSearches() async throws {
    let adapter = SearchFnMemoryAdapter()
    let client = createSearchClient(
        SearchFnClientConfiguration(adapter: adapter)
    )

    try await client.initialize(
        SearchFnInitializeParams(
            resources: [
                SearchFnInitializeResourceConfig(name: "tasks", searchFields: ["title", "body"]),
            ]
        )
    )

    try await client.index(
        SearchFnIndexParams(
            resource: "tasks",
            documents: [
                SearchFnDocument(id: "t1", fields: ["title": "Hybrid search", "body": "Swift local index"]),
                SearchFnDocument(id: "t2", fields: ["title": "Groceries", "body": "Milk and bread"]),
            ]
        )
    )

    let ids = try await client.search(
        SearchFnSearchParams(resource: "tasks", query: "hybrid")
    )

    #expect(ids == ["t1"])
}

@Test("native searchAll ordering is deterministic across resources")
func nativeSearchAllIsDeterministic() async throws {
    let adapter = SearchFnMemoryAdapter()
    let client = createSearchClient(
        SearchFnClientConfiguration(adapter: adapter)
    )

    try await client.initialize(
        SearchFnInitializeParams(
            resources: [
                SearchFnInitializeResourceConfig(name: "alpha", searchFields: ["title"]),
                SearchFnInitializeResourceConfig(name: "beta", searchFields: ["title"]),
            ]
        )
    )

    try await client.index(
        SearchFnIndexParams(
            resource: "alpha",
            documents: [
                SearchFnDocument(id: "a2", fields: ["title": "incident"]),
                SearchFnDocument(id: "a1", fields: ["title": "incident"]),
            ]
        )
    )
    try await client.index(
        SearchFnIndexParams(
            resource: "beta",
            documents: [
                SearchFnDocument(id: "b1", fields: ["title": "incident"]),
            ]
        )
    )

    let results = try await client.searchAll(
        SearchFnSearchAllParams(query: "incident", resources: ["beta", "alpha"])
    )

    #expect(results.map { "\($0.resource):\($0.id)" } == ["alpha:a1", "alpha:a2", "beta:b1"])
}

@Test("remove and clear are resource scoped and idempotent")
func removeAndClearAreIdempotent() async throws {
    let adapter = SearchFnMemoryAdapter()
    let client = createSearchClient(
        SearchFnClientConfiguration(adapter: adapter)
    )

    try await client.initialize(
        SearchFnInitializeParams(
            resources: [
                SearchFnInitializeResourceConfig(name: "tasks", searchFields: ["title"]),
                SearchFnInitializeResourceConfig(name: "notes", searchFields: ["title"]),
            ]
        )
    )

    try await client.index(
        SearchFnIndexParams(
            resource: "tasks",
            documents: [
                SearchFnDocument(id: "t1", fields: ["title": "alpha"]),
                SearchFnDocument(id: "t2", fields: ["title": "beta"]),
            ]
        )
    )
    try await client.index(
        SearchFnIndexParams(
            resource: "notes",
            documents: [
                SearchFnDocument(id: "n1", fields: ["title": "alpha"]),
            ]
        )
    )

    try await client.remove(resource: "tasks", ids: ["t1", "t1"])
    try await client.clear(resource: "notes")
    try await client.clear(resource: "notes")

    let tasksAfterRemoveSearchAlpha = try await client.search(
        SearchFnSearchParams(resource: "tasks", query: "alpha")
    )
    let tasksAfterRemoveSearchBeta = try await client.search(
        SearchFnSearchParams(resource: "tasks", query: "beta")
    )
    let notesAfterClearSearchAlpha = try await client.search(
        SearchFnSearchParams(resource: "notes", query: "alpha")
    )

    #expect(tasksAfterRemoveSearchAlpha == [])
    #expect(tasksAfterRemoveSearchBeta == ["t2"])
    #expect(notesAfterClearSearchAlpha == [])
}

@Test("disposed adapters fail with canonical disposed errors")
func disposedAdapterFailsDeterministically() async throws {
    let adapter = SearchFnMemoryAdapter()
    let client = createSearchClient(
        SearchFnClientConfiguration(adapter: adapter)
    )

    try await client.initialize(
        SearchFnInitializeParams(
            resources: [
                SearchFnInitializeResourceConfig(name: "tasks", searchFields: ["title"]),
            ]
        )
    )
    try await client.dispose()

    await expectSearchFnError(code: SEARCH_ADAPTER_DISPOSED, message: "Search adapter has been disposed") {
        _ = try await client.search(
            SearchFnSearchParams(resource: "tasks", query: "x")
        )
    }
}

@Test("in-memory convenience API wraps the client semantics")
func inMemoryConvenienceAPIWorksEndToEnd() async throws {
    let search = InMemorySearchFn()
    let client = search.client()

    try await client.initialize(
        SearchFnInitializeParams(
            resources: [
                SearchFnInitializeResourceConfig(name: "tasks", searchFields: ["title"]),
            ]
        )
    )
    try await client.index(
        SearchFnIndexParams(
            resource: "tasks",
            documents: [
                SearchFnDocument(id: "t1", fields: ["title": "hello"]),
            ]
        )
    )

    let ids = try await client.search(
        SearchFnSearchParams(resource: "tasks", query: "hello")
    )
    let adapterInfo = client.adapterInfo()

    #expect(ids == ["t1"])
    #expect(adapterInfo.name == "memory")
}

@Test("memory adapter diagnostics are opt-in and redact query/document text")
func memoryAdapterDiagnosticsAreRedacted() async throws {
    let recorder = DiagnosticsRecorder()
    let adapter = SearchFnMemoryAdapter(
        diagnostics: { event in
            recorder.record(event)
        }
    )
    let client = createSearchClient(
        SearchFnClientConfiguration(adapter: adapter)
    )

    try await client.initialize(
        SearchFnInitializeParams(
            resources: [
                SearchFnInitializeResourceConfig(name: "tasks", searchFields: ["title"]),
            ]
        )
    )
    try await client.index(
        SearchFnIndexParams(
            resource: "tasks",
            documents: [
                SearchFnDocument(id: "t1", fields: ["title": "top secret roadmap"]),
            ]
        )
    )
    _ = try await client.search(
        SearchFnSearchParams(resource: "tasks", query: "secret roadmap")
    )
    _ = try await client.searchAll(
        SearchFnSearchAllParams(query: "secret roadmap", resources: ["tasks"])
    )
    try await client.dispose()

    let events = recorder.events
    #expect(events.map(\.name).contains("adapter.initialize"))
    #expect(events.map(\.name).contains("adapter.index"))
    #expect(events.map(\.name).contains("adapter.search"))
    #expect(events.map(\.name).contains("adapter.searchAll"))
    #expect(events.map(\.name).contains("adapter.dispose"))

    for event in events {
        for value in event.attributes.values {
            #expect(!value.contains("secret"))
            #expect(!value.contains("roadmap"))
        }
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
    _ operation: () async throws -> Void
) async {
    do {
        try await operation()
        Issue.record("Expected SearchFnError to be thrown")
    } catch let error as SearchFnError {
        #expect(error.code == code)
        #expect(error.message == message)
    } catch {
        Issue.record("Unexpected error type: \(error)")
    }
}
