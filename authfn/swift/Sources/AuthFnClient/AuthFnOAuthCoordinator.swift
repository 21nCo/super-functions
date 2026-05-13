import Foundation

public struct AuthFnOAuthCoordinator: Sendable {
    public init() {}

    public func parseCallbackURL(_ url: URL) throws -> AuthFnOAuthCallback {
        return AuthFnOAuthCallback(
            code: callbackValue(url, name: "code"),
            state: callbackValue(url, name: "state"),
            error: callbackValue(url, name: "error")
        )
    }

    public func callbackValue(_ url: URL, name: String) -> String? {
        guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false) else {
            return nil
        }
        if let value = components.queryItems?.first(where: { $0.name == name })?.value {
            return value
        }
        guard let fragment = components.fragment, !fragment.isEmpty else {
            return nil
        }
        let fragmentComponents = URLComponents(string: "authfn://callback?\(fragment)")
        return fragmentComponents?.queryItems?.first(where: { $0.name == name })?.value
    }

    public func callbackErrorPayload(_ url: URL) -> [String: String] {
        [
            "error": callbackValue(url, name: "auth_error") ?? "oauth_callback_failed",
            "errorCode": callbackValue(url, name: "auth_error_code") ?? "",
            "provider": callbackValue(url, name: "auth_provider") ?? "",
            "requestId": callbackValue(url, name: "auth_request_id") ?? "",
        ]
    }

    public func appleAuthorizeContext(from url: URL) -> AuthFnAppleAuthorizeContext? {
        guard
            url.host == "appleid.apple.com",
            url.path == "/auth/authorize",
            let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
            let stateId = components.queryItems?.first(where: { $0.name == "state" })?.value,
            let nonce = components.queryItems?.first(where: { $0.name == "nonce" })?.value
        else {
            return nil
        }
        return AuthFnAppleAuthorizeContext(
            stateId: stateId,
            nonce: nonce,
            accountBaseURL: nil
        )
    }
}
