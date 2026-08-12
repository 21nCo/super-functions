import Foundation
import Security

public protocol AuthFnCredentialStore: Sendable {
    func loadCredential() async throws -> AuthFnSessionCredential?
    func saveCredential(_ credential: AuthFnSessionCredential) async throws
    func clearCredential() async throws
}

public actor AuthFnInMemoryCredentialStore: AuthFnCredentialStore {
    private var credential: AuthFnSessionCredential?

    public init(credential: AuthFnSessionCredential? = nil) {
        self.credential = credential
    }

    public func loadCredential() async throws -> AuthFnSessionCredential? {
        credential
    }

    public func saveCredential(_ credential: AuthFnSessionCredential) async throws {
        self.credential = credential
    }

    public func clearCredential() async throws {
        credential = nil
    }
}

public struct AuthFnKeychainCredentialStore: AuthFnCredentialStore {
    private let service: String
    private let account: String
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    public init(service: String = "authfn", account: String = "session") {
        self.service = service
        self.account = account
    }

    public func loadCredential() async throws -> AuthFnSessionCredential? {
        var query = baseQuery()
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne

        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        if status == errSecItemNotFound {
            return nil
        }
        guard status == errSecSuccess, let data = item as? Data else {
            throw AuthFnError.unauthenticated
        }
        return try decoder.decode(AuthFnSessionCredential.self, from: data)
    }

    public func saveCredential(_ credential: AuthFnSessionCredential) async throws {
        let data = try encoder.encode(credential)
        var query = baseQuery()
        let attributes = [kSecValueData as String: data]
        let status = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
        if status == errSecItemNotFound {
            query[kSecValueData as String] = data
            let addStatus = SecItemAdd(query as CFDictionary, nil)
            guard addStatus == errSecSuccess else {
                throw AuthFnError.unauthenticated
            }
            return
        }
        guard status == errSecSuccess else {
            throw AuthFnError.unauthenticated
        }
    }

    public func clearCredential() async throws {
        let status = SecItemDelete(baseQuery() as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw AuthFnError.unauthenticated
        }
    }

    private func baseQuery() -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
    }
}

public struct AuthFnKeychainBearerTokenStore: Sendable {
    private let service: String
    private let account: String

    public init(service: String = "authfn", account: String = "session-token") {
        self.service = service
        self.account = account
    }

    public func saveToken(_ token: String) throws {
        guard let data = token.data(using: .utf8) else {
            throw AuthFnError.invalidResponse
        }

        var query = baseQuery()
        let attributes = [kSecValueData as String: data]
        let updateStatus = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
        if updateStatus == errSecSuccess {
            return
        }
        if updateStatus != errSecItemNotFound {
            throw AuthFnError.unauthenticated
        }

        query[kSecValueData as String] = data
        let addStatus = SecItemAdd(query as CFDictionary, nil)
        guard addStatus == errSecSuccess else {
            throw AuthFnError.unauthenticated
        }
    }

    public func readToken() throws -> String? {
        var query = baseQuery()
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne

        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        if status == errSecItemNotFound {
            return nil
        }
        guard status == errSecSuccess, let data = result as? Data else {
            throw AuthFnError.unauthenticated
        }
        guard let token = String(data: data, encoding: .utf8) else {
            throw AuthFnError.unauthenticated
        }
        return token
    }

    public func deleteToken() throws {
        try deleteToken(ignoringMissing: true)
    }

    private func deleteToken(ignoringMissing: Bool) throws {
        let status = SecItemDelete(baseQuery() as CFDictionary)
        if status == errSecItemNotFound && ignoringMissing {
            return
        }
        guard status == errSecSuccess else {
            throw AuthFnError.unauthenticated
        }
    }

    private func baseQuery() -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
    }
}
