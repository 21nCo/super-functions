import Foundation
import SearchFnAdapterContracts
import SearchFnCore

public struct SearchFnSQLiteAdapterConfiguration: Sendable, Equatable {
    public let rootURL: URL
    public let indexKey: String
    public let pipeline: SearchFnPipelineOptions?
    public let defaults: SearchFnDefaults?
    public let postingsCacheLimit: Int?
    public let fuzzyCacheLimit: Int?
    public let diagnostics: SearchFnDiagnosticsSink?

    public init(
        rootURL: URL,
        indexKey: String,
        pipeline: SearchFnPipelineOptions? = nil,
        defaults: SearchFnDefaults? = nil,
        postingsCacheLimit: Int? = nil,
        fuzzyCacheLimit: Int? = nil,
        diagnostics: SearchFnDiagnosticsSink? = nil
    ) {
        self.rootURL = rootURL
        self.indexKey = indexKey
        self.pipeline = pipeline
        self.defaults = defaults
        self.postingsCacheLimit = postingsCacheLimit
        self.fuzzyCacheLimit = fuzzyCacheLimit
        self.diagnostics = diagnostics
    }

    public static func == (
        lhs: SearchFnSQLiteAdapterConfiguration,
        rhs: SearchFnSQLiteAdapterConfiguration
    ) -> Bool {
        lhs.rootURL == rhs.rootURL &&
            lhs.indexKey == rhs.indexKey &&
            lhs.pipeline == rhs.pipeline &&
            lhs.defaults == rhs.defaults &&
            lhs.postingsCacheLimit == rhs.postingsCacheLimit &&
            lhs.fuzzyCacheLimit == rhs.fuzzyCacheLimit
    }
}

