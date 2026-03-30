import Foundation

public let SEARCH_ADAPTER_DISPOSED = "SEARCH_ADAPTER_DISPOSED"
public let SEARCH_INDEX_FORMAT_MISMATCH = "SEARCH_INDEX_FORMAT_MISMATCH"

public struct SearchFnErrorDetails: Sendable, Equatable, Codable {
    public let path: String?
    public let reason: String?
    public let resource: String?
    public let indexKey: String?

    public init(
        path: String? = nil,
        reason: String? = nil,
        resource: String? = nil,
        indexKey: String? = nil
    ) {
        self.path = path
        self.reason = reason
        self.resource = resource
        self.indexKey = indexKey
    }
}

public struct SearchFnError: Error, Sendable, Equatable, Codable {
    public let code: String
    public let message: String
    public let details: SearchFnErrorDetails?

    public init(code: String, message: String, details: SearchFnErrorDetails? = nil) {
        self.code = code
        self.message = message
        self.details = details
    }
}

public struct SearchFnDiagnosticsEvent: Sendable, Equatable, Codable {
    public let name: String
    public let adapterName: String?
    public let attributes: [String: String]

    public init(
        name: String,
        adapterName: String? = nil,
        attributes: [String: String] = [:]
    ) {
        self.name = name
        self.adapterName = adapterName
        self.attributes = attributes
    }
}

public typealias SearchFnDiagnosticsSink = @Sendable (SearchFnDiagnosticsEvent) -> Void

public enum SearchFnFuzzyOption: Sendable, Equatable, Codable {
    case disabled
    case enabled
    case distance(Int)

    public var normalizedDistance: Int? {
        switch self {
        case .disabled:
            return nil
        case .enabled:
            return 2
        case .distance(let distance):
            return distance
        }
    }
}

public enum SearchFnLanguage: String, Sendable, Equatable, Codable {
    case english
    case spanish
    case french
}

public struct SearchFnPipelineOptions: Sendable, Equatable, Codable {
    public let language: SearchFnLanguage
    public let enableStemming: Bool
    public let enablePrefixIndexing: Bool
    public let customStopWords: Set<String>?

    public init(
        language: SearchFnLanguage = .english,
        enableStemming: Bool = false,
        enablePrefixIndexing: Bool = false,
        customStopWords: Set<String>? = nil
    ) {
        self.language = language
        self.enableStemming = enableStemming
        self.enablePrefixIndexing = enablePrefixIndexing
        self.customStopWords = customStopWords
    }
}

public struct SearchFnDocument: Sendable, Equatable, Codable {
    public let id: String
    public let fields: [String: String]

    public init(id: String, fields: [String: String]) {
        self.id = id
        self.fields = fields
    }
}

public struct SearchFnIndexParams: Sendable, Equatable {
    public let resource: String
    public let documents: [SearchFnDocument]

    public init(resource: String, documents: [SearchFnDocument]) {
        self.resource = resource
        self.documents = documents
    }
}

public struct SearchFnSearchParams: Sendable, Equatable {
    public let resource: String
    public let query: String
    public let fields: [String]?
    public let limit: Int?
    public let fuzzy: SearchFnFuzzyOption?
    public let prefix: Bool?
    public let fieldBoosts: [String: Double]?

    public init(
        resource: String,
        query: String,
        fields: [String]? = nil,
        limit: Int? = nil,
        fuzzy: SearchFnFuzzyOption? = nil,
        prefix: Bool? = nil,
        fieldBoosts: [String: Double]? = nil
    ) {
        self.resource = resource
        self.query = query
        self.fields = fields
        self.limit = limit
        self.fuzzy = fuzzy
        self.prefix = prefix
        self.fieldBoosts = fieldBoosts
    }
}

public struct SearchFnSearchAllParams: Sendable, Equatable {
    public let query: String
    public let resources: [String]?
    public let fields: [String]?
    public let limit: Int?
    public let limitPerResource: Int?
    public let fuzzy: SearchFnFuzzyOption?
    public let prefix: Bool?
    public let fieldBoosts: [String: Double]?

    public init(
        query: String,
        resources: [String]? = nil,
        fields: [String]? = nil,
        limit: Int? = nil,
        limitPerResource: Int? = nil,
        fuzzy: SearchFnFuzzyOption? = nil,
        prefix: Bool? = nil,
        fieldBoosts: [String: Double]? = nil
    ) {
        self.query = query
        self.resources = resources
        self.fields = fields
        self.limit = limit
        self.limitPerResource = limitPerResource
        self.fuzzy = fuzzy
        self.prefix = prefix
        self.fieldBoosts = fieldBoosts
    }
}

public struct SearchFnSearchAllResult: Sendable, Equatable, Codable {
    public let resource: String
    public let id: String
    public let score: Double

