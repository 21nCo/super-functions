import Foundation
#if canImport(Security)
import Security
#endif

public actor FileFnKeychainSecretStore: FileFnSecretStore {
    private let serviceName: String

    public init(serviceName: String) {
        self.serviceName = serviceName
    }

    public func storeUploadSessionToken(_ token: String, uploadID: String) async throws {
        #if canImport(Security)
        let encoded = Data(token.utf8)
        let query: [CFString: Any] = [
            kSecClass: kSecClassGenericPassword,
            kSecAttrService: serviceName,
            kSecAttrAccount: uploadID,
        ]
        let attributes: [CFString: Any] = [kSecValueData: encoded]

        let status = SecItemCopyMatching(query as CFDictionary, nil)
        if status == errSecSuccess {
            let updateStatus = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
            guard updateStatus == errSecSuccess else {
                throw FileFnClientError.fileAccess(reason: "Unable to update keychain secret for \(uploadID): \(updateStatus)")
            }
            return
        }
        guard status == errSecItemNotFound else {
            throw FileFnClientError.fileAccess(reason: "Unable to query keychain secret for \(uploadID): \(status)")
        }

        var insert = query
        insert[kSecValueData] = encoded
        let insertStatus = SecItemAdd(insert as CFDictionary, nil)
        guard insertStatus == errSecSuccess else {
            throw FileFnClientError.fileAccess(reason: "Unable to store keychain secret for \(uploadID): \(insertStatus)")
        }
        #else
        throw FileFnClientError.fileAccess(reason: "Keychain secret store requires Security framework support")
        #endif
    }

    public func loadUploadSessionToken(uploadID: String) async throws -> String? {
        #if canImport(Security)
        let query: [CFString: Any] = [
            kSecClass: kSecClassGenericPassword,
            kSecAttrService: serviceName,
            kSecAttrAccount: uploadID,
            kSecReturnData: true,
            kSecMatchLimit: kSecMatchLimitOne,
        ]

        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        if status == errSecItemNotFound {
            return nil
        }
        guard status == errSecSuccess,
              let data = item as? Data,
              let token = String(data: data, encoding: .utf8) else {
            throw FileFnClientError.fileAccess(reason: "Unable to load keychain secret for \(uploadID): \(status)")
        }
        return token
        #else
        return nil
        #endif
    }

    public func deleteUploadSessionToken(uploadID: String) async throws {
        #if canImport(Security)
        let query: [CFString: Any] = [
            kSecClass: kSecClassGenericPassword,
            kSecAttrService: serviceName,
            kSecAttrAccount: uploadID,
        ]
        let status = SecItemDelete(query as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw FileFnClientError.fileAccess(reason: "Unable to delete keychain secret for \(uploadID): \(status)")
        }
        #endif
    }
}
