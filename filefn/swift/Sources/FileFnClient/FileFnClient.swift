import Foundation

public actor FileFnClient {
    let configuration: FileFnClientConfiguration
    let normalizedBaseURL: URL
    let executor: FileFnRequestExecutor

    public init(configuration: FileFnClientConfiguration) throws {
        self.configuration = configuration
        self.normalizedBaseURL = try configuration.normalizedBaseURL()
        self.executor = FileFnRequestExecutor(
            configuration: configuration,
            normalizedBaseURL: try configuration.normalizedBaseURL()
        )
    }

    func makeRequest(
        method: String,
        path: String,
        query: [String: String] = [:],
        requiresUploadSessionToken: Bool,
        hasIdempotencyKey: Bool = false,
        extraHeaders: [String: String] = [:]
    ) async throws -> URLRequest {
        try await executor.buildRequest(
            method: method,
            path: path,
            query: query.mapValues { Optional($0) },
            requiresUploadSessionToken: requiresUploadSessionToken,
            hasIdempotencyKey: hasIdempotencyKey,
            extraHeaders: extraHeaders
        )
    }

    func emitLog(_ event: FileFnLogEvent) {
        configuration.logger?.log(event.redacted())
    }
}
