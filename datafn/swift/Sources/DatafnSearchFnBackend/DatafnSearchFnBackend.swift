import DatafnSearchContracts
import Foundation
import SearchFnAdapterContracts
import SearchFnClient
import SearchFnSQLiteAdapter

public struct DatafnSearchFnBackendConfiguration: Sendable, Equatable {
    public let searchConfiguration: DatafnSearchBackendConfiguration
    public let searchRootURL: URL
    public let indexKey: String

    public init(
        searchConfiguration: DatafnSearchBackendConfiguration,
        searchRootURL: URL,
        indexKey: String
    ) {
        self.searchConfiguration = searchConfiguration
        self.searchRootURL = searchRootURL
        self.indexKey = indexKey
    }
}

public actor DatafnSearchFnBackend: DatafnSearchBackend {
    public let backendKind = "searchfn"

    private let configuration: DatafnSearchFnBackendConfiguration
    private var backendState: DatafnSearchBackendState = .unavailable
    private let adapter: SearchFnSQLiteAdapter
    private let client: any SearchFnClientProtocol

    public init(configuration: DatafnSearchFnBackendConfiguration) {
        self.configuration = configuration
        let adapter = SearchFnSQLiteAdapter(
            configuration: SearchFnSQLiteAdapterConfiguration(
                rootURL: configuration.searchRootURL,
                indexKey: configuration.indexKey
            )
        )
        self.adapter = adapter
        self.client = createSearchClient(
            SearchFnClientConfiguration(
                adapter: adapter,
                defaults: SearchFnDefaults(limit: 50, limitPerResource: 50)
            )
        )
    }

    public func state() async -> DatafnSearchBackendState {
        backendState
    }

    public func initialize(_ request: DatafnSearchInitializeRequest) async throws {
        let normalizedRequest = try request.validated()
        backendState = .initializing

        do {
            try await client.initialize(
                SearchFnInitializeParams(
                    resources: normalizedRequest.resources.map {
                        SearchFnInitializeResourceConfig(
                            name: $0.name,
                            searchFields: $0.searchFields
                        )
                    }
                )
            )
            backendState = .ready
        } catch {
            backendState = .unavailable
            throw mapSearchFnError(error)
        }
    }

    public func applyUpdate(_ request: DatafnSearchUpdateRequest) async throws {
        if backendState != .ready {
            throw DatafnSearchError.nativeSearchUnavailable(
                "Native search backend is not ready",
                resource: request.resource
            )
        }

        do {
            switch request.operation {
            case .upsert:
                try await client.index(
                    SearchFnIndexParams(
                        resource: request.resource,
                        documents: request.documents.map {
                            SearchFnDocument(id: $0.id, fields: $0.fields)
                        }
                    )
                )
            case .delete:
                try await client.remove(
                    resource: request.resource,
                    ids: request.documents.map(\.id)
                )
            }
        } catch {
            throw mapSearchFnError(error, resource: request.resource)
        }
    }

    public func search(_ request: DatafnSearchRequest) async throws -> [String] {
        guard backendState == .ready else {
            throw DatafnSearchError.nativeSearchUnavailable(
                "Native search backend is not available",
                resource: request.resource
            )
        }
        guard request.type != .semantic else {
            throw DatafnSearchError.unsupported(
                "Semantic native search is not implemented",
                path: "type"
            )
        }

        do {
            return try await client.search(
                SearchFnSearchParams(
                    resource: request.resource,
                    query: request.query,
                    fields: request.fields,
                    limit: request.limit,
                    fuzzy: mapFuzzy(request.fuzzy),
                    prefix: request.prefix,
                    fieldBoosts: request.fieldBoosts
                )
            )
        } catch {
            throw mapSearchFnError(error, resource: request.resource)
        }
    }

    public func searchAll(_ request: DatafnSearchAllRequest) async throws -> [DatafnSearchAllResult] {
        guard backendState == .ready else {
            throw DatafnSearchError.nativeSearchUnavailable("Native search backend is not available")
        }

        do {
            let results = try await client.searchAll(
                SearchFnSearchAllParams(
                    query: request.query,
                    resources: request.resources,
                    fields: request.fields,
                    limit: request.limit,
                    limitPerResource: request.limitPerResource,
                    fuzzy: mapFuzzy(request.fuzzy),
                    prefix: request.prefix,
                    fieldBoosts: request.fieldBoosts
                )
            )
            return results.map { DatafnSearchAllResult(resource: $0.resource, id: $0.id, score: $0.score) }
        } catch {
            throw mapSearchFnError(error)
        }
    }

    public func dispose() async {
        try? await client.dispose()
        backendState = .unavailable
    }

    public func storageLayoutForTesting() -> (rootURL: URL, indexKey: String) {
        (
            rootURL: configuration.searchRootURL,
            indexKey: configuration.indexKey
        )
    }

    private func mapFuzzy(_ fuzzy: DatafnSearchFuzzyOption?) -> SearchFnFuzzyOption? {
        guard let fuzzy else {
            return nil
        }

        switch fuzzy {
        case .disabled:
            return .disabled
        case .enabled:
            return .enabled
        case .distance(let distance):
            return distance <= 0 ? .disabled : .distance(distance)
        }
    }

    private func mapSearchFnError(
        _ error: Error,
        resource: String? = nil
    ) -> DatafnSearchError {
        guard let searchError = error as? SearchFnError else {
            return DatafnSearchError.nativeSearchUnavailable(
                error.localizedDescription,
                path: "search.state",
                resource: resource
            )
        }

        switch searchError.code {
        case "DFQL_INVALID":
            return DatafnSearchError.invalid(
                searchError.message,
                path: searchError.details?.path ?? "search"
            )
        case "DFQL_UNSUPPORTED":
            return DatafnSearchError.unsupported(
                searchError.message,
                path: searchError.details?.path ?? "search"
            )
        case SEARCH_INDEX_FORMAT_MISMATCH:
            return DatafnSearchError.rebuildFailed(
                searchError.message,
                path: searchError.details?.path ?? "search.persistence",
                resource: resource
            )
        case SEARCH_ADAPTER_DISPOSED:
            return DatafnSearchError.nativeSearchUnavailable(
                searchError.message,
                path: searchError.details?.path ?? "search.state",
                resource: resource
            )
        default:
            return DatafnSearchError(
                code: searchError.code,
                message: searchError.message,
                details: DatafnSearchErrorDetails(
                    path: searchError.details?.path,
                    reason: searchError.details?.reason,
                    resource: resource ?? searchError.details?.resource
                )
            )
        }
    }
}
