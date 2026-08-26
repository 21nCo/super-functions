import Foundation

public final class AuthFnClient: Sendable {
    private let configuration: AuthFnConfiguration
    private let credentialStore: AuthFnCredentialStore
    private let regionCache: AuthFnRegionCache
    private let decoder = JSONDecoder()
    private let encoder = JSONEncoder()

    public var cookiePrefix: String {
        configuration.cookiePrefix
    }

    public init(
        configuration: AuthFnConfiguration,
        credentialStore: AuthFnCredentialStore = AuthFnInMemoryCredentialStore(),
        regionCache: AuthFnRegionCache = AuthFnRegionCache()
    ) {
        self.configuration = configuration
        self.credentialStore = credentialStore
        self.regionCache = regionCache
    }

    public func runtime(regionId: String? = nil) async throws -> AuthFnRuntime {
        try await get(path: "/environment", regionId: regionId ?? configuration.defaultRegionId)
    }

    public func lookupRegion(identifier: String) async throws -> AuthFnRegion {
        let normalized = normalize(identifier)
        let region: AuthFnRegion = try await post(
            path: "/regions/lookup",
            regionId: configuration.defaultRegionId,
            body: ["identifier": normalized]
        )
        await regionCache.set(identifier: normalized, regionId: region.regionId, authority: region.authority)
        return region
    }

    public func signInWithPassword(email: String, password: String) async throws -> AuthFnSessionCredential {
        try await credentialFromRegionalRequest(identifier: email) { regionId in
            try await self.post(
                path: "/sign-in/password",
                regionId: regionId,
                body: [
                    "email": self.normalize(email),
                    "password": password,
                    "sessionMode": "bearer",
                ]
            )
        }
    }

    public func signUpWithPassword(email: String, password: String, profile: [String: String]? = nil) async throws -> AuthFnSessionCredential {
        var body: [String: Any] = [
            "email": normalize(email),
            "password": password,
            "sessionMode": "bearer",
        ]
        if let profile {
            body["profile"] = profile
        }
        let credential: AuthFnSessionCredential = try await post(
            path: "/sign-up/password",
            regionId: configuration.defaultRegionId,
            body: body
        )
        try await credentialStore.saveCredential(credential)
        return credential
    }

    public func sendOtp(email: String, purpose: String = "sign-in") async throws {
        let regionId = try await regionIdFor(identifier: email)
        let _: EmptyData = try await post(
            path: "/otp/send",
            regionId: regionId,
            body: [
                "email": normalize(email),
                "purpose": purpose,
            ]
        )
    }

    public func verifyOtp(email: String, code: String, purpose: String = "sign-in") async throws -> AuthFnSessionCredential {
        try await credentialFromRegionalRequest(identifier: email) { regionId in
            try await self.post(
                path: "/otp/verify",
                regionId: regionId,
                body: [
                    "email": self.normalize(email),
                    "purpose": purpose,
                    "code": code,
                    "sessionMode": "bearer",
                ]
            )
        }
    }

    public func startWebHandoff(returnTo: String = "/") async throws -> AuthFnHandoffStart {
        let credential = try await requireCredential()
        return try await post(
            path: "/handoff/web/start",
            regionId: credential.session.regionId ?? configuration.defaultRegionId,
            body: ["returnTo": returnTo],
            bearerToken: credential.token
        )
    }

    public func exchangeNativeHandoff(code: String, regionId: String? = nil, device: [String: String] = [:]) async throws -> AuthFnSessionCredential {
        let credential: AuthFnSessionCredential = try await post(
            path: "/handoff/native/exchange",
            regionId: regionId ?? configuration.defaultRegionId,
            body: [
                "code": code,
                "device": device,
            ]
        )
        try await credentialStore.saveCredential(credential)
        return credential
    }

    public func exchangeNativeHandoff(
        code: String,
        accountBaseURL: URL,
        device: [String: String] = [:]
    ) async throws -> AuthFnSessionCredential {
        let credential: AuthFnSessionCredential = try await post(
            url: authURL(accountBaseURL: accountBaseURL, path: "/handoff/native/exchange"),
            body: [
                "code": code,
                "device": device,
            ]
        )
        try await credentialStore.saveCredential(credential)
        return credential
    }

    public func requestWidgetToken(
        sessionToken: String,
        accountBaseURL: URL
    ) async throws -> AuthFnWidgetToken {
        try await post(
            url: authURL(accountBaseURL: accountBaseURL, path: "/widget-token"),
            body: [:],
            bearerToken: sessionToken
        )
    }

