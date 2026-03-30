import DatafnServerSync
import Foundation

public struct DatafnAuthConfiguration: Sendable {
    public typealias BearerTokenProvider = @Sendable () async throws -> String?
    public typealias RequestInterceptor = @Sendable (
        URLRequest,
        DatafnServerRequestContext
    ) async throws -> URLRequest

    public let staticHeaders: [String: String]
    public let websocketHeaders: [String: String]
    public let bearerToken: String?
    public let bearerTokenProvider: BearerTokenProvider?
    public let requestInterceptor: RequestInterceptor?
    public let includeStaticHeadersOnWebSocket: Bool
    public let includeBearerTokenOnWebSocket: Bool

    public init(
        staticHeaders: [String: String] = [:],
        websocketHeaders: [String: String] = [:],
        bearerToken: String? = nil,
        bearerTokenProvider: BearerTokenProvider? = nil,
        requestInterceptor: RequestInterceptor? = nil,
        includeStaticHeadersOnWebSocket: Bool = true,
        includeBearerTokenOnWebSocket: Bool = true
    ) {
        self.staticHeaders = staticHeaders
        self.websocketHeaders = websocketHeaders
        self.bearerToken = bearerToken
        self.bearerTokenProvider = bearerTokenProvider
        self.requestInterceptor = requestInterceptor
        self.includeStaticHeadersOnWebSocket = includeStaticHeadersOnWebSocket
        self.includeBearerTokenOnWebSocket = includeBearerTokenOnWebSocket
    }

    public static func bearerToken(
        _ token: String,
        staticHeaders: [String: String] = [:],
        websocketHeaders: [String: String] = [:],
        requestInterceptor: RequestInterceptor? = nil,
        includeStaticHeadersOnWebSocket: Bool = true,
        includeBearerTokenOnWebSocket: Bool = true
    ) -> Self {
        Self(
            staticHeaders: staticHeaders,
            websocketHeaders: websocketHeaders,
            bearerToken: token,
            requestInterceptor: requestInterceptor,
            includeStaticHeadersOnWebSocket: includeStaticHeadersOnWebSocket,
            includeBearerTokenOnWebSocket: includeBearerTokenOnWebSocket
        )
    }
}

extension DatafnAuthConfiguration {
    func makeRequestAuthorizer(
        profileID: String
    ) -> DatafnServerRequestAuthorizer {
        { request, context in
            var authorized = request

            if context.transport == .http || self.includeStaticHeadersOnWebSocket {
                for (field, value) in self.staticHeaders {
                    authorized.setValue(value, forHTTPHeaderField: field)
                }
            }

            if context.transport == .webSocket {
                for (field, value) in self.websocketHeaders {
                    authorized.setValue(value, forHTTPHeaderField: field)
                }
            }

            let resolvedBearer: String?
            if let bearerTokenProvider = self.bearerTokenProvider {
                resolvedBearer = try await bearerTokenProvider()
            } else {
                resolvedBearer = self.bearerToken
            }

            if
                let resolvedBearer,
                !resolvedBearer.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
                context.transport == .http || self.includeBearerTokenOnWebSocket
            {
                authorized.setValue("Bearer \(resolvedBearer)", forHTTPHeaderField: "Authorization")
            }

            if let requestInterceptor = self.requestInterceptor {
                authorized = try await requestInterceptor(
                    authorized,
                    DatafnServerRequestContext(
                        method: context.method,
                        profileID: profileID,
                        url: context.url,
                        transport: context.transport
                    )
                )
            }

            return authorized
        }
    }
}