    public init(resource: String, id: String, score: Double) {
        self.resource = resource
        self.id = id
        self.score = score
    }
}

public struct SearchFnInitializeResourceConfig: Sendable, Equatable, Codable {
    public let name: String
    public let searchFields: [String]

    public init(name: String, searchFields: [String]) {
        self.name = name
        self.searchFields = searchFields
    }
}

public struct SearchFnInitializeParams: Sendable, Equatable, Codable {
    public let resources: [SearchFnInitializeResourceConfig]

    public init(resources: [SearchFnInitializeResourceConfig]) {
        self.resources = resources
    }
}

public struct SearchFnAdapterCapabilities: Sendable, Equatable, Codable {
    public let persistent: Bool?
    public let searchAll: Bool?
    public let fuzzy: Bool?
    public let prefix: Bool?
    public let fieldBoosts: Bool?
    public let maxBatchSize: Int?

    public init(
        persistent: Bool? = nil,
        searchAll: Bool? = nil,
        fuzzy: Bool? = nil,
        prefix: Bool? = nil,
        fieldBoosts: Bool? = nil,
        maxBatchSize: Int? = nil
    ) {
        self.persistent = persistent
        self.searchAll = searchAll
        self.fuzzy = fuzzy
        self.prefix = prefix
        self.fieldBoosts = fieldBoosts
        self.maxBatchSize = maxBatchSize
    }
}

public struct SearchFnDefaults: Sendable, Equatable, Codable {
    public let limit: Int?
    public let limitPerResource: Int?
    public let fuzzy: SearchFnFuzzyOption?
    public let prefix: Bool?
    public let fieldBoosts: [String: Double]?

    public init(
        limit: Int? = nil,
        limitPerResource: Int? = nil,
        fuzzy: SearchFnFuzzyOption? = nil,
        prefix: Bool? = nil,
        fieldBoosts: [String: Double]? = nil
    ) {
        self.limit = limit
        self.limitPerResource = limitPerResource
        self.fuzzy = fuzzy
        self.prefix = prefix
        self.fieldBoosts = fieldBoosts
    }
}

public protocol SearchFnAdapter: Sendable {
    var name: String { get }
    var capabilities: SearchFnAdapterCapabilities? { get }

    func initialize(_ params: SearchFnInitializeParams) async throws
    func index(_ params: SearchFnIndexParams) async throws
    func search(_ params: SearchFnSearchParams) async throws -> [String]
    func searchAll(_ params: SearchFnSearchAllParams) async throws -> [SearchFnSearchAllResult]?
    func remove(resource: String, ids: [String]) async throws
    func clear(resource: String) async throws
    func dispose() async throws
}

public protocol SearchFnClientProtocol: Sendable {
    func initialize(_ params: SearchFnInitializeParams) async throws
    func index(_ params: SearchFnIndexParams) async throws
    func search(_ params: SearchFnSearchParams) async throws -> [String]
    func searchAll(_ params: SearchFnSearchAllParams) async throws -> [SearchFnSearchAllResult]
    func remove(resource: String, ids: [String]) async throws
    func clear(resource: String) async throws
    func dispose() async throws
    func adapterInfo() -> (name: String, capabilities: SearchFnAdapterCapabilities?)
}

public struct SearchFnClientConfiguration: Sendable {
    public let adapter: any SearchFnAdapter
    public let defaults: SearchFnDefaults?
    public let diagnostics: SearchFnDiagnosticsSink?

    public init(
        adapter: any SearchFnAdapter,
        defaults: SearchFnDefaults? = nil,
        diagnostics: SearchFnDiagnosticsSink? = nil
    ) {
        self.adapter = adapter
        self.defaults = defaults
        self.diagnostics = diagnostics
    }
}

public extension SearchFnError {
    static func invalid(_ message: String, path: String) -> SearchFnError {
        SearchFnError(
            code: "DFQL_INVALID",
            message: message,
            details: SearchFnErrorDetails(path: path)
        )
    }

    static func limitExceeded(_ message: String, path: String) -> SearchFnError {
        SearchFnError(
            code: "LIMIT_EXCEEDED",
            message: message,
            details: SearchFnErrorDetails(path: path)
        )
    }

    static func unsupported(_ message: String, path: String? = nil) -> SearchFnError {
        SearchFnError(
            code: "DFQL_UNSUPPORTED",
            message: message,
            details: path.map { SearchFnErrorDetails(path: $0) }
        )
    }

    static func disposed(message: String = "Search adapter has been disposed") -> SearchFnError {
        SearchFnError(code: SEARCH_ADAPTER_DISPOSED, message: message)
    }

    static func internalError(_ message: String, path: String? = nil) -> SearchFnError {
        SearchFnError(
            code: "INTERNAL",
            message: message,
            details: path.map { SearchFnErrorDetails(path: $0) }
        )
    }
}
