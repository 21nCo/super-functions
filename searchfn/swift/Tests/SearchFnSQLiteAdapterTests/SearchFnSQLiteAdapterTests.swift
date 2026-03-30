import Testing
@testable import SearchFnAdapterContracts
import SearchFnClient
import SearchFnConvenience
@testable import SearchFnSQLiteAdapter

@Test("sqlite adapter persists data under a deterministic path and reopens successfully")
func sqlitePersistsAndReopens() async throws {
    let configuration = SearchFnSQLiteTestSupport.makeConfiguration(indexKey: "project-docs")
    let layout = SearchFnSQLiteLayout(configuration: configuration)
    defer { SearchFnSQLiteTestSupport.cleanup(configuration) }

    let firstClient = createSearchClient(
        SearchFnClientConfiguration(
            adapter: SearchFnSQLiteAdapter(configuration: configuration),
            defaults: configuration.defaults
        )
    )

    try await firstClient.initialize(
        SearchFnInitializeParams(
            resources: [
                SearchFnInitializeResourceConfig(name: "docs", searchFields: ["title", "body"]),
            ]
        )
    )
    try await firstClient.index(
        SearchFnIndexParams(
            resource: "docs",
            documents: [
                SearchFnDocument(id: "d1", fields: ["title": "Getting started", "body": "Swift search runtime"]),
            ]
        )
    )

    let initialIDs = try await firstClient.search(
        SearchFnSearchParams(resource: "docs", query: "getting")
    )
    #expect(initialIDs == ["d1"])
    #expect(SearchFnSQLiteTestSupport.databaseExists(for: layout))
    #expect(SearchFnSQLiteTestSupport.manifestExists(for: layout))
    #expect(SearchFnSQLiteTestSupport.databaseFileName(for: layout) == "searchfn.sqlite")
    #expect(SearchFnSQLiteTestSupport.directoryName(for: layout).hasPrefix("project-docs-"))

    let manifest = try SearchFnSQLiteTestSupport.readManifest(for: layout)
    #expect(manifest.format == "searchfn-swift/v1")
    #expect(manifest.indexKey == "project-docs")
    #expect(manifest.sqliteSchemaVersion == 1)

    try await firstClient.dispose()

    let reopenedClient = createSearchClient(
        SearchFnClientConfiguration(
            adapter: SearchFnSQLiteAdapter(configuration: configuration),
            defaults: configuration.defaults
        )
    )
    let reopenedIDs = try await reopenedClient.search(
        SearchFnSearchParams(resource: "docs", query: "getting")
    )
    #expect(reopenedIDs == ["d1"])
}

