import Foundation

public let DATAFN_NATIVE_BRIDGE_UNAVAILABLE = "NATIVE_BRIDGE_UNAVAILABLE"
public let DATAFN_NATIVE_SEARCH_UNAVAILABLE = "NATIVE_SEARCH_UNAVAILABLE"
public let DATAFN_SEARCH_INDEX_REBUILD_FAILED = "SEARCH_INDEX_REBUILD_FAILED"

public struct DatafnSearchErrorDetails: Sendable, Equatable, Codable {
    public let path: String?
    public let reason: String?
    public let resource: String?

    public init(
        path: String? = nil,
        reason: String? = nil,
        resource: String? = nil
    ) {
        self.path = path
        self.reason = reason
        self.resource = resource
    }
}

public struct DatafnSearchError: Error, Sendable, Equatable, Codable {
    public let code: String
    public let message: String
    public let details: DatafnSearchErrorDetails?

    public init(
        code: String,
        message: String,
        details: DatafnSearchErrorDetails? = nil
    ) {
        self.code = code
        self.message = message
        self.details = details
    }

    public static func invalid(
        _ message: String,
        path: String
    ) -> Self {
        Self(
            code: "DFQL_INVALID",
            message: message,
            details: DatafnSearchErrorDetails(path: path)
        )
    }

    public static func unsupported(
        _ message: String,
        path: String = "search"
    ) -> Self {
        Self(
            code: "DFQL_UNSUPPORTED",
            message: message,
            details: DatafnSearchErrorDetails(path: path)
        )
    }

    public static func nativeBridgeUnavailable(
        _ message: String,
        path: String
    ) -> Self {
        Self(
            code: DATAFN_NATIVE_BRIDGE_UNAVAILABLE,
            message: message,
            details: DatafnSearchErrorDetails(path: path)
        )
    }

    public static func nativeSearchUnavailable(
        _ message: String,
        path: String = "search.state",
        resource: String? = nil
    ) -> Self {
        Self(
            code: DATAFN_NATIVE_SEARCH_UNAVAILABLE,
            message: message,
            details: DatafnSearchErrorDetails(path: path, resource: resource)
        )
    }

    public static func rebuildFailed(
        _ message: String,
        path: String = "search.rebuild",
        resource: String? = nil
    ) -> Self {
        Self(
            code: DATAFN_SEARCH_INDEX_REBUILD_FAILED,
            message: message,
            details: DatafnSearchErrorDetails(path: path, resource: resource)
        )
    }
}

public enum DatafnSearchQueryType: String, Sendable, Equatable, Codable {
    case fullText
    case semantic
}

public enum DatafnSearchFuzzyOption: Sendable, Equatable, Codable {
    case disabled
    case enabled
    case distance(Int)
}

public enum DatafnSearchUpdateOperation: String, Sendable, Equatable, Codable {
    case upsert
    case delete
}

public enum DatafnSearchBackendState: String, Sendable, Equatable, Codable {
    case unavailable
    case initializing
    case ready
    case rebuilding
}

public struct DatafnSearchResourceConfiguration: Sendable, Equatable, Codable {
    public let name: String
    public let searchFields: [String]

    public init(name: String, searchFields: [String]) {
        self.name = name
        self.searchFields = searchFields
    }
}

public struct DatafnSearchInitializeRequest: Sendable, Equatable, Codable {
    public let resources: [DatafnSearchResourceConfiguration]

    public init(resources: [DatafnSearchResourceConfiguration]) {
        self.resources = resources
    }

    public func validated() throws -> Self {
        var normalizedResources: [DatafnSearchResourceConfiguration] = []
        var seen = Set<String>()

        for (index, resource) in resources.enumerated() {
            let name = resource.name.trimmingCharacters(in: .whitespacesAndNewlines)
            if name.isEmpty {
                throw DatafnSearchError.invalid("resource name is required", path: "resources[\(index)].name")
            }

            let fields = resource.searchFields
                .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
                .filter { !$0.isEmpty }

            if fields.isEmpty {
                continue
            }

            let normalizedKey = name.lowercased()
            if seen.contains(normalizedKey) {
                throw DatafnSearchError.invalid(
                    "Duplicate search resource definitions are not allowed",
                    path: "resources"
                )
            }
            seen.insert(normalizedKey)

            let dedupedFields = Array(NSOrderedSet(array: fields)) as? [String] ?? fields
            normalizedResources.append(
                DatafnSearchResourceConfiguration(
                    name: name,
                    searchFields: dedupedFields
                )
            )
        }

        return Self(resources: normalizedResources)
    }
}

