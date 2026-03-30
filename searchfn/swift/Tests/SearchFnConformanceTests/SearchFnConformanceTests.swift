import Testing
@testable import SearchFnAdapterContracts
import SearchFnClient
import SearchFnMemoryAdapter
@testable import SearchFnSQLiteAdapter

@Test("memory adapter passes shared conformance workflow")
func memoryAdapterConformance() async throws {
    let client = createSearchClient(
        SearchFnClientConfiguration(adapter: SearchFnMemoryAdapter())
    )

    try await runConformanceWorkflow(client: client, persistent: false)
}

@Test("sqlite adapter passes shared conformance workflow")
func sqliteAdapterConformance() async throws {
    let configuration = SearchFnSQLiteTestSupport.makeConfiguration(indexKey: "conformance")
    SearchFnSQLiteTestSupport.cleanup(configuration)
    defer { SearchFnSQLiteTestSupport.cleanup(configuration) }

    let client = createSearchClient(
        SearchFnClientConfiguration(
            adapter: SearchFnSQLiteAdapter(configuration: configuration)
        )
    )

    try await runConformanceWorkflow(client: client, persistent: true)
}

private func runConformanceWorkflow(
    client: any SearchFnClientProtocol,
    persistent: Bool
) async throws {
    try await client.initialize(
        SearchFnInitializeParams(
            resources: [
                SearchFnInitializeResourceConfig(name: "items", searchFields: ["title"]),
                SearchFnInitializeResourceConfig(name: "notes", searchFields: ["title"]),
            ]
        )
    )

    try await client.index(
        SearchFnIndexParams(
            resource: "items",
            documents: [
                SearchFnDocument(id: "b", fields: ["title": "same"]),
                SearchFnDocument(id: "a", fields: ["title": "same"]),
                SearchFnDocument(id: "c", fields: ["title": "same"]),
            ]
        )
    )
    try await client.index(
        SearchFnIndexParams(
            resource: "notes",
            documents: [
                SearchFnDocument(id: "n1", fields: ["title": "same"]),
            ]
        )
    )

    let firstSearch = try await client.search(
        SearchFnSearchParams(resource: "items", query: "same", limit: 10)
    )
    let secondSearch = try await client.search(
        SearchFnSearchParams(resource: "items", query: "same", limit: 10)
    )
    #expect(firstSearch == secondSearch)
    #expect(firstSearch == ["a", "b", "c"])

    let searchAllResults = try await client.searchAll(
        SearchFnSearchAllParams(query: "same", resources: ["notes", "items"], limit: 10)
    )
    #expect(searchAllResults.map { "\($0.resource):\($0.id)" } == ["items:a", "items:b", "items:c", "notes:n1"])

    try await client.remove(resource: "items", ids: ["a", "a"])
    let afterRemove = try await client.search(
        SearchFnSearchParams(resource: "items", query: "same", limit: 10)
    )
    #expect(afterRemove == ["b", "c"])

    try await client.clear(resource: "notes")
    let notesAfterClear = try await client.search(
        SearchFnSearchParams(resource: "notes", query: "same", limit: 10)
    )
    #expect(notesAfterClear == [])

    try await client.dispose()

    await expectSearchFnError(code: SEARCH_ADAPTER_DISPOSED) {
        _ = try await client.search(
            SearchFnSearchParams(resource: "items", query: "same", limit: 10)
        )
    }
}

private func expectSearchFnError(
    code: String,
    _ operation: () async throws -> Void
) async {
    do {
        try await operation()
        Issue.record("Expected SearchFnError to be thrown")
    } catch let error as SearchFnError {
        #expect(error.code == code)
    } catch {
        Issue.record("Unexpected error type: \(error)")
    }
}
