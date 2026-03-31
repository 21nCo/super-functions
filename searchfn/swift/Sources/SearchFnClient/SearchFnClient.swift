import Foundation
import SearchFnAdapterContracts

private let maxQueryLength = 1_000
private let maxLimit = 10_000
private let maxLimitPerResource = 1_000
private let maxIndexBatch = 10_000
private let maxResourcesPerSearchAll = 50
private let defaultLimit = 10
private let defaultLimitPerResource = 10

public final class SearchFnClient: SearchFnClientProtocol {
    private let adapter: any SearchFnAdapter
    private let defaults: SearchFnDefaults
    private let diagnostics: SearchFnDiagnosticsSink?

    public init(configuration: SearchFnClientConfiguration) {
        self.adapter = configuration.adapter
        self.defaults = configuration.defaults ?? SearchFnDefaults()
        self.diagnostics = configuration.diagnostics
    }

    public func initialize(_ params: SearchFnInitializeParams) async throws {
        try validateInitialize(params)
        try await adapter.initialize(params)
        SearchFnDiagnosticsEmitter.emit(
            diagnostics,
            name: SearchFnDiagnostics.initialize,
            adapterName: adapter.name,
            attributes: [
                "resourcesCount": "\(params.resources.count)",
            ]
        )
    }

    public func index(_ params: SearchFnIndexParams) async throws {
        try validateResource(params.resource)
        guard params.documents.count <= maxIndexBatch else {
            throw SearchFnError.limitExceeded(
                "documents exceeds maximum batch size of \(maxIndexBatch)",
                path: "documents"
            )
        }
        try await adapter.index(params)
        SearchFnDiagnosticsEmitter.emit(
            diagnostics,
            name: SearchFnDiagnostics.index,
            adapterName: adapter.name,
            attributes: [
                "resource": params.resource,
                "documentsCount": "\(params.documents.count)",
            ]
        )
    }

    public func search(_ params: SearchFnSearchParams) async throws -> [String] {
        try validateResource(params.resource)
        try validateQuery(params.query)
        try validateLimit(params.limit, path: "limit", max: maxLimit)
        try validateFuzzy(params.fuzzy)
        try validateFieldBoosts(params.fieldBoosts)

        let effectiveParams = SearchFnSearchParams(
            resource: params.resource,
            query: params.query,
            fields: params.fields,
            limit: clampLimit(params.limit, defaultValue: defaults.limit ?? defaultLimit, max: maxLimit),
            fuzzy: params.fuzzy ?? defaults.fuzzy,
            prefix: params.prefix ?? defaults.prefix,
            fieldBoosts: params.fieldBoosts ?? defaults.fieldBoosts
        )
        try validateFuzzy(effectiveParams.fuzzy)
        try validateFieldBoosts(effectiveParams.fieldBoosts)
        let results = try await adapter.search(effectiveParams)
        SearchFnDiagnosticsEmitter.emit(
            diagnostics,
            name: SearchFnDiagnostics.search,
            adapterName: adapter.name,
            attributes: [
                "resource": effectiveParams.resource,
                "queryLength": "\(effectiveParams.query.count)",
                "fieldsCount": "\(effectiveParams.fields?.count ?? 0)",
                "limit": "\(effectiveParams.limit ?? defaultLimit)",
                "resultsCount": "\(results.count)",
            ]
        )
        return results
    }

    public func searchAll(_ params: SearchFnSearchAllParams) async throws -> [SearchFnSearchAllResult] {
        try validateQuery(params.query)
        try validateLimit(params.limit, path: "limit", max: maxLimit)
        try validateLimit(params.limitPerResource, path: "limitPerResource", max: maxLimitPerResource)
        try validateResourcesArray(params.resources)
        try validateFuzzy(params.fuzzy)
        try validateFieldBoosts(params.fieldBoosts)

        let effectiveLimit = clampLimit(params.limit, defaultValue: defaults.limit ?? defaultLimit, max: maxLimit)
        let effectiveLimitPerResource = clampLimit(
            params.limitPerResource,
            defaultValue: defaults.limitPerResource ?? defaultLimitPerResource,
            max: maxLimitPerResource
        )

        let effectiveParams = SearchFnSearchAllParams(
            query: params.query,
            resources: params.resources,
            fields: params.fields,
            limit: effectiveLimit,
            limitPerResource: effectiveLimitPerResource,
            fuzzy: params.fuzzy ?? defaults.fuzzy,
            prefix: params.prefix ?? defaults.prefix,
            fieldBoosts: params.fieldBoosts ?? defaults.fieldBoosts
        )
        try validateFuzzy(effectiveParams.fuzzy)
        try validateFieldBoosts(effectiveParams.fieldBoosts)

        if let nativeResults = try await adapter.searchAll(effectiveParams) {
            let sorted = deterministicSort(nativeResults).prefix(effectiveLimit).map { $0 }
            SearchFnDiagnosticsEmitter.emit(
                diagnostics,
                name: SearchFnDiagnostics.searchAll,
                adapterName: adapter.name,
                attributes: [
                    "mode": "native",
                    "resourcesCount": "\(effectiveParams.resources?.count ?? 0)",
                    "queryLength": "\(effectiveParams.query.count)",
                    "limit": "\(effectiveLimit)",
                    "limitPerResource": "\(effectiveLimitPerResource)",
                    "resultsCount": "\(sorted.count)",
                ]
            )
            return sorted
        }

        guard let resources = effectiveParams.resources, !resources.isEmpty else {
            throw SearchFnError.invalid(
                "resources are required when adapter.searchAll is unavailable",
                path: "resources"
            )
        }

        var merged: [SearchFnSearchAllResult] = []
        for resource in resources {
            let ids = try await adapter.search(
                SearchFnSearchParams(
                    resource: resource,
                    query: effectiveParams.query,
                    fields: effectiveParams.fields,
                    limit: effectiveLimitPerResource,
                    fuzzy: effectiveParams.fuzzy,
                    prefix: effectiveParams.prefix,
                    fieldBoosts: effectiveParams.fieldBoosts
                )
            )
            for (index, id) in ids.enumerated() {
                let score = Double(ids.count - index)
                merged.append(SearchFnSearchAllResult(resource: resource, id: id, score: score))
            }
        }

        let sorted = deterministicSort(merged).prefix(effectiveLimit).map { $0 }
        SearchFnDiagnosticsEmitter.emit(
            diagnostics,
            name: SearchFnDiagnostics.searchAllFallback,
            adapterName: adapter.name,
            attributes: [
                "mode": "fallback",
                "resourcesCount": "\(resources.count)",
                "queryLength": "\(effectiveParams.query.count)",
                "limit": "\(effectiveLimit)",
                "limitPerResource": "\(effectiveLimitPerResource)",
                "resultsCount": "\(sorted.count)",
            ]
        )
        return sorted
    }

