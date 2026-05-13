import Foundation

public struct AuthFnHandoffCoordinator: Sendable {
    private let client: AuthFnClient

    public init(client: AuthFnClient) {
        self.client = client
    }

    public func nativeToWebConsumeURL(returnTo: String = "/") async throws -> URL {
        let handoff = try await client.startWebHandoff(returnTo: returnTo)
        guard
            let rawURL = handoff.consumeUrl,
            let url = URL(string: rawURL),
            let scheme = url.scheme?.lowercased(),
            ["http", "https"].contains(scheme),
            url.host != nil
        else {
            throw AuthFnError.invalidResponse
        }
        return url
    }

    public func exchangeWebCreatedNativeCode(_ code: String, regionId: String? = nil) async throws -> AuthFnSessionCredential {
        try await client.exchangeNativeHandoff(code: code, regionId: regionId)
    }
}
