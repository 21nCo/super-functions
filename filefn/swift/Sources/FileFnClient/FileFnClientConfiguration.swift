import Foundation

public struct FileFnRetryPolicy: Sendable, Equatable {
    public var maxAttempts: Int
    public var baseDelayMilliseconds: Int
    public var maxDelayMilliseconds: Int
    public var retryableStatusCodes: Set<Int>

    public init(
        maxAttempts: Int = 3,
        baseDelayMilliseconds: Int = 250,
        maxDelayMilliseconds: Int = 2_000,
        retryableStatusCodes: Set<Int> = [408, 425, 429, 500, 502, 503, 504]
    ) {
        self.maxAttempts = maxAttempts
        self.baseDelayMilliseconds = baseDelayMilliseconds
        self.maxDelayMilliseconds = maxDelayMilliseconds
        self.retryableStatusCodes = retryableStatusCodes
    }

    public static let `default` = FileFnRetryPolicy()

    func shouldRetry(
        method: String,
        path: String,
        hasIdempotencyKey: Bool
    ) -> Bool {
        let normalizedMethod = method.uppercased()
        if normalizedMethod == "GET" {
            return true
        }

        if normalizedMethod == "DELETE" {
            return true
        }

        if normalizedMethod == "PUT" {
            return true
        }

        guard normalizedMethod == "POST" else {
            return false
        }

        if path == "/upload/init" {
            return hasIdempotencyKey
        }

        let idempotentUploadRoutes = [
            "/complete",
            "/abort",
            "/sign",
        ]
        if idempotentUploadRoutes.contains(where: { path.hasSuffix($0) }) {
            return true
        }
        if path.contains("/parts/") && path.hasSuffix("/complete") {
            return true
        }

        return false
    }
}

public struct FileFnClientConfiguration: @unchecked Sendable {
    public var baseURL: URL
    public var authProvider: (any FileFnAuthProvider)?
    public var defaultHeaders: [String: String]
    public var retryPolicy: FileFnRetryPolicy
    public var requestIDProvider: (@Sendable () -> String?)?
    public var logger: (any FileFnLogger)?
    public var sendClientVersionHeader: Bool
    public var urlSession: URLSession
    public var jsonEncoder: JSONEncoder
    public var jsonDecoder: JSONDecoder

    public init(
        baseURL: URL,
        authProvider: (any FileFnAuthProvider)? = nil,
        defaultHeaders: [String: String] = [:],
        retryPolicy: FileFnRetryPolicy = .default,
        requestIDProvider: (@Sendable () -> String?)? = nil,
        logger: (any FileFnLogger)? = nil,
        sendClientVersionHeader: Bool = true,
        urlSession: URLSession = .shared,
        jsonEncoder: JSONEncoder = JSONEncoder(),
        jsonDecoder: JSONDecoder = JSONDecoder()
    ) {
        self.baseURL = baseURL
        self.authProvider = authProvider
        self.defaultHeaders = defaultHeaders
        self.retryPolicy = retryPolicy
        self.requestIDProvider = requestIDProvider
        self.logger = logger
        self.sendClientVersionHeader = sendClientVersionHeader
        self.urlSession = urlSession
        self.jsonEncoder = jsonEncoder
        self.jsonDecoder = jsonDecoder
    }

    func normalizedBaseURL() throws -> URL {
        guard baseURL.scheme != nil, baseURL.host != nil else {
            throw FileFnClientError.configurationInvalid(
                field: "baseURL",
                message: "baseURL must be an absolute URL"
            )
        }

        let absolute = baseURL.absoluteString
        if absolute.hasSuffix("/") {
            guard let trimmed = URL(string: String(absolute.dropLast())) else {
                throw FileFnClientError.configurationInvalid(
                    field: "baseURL",
                    message: "baseURL normalization failed"
                )
            }
            return trimmed
        }
        return baseURL
    }
}
