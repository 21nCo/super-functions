import Foundation
import SearchFnAdapterContracts
import SearchFnCore

public actor SearchFnMemoryAdapter: SearchFnAdapter {
    public let name = "memory"
    public let capabilities: SearchFnAdapterCapabilities? = SearchFnAdapterCapabilities(
        persistent: false,
        searchAll: true,
        fuzzy: true,
        prefix: true,
        fieldBoosts: true,
        maxBatchSize: 10_000
    )

    public let pipeline: SearchFnPipelineOptions?
    public let defaults: SearchFnDefaults?
    public let diagnostics: SearchFnDiagnosticsSink?

    private var resources: [String: SearchFnResourceEngine] = [:]
    private var resourceConfigurations: [String: SearchFnInitializeResourceConfig] = [:]
    private var disposed = false

    public init(
        pipeline: SearchFnPipelineOptions? = nil,
        defaults: SearchFnDefaults? = nil,
        diagnostics: SearchFnDiagnosticsSink? = nil
    ) {
        self.pipeline = pipeline
        self.defaults = defaults
        self.diagnostics = diagnostics
    }

    public func initialize(_ params: SearchFnInitializeParams) async throws {
        try assertOperational("Initialize operation")

        var nextConfigurations: [String: SearchFnInitializeResourceConfig] = [:]
        var nextResources: [String: SearchFnResourceEngine] = [:]

        for resource in params.resources {
            let key = normalizedResource(resource.name)
            nextConfigurations[key] = resource
            nextResources[key] = makeEngine(searchFields: resource.searchFields)
        }

        resourceConfigurations = nextConfigurations
        resources = nextResources
        emit("adapter.initialize", attributes: ["resourcesCount": "\(params.resources.count)"])
    }

    public func index(_ params: SearchFnIndexParams) async throws {
        try assertOperational("Index operation")
        let key = normalizedResource(params.resource)
        let engine = engineForIndexing(resourceKey: key, documents: params.documents)
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
        try assertOperational("Search operation")
        let key = normalizedResource(params.resource)
        guard let engine = resources[key] else {
            return []
        }

        let request = SearchFnCoreSearchRequest(
            query: params.query,
            fields: params.fields,
            limit: params.limit ?? defaults?.limit,
            fuzzy: params.fuzzy ?? defaults?.fuzzy,
            prefix: params.prefix ?? defaults?.prefix ?? false,
            fieldBoosts: params.fieldBoosts ?? defaults?.fieldBoosts ?? [:]
        )
        let results = try engine.search(request).map(\.id)
        emit(
            "adapter.search",
            attributes: [
                "resource": key,
                "queryLength": "\(params.query.count)",
                "fieldsCount": "\(params.fields?.count ?? 0)",
                "resultsCount": "\(results.count)",
            ]
        )
        return results
    }

    public func searchAll(_ params: SearchFnSearchAllParams) async throws -> [SearchFnSearchAllResult]? {
        try assertOperational("SearchAll operation")

        let selectedResources: [String]
        if let resources = params.resources, !resources.isEmpty {
            selectedResources = resources.map(normalizedResource(_:))
        } else {
            selectedResources = self.resources.keys.sorted()
        }

        let limit = params.limit ?? defaults?.limit ?? 10
        let limitPerResource = params.limitPerResource ?? defaults?.limitPerResource ?? limit
        var results: [SearchFnSearchAllResult] = []

        for resource in selectedResources {
            try throwIfCancelled("SearchAll operation")
            guard let engine = resources[resource] else {
                continue
            }

            let matches = try engine.search(
                SearchFnCoreSearchRequest(
                    query: params.query,
                    fields: params.fields,
                    limit: limitPerResource,
                    fuzzy: params.fuzzy ?? defaults?.fuzzy,
                    prefix: params.prefix ?? defaults?.prefix ?? false,
                    fieldBoosts: params.fieldBoosts ?? defaults?.fieldBoosts ?? [:]
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
        try assertOperational("Remove operation")
        let key = normalizedResource(resource)
        guard let engine = resources[key] else {
            return
        }
        engine.remove(ids: ids)
        emit(
            "adapter.remove",
            attributes: [
                "resource": key,
                "idsCount": "\(ids.count)",
            ]
        )
    }

    public func clear(resource: String) async throws {
        try assertOperational("Clear operation")
        let key = normalizedResource(resource)
        resources[key]?.clear()
        resources[key] = nil
        resourceConfigurations[key] = nil
        emit("adapter.clear", attributes: ["resource": key])
    }

    public func dispose() async throws {
        resources.removeAll()
        resourceConfigurations.removeAll()
        disposed = true
        emit("adapter.dispose")
    }

    private func engineForIndexing(resourceKey: String, documents: [SearchFnDocument]) -> SearchFnResourceEngine {
        if let existing = resources[resourceKey] {
            return existing
        }

        if let configuration = resourceConfigurations[resourceKey] {
            let engine = makeEngine(searchFields: configuration.searchFields)
            resources[resourceKey] = engine
            return engine
        }

        let derivedFields = Array(
            Set(documents.flatMap { document in
                document.fields.keys
            })
        ).sorted()
        let engine = makeEngine(searchFields: derivedFields)
        resources[resourceKey] = engine
        return engine
    }

    private func makeEngine(searchFields: [String]) -> SearchFnResourceEngine {
        SearchFnResourceEngine(
            searchFields: searchFields,
            pipelineOptions: pipeline ?? SearchFnPipelineOptions()
        )
    }

    private func assertOperational(_ operation: String) throws {
        if disposed {
            throw SearchFnError.disposed()
        }
        try throwIfCancelled(operation)
    }

    private func throwIfCancelled(_ operation: String) throws {
        if Task.isCancelled {
            throw SearchFnError(
                code: "DFQL_ABORTED",
                message: "\(operation) aborted"
            )
        }
    }

    private func normalizedResource(_ resource: String) -> String {
        resource.trimmingCharacters(in: .whitespacesAndNewlines)
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
        diagnostics?(SearchFnDiagnosticsEvent(name: name, adapterName: self.name, attributes: attributes))
    }
}