    public func remove(resource: String, ids: [String]) async throws {
        try validateResource(resource)
        try await adapter.remove(resource: resource, ids: ids)
        SearchFnDiagnosticsEmitter.emit(
            diagnostics,
            name: SearchFnDiagnostics.remove,
            adapterName: adapter.name,
            attributes: [
                "resource": resource,
                "idsCount": "\(ids.count)",
            ]
        )
    }

    public func clear(resource: String) async throws {
        try validateResource(resource)
        try await adapter.clear(resource: resource)
        SearchFnDiagnosticsEmitter.emit(
            diagnostics,
            name: SearchFnDiagnostics.clear,
            adapterName: adapter.name,
            attributes: [
                "resource": resource,
            ]
        )
    }

    public func dispose() async throws {
        try await adapter.dispose()
        SearchFnDiagnosticsEmitter.emit(
            diagnostics,
            name: SearchFnDiagnostics.dispose,
            adapterName: adapter.name
        )
    }

    public func adapterInfo() -> (name: String, capabilities: SearchFnAdapterCapabilities?) {
        (name: adapter.name, capabilities: adapter.capabilities)
    }
}

public func createSearchClient(
    _ configuration: SearchFnClientConfiguration
) -> any SearchFnClientProtocol {
    SearchFnClient(configuration: configuration)
}

private func validateInitialize(_ params: SearchFnInitializeParams) throws {
    var seen = Set<String>()
    for (index, resource) in params.resources.enumerated() {
        try validateResource(resource.name)
        if resource.searchFields.isEmpty {
            throw SearchFnError.invalid(
                "searchFields must be a non-empty array",
                path: "resources[\(index)].searchFields"
            )
        }
        let key = resource.name.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if seen.contains(key) {
            throw SearchFnError.invalid(
                "resources contains duplicate names",
                path: "resources"
            )
        }
        seen.insert(key)
    }
}

private func validateResource(_ resource: String) throws {
    if resource.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
        throw SearchFnError.invalid("resource must be a non-empty string", path: "resource")
    }
}

private func validateQuery(_ query: String) throws {
    if query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
        throw SearchFnError.invalid("Search query must not be empty", path: "query")
    }
    if query.count > maxQueryLength {
        throw SearchFnError.limitExceeded(
            "query exceeds maximum length of \(maxQueryLength)",
            path: "query"
        )
    }
}

private func validateLimit(_ limit: Int?, path: String, max: Int) throws {
    guard let limit else { return }
    if limit <= 0 {
        throw SearchFnError.invalid("\(path) must be a positive number", path: path)
    }
    if limit > max {
        throw SearchFnError.limitExceeded("\(path) exceeds maximum of \(max)", path: path)
    }
}

private func validateResourcesArray(_ resources: [String]?) throws {
    guard let resources else { return }
    if resources.isEmpty {
        throw SearchFnError.invalid(
            "resources must be a non-empty array when provided",
            path: "resources"
        )
    }
    if resources.count > maxResourcesPerSearchAll {
        throw SearchFnError.limitExceeded(
            "resources exceeds maximum of \(maxResourcesPerSearchAll)",
            path: "resources"
        )
    }
    for resource in resources {
        try validateResource(resource)
    }
}

private func validateFuzzy(_ fuzzy: SearchFnFuzzyOption?) throws {
    guard let fuzzy else { return }
    if case .distance(let distance) = fuzzy, !(1...3).contains(distance) {
        throw SearchFnError.invalid(
            "fuzzy distance must be between 1 and 3",
            path: "fuzzy"
        )
    }
}

private func validateFieldBoosts(_ boosts: [String: Double]?) throws {
    guard let boosts else { return }
    for (field, boost) in boosts {
        if field.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            throw SearchFnError.invalid(
                "fieldBoosts keys must be non-empty strings",
                path: "fieldBoosts"
            )
        }
        if !boost.isFinite || boost <= 0 {
            throw SearchFnError.invalid(
                "fieldBoosts values must be finite positive numbers",
                path: "fieldBoosts.\(field)"
            )
        }
    }
}

private func clampLimit(_ value: Int?, defaultValue: Int, max: Int) -> Int {
    min(value ?? defaultValue, max)
}

private func deterministicSort(_ results: [SearchFnSearchAllResult]) -> [SearchFnSearchAllResult] {
    results.sorted { lhs, rhs in
        if lhs.score != rhs.score {
            return lhs.score > rhs.score
        }
        if lhs.resource != rhs.resource {
            return lhs.resource < rhs.resource
        }
        return lhs.id < rhs.id
    }
}