public struct DatafnSearchRequest: Sendable, Equatable, Codable {
    public let resource: String
    public let query: String
    public let type: DatafnSearchQueryType?
    public let fields: [String]?
    public let limit: Int?
    public let prefix: Bool?
    public let fuzzy: DatafnSearchFuzzyOption?
    public let fieldBoosts: [String: Double]?

    public init(
        resource: String,
        query: String,
        type: DatafnSearchQueryType? = nil,
        fields: [String]? = nil,
        limit: Int? = nil,
        prefix: Bool? = nil,
        fuzzy: DatafnSearchFuzzyOption? = nil,
        fieldBoosts: [String: Double]? = nil
    ) {
        self.resource = resource
        self.query = query
        self.type = type
        self.fields = fields
        self.limit = limit
        self.prefix = prefix
        self.fuzzy = fuzzy
        self.fieldBoosts = fieldBoosts
    }
}

public struct DatafnSearchAllRequest: Sendable, Equatable, Codable {
    public let query: String
    public let resources: [String]?
    public let fields: [String]?
    public let limit: Int?
    public let limitPerResource: Int?
    public let prefix: Bool?
    public let fuzzy: DatafnSearchFuzzyOption?
    public let fieldBoosts: [String: Double]?

    public init(
        query: String,
        resources: [String]? = nil,
        fields: [String]? = nil,
        limit: Int? = nil,
        limitPerResource: Int? = nil,
        prefix: Bool? = nil,
        fuzzy: DatafnSearchFuzzyOption? = nil,
        fieldBoosts: [String: Double]? = nil
    ) {
        self.query = query
        self.resources = resources
        self.fields = fields
        self.limit = limit
        self.limitPerResource = limitPerResource
        self.prefix = prefix
        self.fuzzy = fuzzy
        self.fieldBoosts = fieldBoosts
    }
}

public struct DatafnSearchAllResult: Sendable, Equatable, Codable {
    public let resource: String
    public let id: String
    public let score: Double

    public init(resource: String, id: String, score: Double) {
        self.resource = resource
        self.id = id
        self.score = score
    }
}

public struct DatafnSearchDocument: Sendable, Equatable, Codable {
    public let id: String
    public let fields: [String: String]

    public init(id: String, fields: [String: String]) {
        self.id = id
        self.fields = fields
    }
}

public struct DatafnSearchUpdateRequest: Sendable, Equatable, Codable {
    public let resource: String
    public let operation: DatafnSearchUpdateOperation
    public let documents: [DatafnSearchDocument]

    public init(
        resource: String,
        operation: DatafnSearchUpdateOperation,
        documents: [DatafnSearchDocument]
    ) {
        self.resource = resource
        self.operation = operation
        self.documents = documents
    }
}

public struct DatafnSearchBackendConfiguration: Sendable, Equatable {
    public let searchRootURL: URL?
    public let failIfUnavailable: Bool

    public init(
        searchRootURL: URL? = nil,
        failIfUnavailable: Bool = true
    ) {
        self.searchRootURL = searchRootURL
        self.failIfUnavailable = failIfUnavailable
    }
}

public protocol DatafnSearchBackend: Sendable {
    var backendKind: String { get }

    func state() async -> DatafnSearchBackendState
    func initialize(_ request: DatafnSearchInitializeRequest) async throws
    func applyUpdate(_ request: DatafnSearchUpdateRequest) async throws
    func search(_ request: DatafnSearchRequest) async throws -> [String]
    func searchAll(_ request: DatafnSearchAllRequest) async throws -> [DatafnSearchAllResult]
    func dispose() async
}