    public func startNativeAppleSignIn(
        accountBaseURL: URL,
        returnTo: String,
        handoffMode: String = "session-token"
    ) async throws -> AuthFnNativeAppleSignInStart {
        try await post(
            url: authURL(accountBaseURL: accountBaseURL, path: "/social/native/apple/start"),
            body: [
                "returnTo": returnTo,
                "handoffMode": handoffMode,
            ]
        )
    }

    public func completeNativeAppleSignIn(
        accountBaseURL: URL,
        stateId: String,
        identityToken: String,
        authorizationCode: String?,
        user: AuthFnNativeAppleUser? = nil,
        device: [String: String] = [:]
    ) async throws -> AuthFnNativeAppleSignInResult {
        var body: [String: Any] = [
            "stateId": stateId,
            "identityToken": identityToken,
            "device": device,
        ]
        if let authorizationCode {
            body["authorizationCode"] = authorizationCode
        }
        if let user {
            let userData = try encoder.encode(user)
            body["user"] = try JSONSerialization.jsonObject(with: userData)
        }
        let result: AuthFnNativeAppleSignInResult = try await post(
            url: authURL(accountBaseURL: accountBaseURL, path: "/social/native/apple/complete"),
            body: body
        )
        if let session = result.session {
            try await credentialStore.saveCredential(AuthFnSessionCredential(session: session, token: result.token))
        }
        return result
    }

    public func signOut() async throws {
        try await credentialStore.clearCredential()
    }

    public func storedCredential() async throws -> AuthFnSessionCredential? {
        try await credentialStore.loadCredential()
    }

    private func credentialFromRegionalRequest(
        identifier: String,
        operation: @escaping @Sendable (String) async throws -> AuthFnSessionCredential
    ) async throws -> AuthFnSessionCredential {
        do {
            let credential = try await operation(try await regionIdFor(identifier: identifier))
            try await credentialStore.saveCredential(credential)
            return credential
        } catch AuthFnError.server(let code, _) where code == "AUTHFN_REGION_MISMATCH" {
            _ = try await lookupRegion(identifier: identifier)
            let credential = try await operation(try await regionIdFor(identifier: identifier))
            try await credentialStore.saveCredential(credential)
            return credential
        } catch {
            throw error
        }
    }

    private func regionIdFor(identifier: String) async throws -> String {
        if let cached = await regionCache.get(identifier: identifier) {
            return cached.regionId
        }
        return try await lookupRegion(identifier: identifier).regionId
    }

    private func requireCredential() async throws -> AuthFnSessionCredential {
        guard let credential = try await credentialStore.loadCredential() else {
            throw AuthFnError.unauthenticated
        }
        return credential
    }

    private func get<T: Decodable>(path: String, regionId: String) async throws -> T {
        var request = URLRequest(url: configuration.resolveBaseURL(regionId).appendingPathComponent(String(path.dropFirst())))
        request.httpMethod = "GET"
        return try await send(request)
    }

    private func post<T: Decodable>(path: String, regionId: String, body: [String: Any], bearerToken: String? = nil) async throws -> T {
        var request = URLRequest(url: configuration.resolveBaseURL(regionId).appendingPathComponent(String(path.dropFirst())))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "content-type")
        if let bearerToken {
            request.setValue("Bearer \(bearerToken)", forHTTPHeaderField: "authorization")
        }
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        return try await send(request)
    }

    private func post<T: Decodable>(url: URL, body: [String: Any], bearerToken: String? = nil) async throws -> T {
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "content-type")
        request.setValue("application/json", forHTTPHeaderField: "accept")
        if let bearerToken {
            request.setValue("Bearer \(bearerToken)", forHTTPHeaderField: "authorization")
        }
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        return try await send(request)
    }

    private func send<T: Decodable>(_ request: URLRequest) async throws -> T {
        let (data, _) = try await configuration.urlSession.data(for: request)
        let envelope = try decoder.decode(AuthFnEnvelope<T>.self, from: data)
        if envelope.ok {
            if let data = envelope.data {
                return data
            }
            if T.self == EmptyData.self {
                return EmptyData() as! T
            }
        }
        if let error = envelope.error {
            throw AuthFnError.server(code: error.code, message: error.message)
        }
        throw AuthFnError.invalidResponse
    }

    private func normalize(_ identifier: String) -> String {
        identifier.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    }

    private func authURL(accountBaseURL: URL, path: String) -> URL {
        var url = accountBaseURL
        url.appendPathComponent("auth")
        url.appendPathComponent(path.hasPrefix("/") ? String(path.dropFirst()) : path)
        return url
    }
}

private struct EmptyData: Decodable {}