public actor SearchFnSQLiteAdapter: SearchFnAdapter {
    public let name = "sqlite"
    public let capabilities: SearchFnAdapterCapabilities? = SearchFnAdapterCapabilities(
        persistent: true,
        searchAll: true,
        fuzzy: true,
        prefix: true,
        fieldBoosts: true,
        maxBatchSize: 10_000
    )

    public let configuration: SearchFnSQLiteAdapterConfiguration

    private var store: SearchFnSQLiteStore?
    private var resources: [String: SearchFnResourceEngine] = [:]
    private var resourceConfigurations: [String: SearchFnInitializeResourceConfig] = [:]
    private var disposed = false

    public init(configuration: SearchFnSQLiteAdapterConfiguration) {
        self.configuration = configuration
    }

    public func initialize(_ params: SearchFnInitializeParams) async throws {
        let store = try ensureStore(operation: "Initialize operation")

        for resource in params.resources {
            let key = normalizedResource(resource.name)
            try store.upsertResourceConfiguration(resource)
            resourceConfigurations[key] = resource
            resources[key] = nil
        }
        emit("adapter.initialize", attributes: ["resourcesCount": "\(params.resources.count)"])
    }

    public func index(_ params: SearchFnIndexParams) async throws {
        let store = try ensureStore(operation: "Index operation")
        let key = normalizedResource(params.resource)
        let searchFields = try ensureSearchFields(for: key, documents: params.documents, store: store)
        let engine = try loadResourceEngine(for: key, searchFields: searchFields, store: store)

        for document in params.documents {
            try throwIfCancelled("Index operation")
            let record = makeDocumentRecord(document: document, searchFields: searchFields, engine: engine)
            try store.replaceDocument(resource: key, record: record)
        }

        engine.upsert(params.documents)
        resources[key] = engine
        emit(
            "adapter.index",
            attributes: [
                "resource": key,
                "documentsCount": "\(params.documents.count)",
            ]
        )
    }

    public func search(_ params: SearchFnSearchParams) async throws -> [String] {
        let store = try ensureStore(operation: "Search operation")
        let key = normalizedResource(params.resource)
        guard let searchFields = resourceConfigurations[key]?.searchFields else {
            _ = store
            return []
        }

        let engine = try loadResourceEngine(for: key, searchFields: searchFields, store: store)
        let results = try engine.search(
            SearchFnCoreSearchRequest(
                query: params.query,
                fields: params.fields,
                limit: params.limit ?? configuration.defaults?.limit,
                fuzzy: params.fuzzy ?? configuration.defaults?.fuzzy,
                prefix: params.prefix ?? configuration.defaults?.prefix ?? false,
                fieldBoosts: params.fieldBoosts ?? configuration.defaults?.fieldBoosts ?? [:]
            )
        )

        let ids = results.map(\.id)
        emit(
            "adapter.search",
            attributes: [
                "resource": key,
                "queryLength": "\(params.query.count)",
                "fieldsCount": "\(params.fields?.count ?? 0)",
                "resultsCount": "\(ids.count)",
            ]
        )
        return ids
    }

    public func searchAll(_ params: SearchFnSearchAllParams) async throws -> [SearchFnSearchAllResult]? {
        let store = try ensureStore(operation: "SearchAll operation")
        let selectedResources: [String]
        if let configuredResources = params.resources, !configuredResources.isEmpty {
            selectedResources = configuredResources.map(normalizedResource(_:))
        } else {
            selectedResources = resourceConfigurations.keys.sorted()
        }

        let limit = params.limit ?? configuration.defaults?.limit ?? 10
        let limitPerResource = params.limitPerResource ?? configuration.defaults?.limitPerResource ?? limit
        var results: [SearchFnSearchAllResult] = []

        for resource in selectedResources {
            try throwIfCancelled("SearchAll operation")
            guard let searchFields = resourceConfigurations[resource]?.searchFields else {
                continue
            }

            let engine = try loadResourceEngine(for: resource, searchFields: searchFields, store: store)
            let matches = try engine.search(
                SearchFnCoreSearchRequest(
                    query: params.query,
                    fields: params.fields,
                    limit: limitPerResource,
                    fuzzy: params.fuzzy ?? configuration.defaults?.fuzzy,
                    prefix: params.prefix ?? configuration.defaults?.prefix ?? false,
                    fieldBoosts: params.fieldBoosts ?? configuration.defaults?.fieldBoosts ?? [:]
                )
            )

            results.append(
                contentsOf: matches.map { match in
                    SearchFnSearchAllResult(resource: resource, id: match.id, score: match.score)
                }
            )
        }

        let sorted = results
            .sorted(by: deterministicSearchAllSort)
            .prefix(limit)
            .map { $0 }
        emit(
            "adapter.searchAll",
            attributes: [
                "resourcesCount": "\(selectedResources.count)",
                "queryLength": "\(params.query.count)",
                "resultsCount": "\(sorted.count)",
            ]
        )
        return sorted
    }

    public func remove(resource: String, ids: [String]) async throws {
        let store = try ensureStore(operation: "Remove operation")
        let key = normalizedResource(resource)
        try store.removeDocuments(resource: key, ids: ids)
        resources[key]?.remove(ids: ids)
        emit(
            "adapter.remove",
            attributes: [
                "resource": key,
                "idsCount": "\(ids.count)",
            ]
        )
    }

    public func clear(resource: String) async throws {
        let store = try ensureStore(operation: "Clear operation")
        let key = normalizedResource(resource)
        try store.clearResource(resource: key)
        resources[key] = nil
        resourceConfigurations[key] = nil
        emit("adapter.clear", attributes: ["resource": key])
    }

    public func dispose() async throws {
        if disposed {
            return
        }
        store?.close()
        store = nil
        resources.removeAll()
        resourceConfigurations.removeAll()
        disposed = true
        emit(
            "persistence.close",
            attributes: [
                "indexKey": configuration.indexKey,
                "directoryName": storageLayout.directoryURL.lastPathComponent,
            ]
        )
        emit("adapter.dispose")
    }

    internal var storageLayout: SearchFnSQLiteLayout {
        SearchFnSQLiteLayout(configuration: configuration)
    }

    private func ensureStore(operation: String) throws -> SearchFnSQLiteStore {
        if disposed {
            throw SearchFnError.disposed()
        }
        try throwIfCancelled(operation)

        if let store {
            return store
        }

        let createdStore = try SearchFnSQLiteStore(configuration: configuration)
        self.store = createdStore
        self.resourceConfigurations = try createdStore.loadResourceConfigurations()
        emit(
            createdStore.openMode == .created ? "persistence.open" : "persistence.reopen",
            attributes: [
                "indexKey": configuration.indexKey,
                "directoryName": createdStore.layout.directoryURL.lastPathComponent,
                "schemaVersion": "\(createdStore.schemaVersion)",
            ]
        )
        return createdStore
    }

    private func loadResourceEngine(
        for resource: String,
        searchFields: [String],
        store: SearchFnSQLiteStore
    ) throws -> SearchFnResourceEngine {
        if let engine = resources[resource] {
            return engine
        }

        let engine = SearchFnResourceEngine(
            searchFields: searchFields,
            pipelineOptions: configuration.pipeline ?? SearchFnPipelineOptions()
        )
        let documents = try store.loadDocuments(resource: resource)
        engine.upsert(documents)
        resources[resource] = engine
        return engine
    }

    private func ensureSearchFields(
        for resource: String,
        documents: [SearchFnDocument],
        store: SearchFnSQLiteStore
    ) throws -> [String] {
        if let existing = resourceConfigurations[resource]?.searchFields {
            return existing
        }

        let searchFields = Array(
            Set(documents.flatMap { document in
                document.fields.keys
            })
        ).sorted()

        let config = SearchFnInitializeResourceConfig(name: resource, searchFields: searchFields)
        try store.upsertResourceConfiguration(config)
        resourceConfigurations[resource] = config
        return searchFields
    }

    private func makeDocumentRecord(
        document: SearchFnDocument,
        searchFields: [String],
        engine: SearchFnResourceEngine
    ) -> SearchFnSQLiteDocumentRecord {
        var postings: [SearchFnSQLitePostingRecord] = []
        var vocabularyTerms = Set<String>()
        var totalLength = 0

        for field in searchFields {
            guard let text = document.fields[field], !text.isEmpty else {
                continue
            }

            let tokens = engine.analyze(field: field, text: text, documentID: document.id)
            totalLength += tokens.count

            var frequencies: [String: Int] = [:]
            var metadataByTerm: [String: SearchFnTokenMetadata?] = [:]

            for token in tokens {
                frequencies[token.value, default: 0] += 1
                if metadataByTerm[token.value] == nil {
                    metadataByTerm[token.value] = token.metadata
                }
            }

            for term in frequencies.keys.sorted() {
                let metadata = metadataByTerm[term] ?? nil
                postings.append(
                    SearchFnSQLitePostingRecord(
                        field: field,
                        term: term,
                        documentID: document.id,
                        frequency: frequencies[term] ?? 1,
                        isPrefix: metadata?.isPrefix == true,
                        originalTerm: metadata?.originalTerm
                    )
                )
                if metadata?.isPrefix != true {
                    vocabularyTerms.insert(term)
                }
            }
        }

        return SearchFnSQLiteDocumentRecord(
            document: document,
            totalLength: totalLength,
            postings: postings,
            vocabularyTerms: Array(vocabularyTerms).sorted()
        )
    }

    private func normalizedResource(_ resource: String) -> String {
        resource.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func throwIfCancelled(_ operation: String) throws {
        if Task.isCancelled {
            throw SearchFnError(code: "DFQL_ABORTED", message: "\(operation) aborted")
        }
    }

    private func deterministicSearchAllSort(
        _ lhs: SearchFnSearchAllResult,
        _ rhs: SearchFnSearchAllResult
    ) -> Bool {
        if lhs.score != rhs.score {
            return lhs.score > rhs.score
        }
        if lhs.resource != rhs.resource {
            return lhs.resource < rhs.resource
        }
        return lhs.id < rhs.id
    }

    private func emit(_ name: String, attributes: [String: String] = [:]) {
        configuration.diagnostics?(SearchFnDiagnosticsEvent(name: name, adapterName: self.name, attributes: attributes))
    }
}
