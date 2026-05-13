import Foundation

public struct AuthFnConfiguration: Sendable {
    public var defaultRegionId: String
    public var resolveBaseURL: @Sendable (String) -> URL
    public var urlSession: URLSession
    public var cookiePrefix: String

    public init(
        defaultRegionId: String,
        baseURL: URL,
        cookiePrefix: String = "authfn",
        urlSession: URLSession = .shared
    ) {
        self.defaultRegionId = defaultRegionId
        self.resolveBaseURL = { _ in baseURL }
        self.urlSession = urlSession
        self.cookiePrefix = AuthFnConfiguration.normalizeCookiePrefix(cookiePrefix)
    }

    public init(
        defaultRegionId: String,
        cookiePrefix: String = "authfn",
        urlSession: URLSession = .shared,
        resolveBaseURL: @escaping @Sendable (String) -> URL
    ) {
        self.defaultRegionId = defaultRegionId
        self.resolveBaseURL = resolveBaseURL
        self.urlSession = urlSession
        self.cookiePrefix = AuthFnConfiguration.normalizeCookiePrefix(cookiePrefix)
    }

    private static func normalizeCookiePrefix(_ value: String) -> String {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? "authfn" : trimmed
    }
}

public struct AuthFnRuntime: Codable, Equatable, Sendable {
    public var issuer: String
    public var baseUrl: String
    public var regionId: String?
}

public struct AuthFnRegion: Codable, Equatable, Sendable {
    public var identifier: String
    public var regionId: String
    public var authority: String
    public var domain: String?
    public var continueLocally: Bool
    public var redirectTo: String?
}

public struct AuthFnSession: Codable, Equatable, Sendable {
    public var id: String
    public var actorId: String
    public var regionId: String?
    public var primaryEmail: String?
    public var methods: [String]
}

public struct AuthFnSessionCredential: Codable, Equatable, Sendable {
    public var session: AuthFnSession
    public var token: String
}

public struct AuthFnHandoffStart: Codable, Equatable, Sendable {
    public var code: String
    public var regionId: String?
    public var expiresAt: String
    public var consumeUrl: String?
}

public struct AuthFnWidgetToken: Codable, Equatable, Sendable {
    public var token: String
    public var expiresAt: String?
}

public struct AuthFnNativeAppleSignInStart: Codable, Equatable, Sendable {
    public var stateId: String
    public var nonce: String
}

public struct AuthFnNativeAppleUserName: Codable, Equatable, Sendable {
    public var firstName: String?
    public var lastName: String?

    public init(firstName: String? = nil, lastName: String? = nil) {
        self.firstName = firstName
        self.lastName = lastName
    }
}

public struct AuthFnNativeAppleUser: Codable, Equatable, Sendable {
    public var email: String?
    public var name: AuthFnNativeAppleUserName?

    public init(email: String? = nil, name: AuthFnNativeAppleUserName? = nil) {
        self.email = email
        self.name = name
    }
}

public struct AuthFnNativeAppleSignInResult: Codable, Equatable, Sendable {
    public var token: String
    public var session: AuthFnSession?
    public var userId: String?
    public var regionId: String?
    public var isNewUser: Bool?
}

public struct AuthFnOAuthCallback: Equatable, Sendable {
    public var code: String?
    public var state: String?
    public var error: String?
}

public struct AuthFnAppleAuthorizeContext: Equatable, Sendable {
    public var stateId: String
    public var nonce: String
    public var accountBaseURL: URL?
}

public enum AuthFnError: Error, Equatable, Sendable {
    case invalidResponse
    case server(code: String, message: String)
    case missingToken
    case unauthenticated
}

struct AuthFnEnvelope<T: Decodable>: Decodable {
    struct EnvelopeError: Decodable {
        var code: String
        var message: String
    }

    var ok: Bool
    var data: T?
    var error: EnvelopeError?
}