@Test("sqlite adapter searchAll ordering stays deterministic after reopen")
func sqliteSearchAllDeterministic() async throws {
    let configuration = SearchFnSQLiteTestSupport.makeConfiguration(indexKey: "incidents")
    defer { SearchFnSQLiteTestSupport.cleanup(configuration) }

    let client = createSearchClient(
        SearchFnClientConfiguration(
            adapter: SearchFnSQLiteAdapter(configuration: configuration),
            defaults: configuration.defaults
        )
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
    try await client.dispose()

    let reopened = createSearchClient(
        SearchFnClientConfiguration(
            adapter: SearchFnSQLiteAdapter(configuration: configuration),
            defaults: configuration.defaults
        )
    )
    let results = try await reopened.searchAll(
        SearchFnSearchAllParams(query: "incident", resources: ["beta", "alpha"])
    )

    #expect(results.map { "\($0.resource):\($0.id)" } == ["alpha:a1", "alpha:a2", "beta:b1"])
}

@Test("sqlite manifest mismatches throw canonical format errors")
func sqliteManifestMismatchThrowsCanonicalError() async throws {
    let configuration = SearchFnSQLiteTestSupport.makeConfiguration(indexKey: "tampered-manifest")
    let layout = SearchFnSQLiteLayout(configuration: configuration)
    defer { SearchFnSQLiteTestSupport.cleanup(configuration) }

    let client = createSearchClient(
        SearchFnClientConfiguration(
            adapter: SearchFnSQLiteAdapter(configuration: configuration),
            defaults: configuration.defaults
        )
    )
    try await client.initialize(
        SearchFnInitializeParams(
            resources: [
                SearchFnInitializeResourceConfig(name: "docs", searchFields: ["title"]),
            ]
        )
    )
    try await client.index(
        SearchFnIndexParams(
            resource: "docs",
            documents: [
                SearchFnDocument(id: "d1", fields: ["title": "hello"]),
            ]
        )
    )
    try await client.dispose()

    let tamperedManifest = SearchFnSQLiteManifest(
        format: "searchfn-swift/v1",
        indexKey: "tampered-manifest",
        sqliteSchemaVersion: 999
    )
    try SearchFnSQLiteTestSupport.writeManifest(tamperedManifest, for: layout)

    let reopened = createSearchClient(
        SearchFnClientConfiguration(
            adapter: SearchFnSQLiteAdapter(configuration: configuration),
            defaults: configuration.defaults
        )
    )

    await expectSearchFnError(
        code: SEARCH_INDEX_FORMAT_MISMATCH,
        message: "Persisted SearchFn index format does not match runtime expectations"
    ) {
        _ = try await reopened.search(
            SearchFnSearchParams(resource: "docs", query: "hello")
        )
    }
}

@Test("disposed sqlite adapters fail deterministically")
func sqliteDisposedErrorsAreCanonical() async throws {
    let configuration = SearchFnSQLiteTestSupport.makeConfiguration(indexKey: "disposed")
    defer { SearchFnSQLiteTestSupport.cleanup(configuration) }

    let client = createSearchClient(
        SearchFnClientConfiguration(
            adapter: SearchFnSQLiteAdapter(configuration: configuration),
            defaults: configuration.defaults
        )
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

@Test("sqlite convenience API remains usable through SearchFn")
func sqliteConvenienceAPIWorks() async throws {
    let configuration = SearchFnSQLiteTestSupport.makeConfiguration(indexKey: "convenience")
    defer { SearchFnSQLiteTestSupport.cleanup(configuration) }

    let search = try SearchFn(sqlite: configuration)
    let client = search.client()

    try await client.initialize(
        SearchFnInitializeParams(
            resources: [
                SearchFnInitializeResourceConfig(name: "docs", searchFields: ["title"]),
            ]
        )
    )
    try await client.index(
        SearchFnIndexParams(
            resource: "docs",
            documents: [
                SearchFnDocument(id: "d1", fields: ["title": "portable search"]),
            ]
        )
    )

    let ids = try await client.search(
        SearchFnSearchParams(resource: "docs", query: "portable")
    )
    #expect(ids == ["d1"])
    #expect(client.adapterInfo().name == "sqlite")
}

@Test("sqlite diagnostics include persistence lifecycle without leaking raw query text")
func sqliteDiagnosticsCoverPersistenceLifecycle() async throws {
    let recorder = DiagnosticsRecorder()
    let configuration = SearchFnSQLiteTestSupport.makeConfiguration(indexKey: "diagnostics")
    SearchFnSQLiteTestSupport.cleanup(configuration)
    defer { SearchFnSQLiteTestSupport.cleanup(configuration) }

    let client = createSearchClient(
        SearchFnClientConfiguration(
            adapter: SearchFnSQLiteAdapter(
                configuration: SearchFnSQLiteAdapterConfiguration(
                    rootURL: configuration.rootURL,
                    indexKey: configuration.indexKey,
                    diagnostics: { event in
                        recorder.record(event)
                    }
                )
            )
        )
    )

    try await client.initialize(
        SearchFnInitializeParams(
            resources: [
                SearchFnInitializeResourceConfig(name: "docs", searchFields: ["title"]),
            ]
        )
    )
    try await client.index(
        SearchFnIndexParams(
            resource: "docs",
            documents: [
                SearchFnDocument(id: "d1", fields: ["title": "private launch plans"]),
            ]
        )
    )
    _ = try await client.search(
        SearchFnSearchParams(resource: "docs", query: "launch plans")
    )
    try await client.dispose()

    let events = recorder.events
    #expect(events.map(\.name).contains("persistence.open"))
    #expect(events.map(\.name).contains("persistence.close"))
    #expect(events.map(\.name).contains("adapter.search"))

    for event in events {
        for value in event.attributes.values {
            #expect(!value.contains("launch"))
            #expect(!value.contains("plans"))
            #expect(!value.contains("private"))
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
