import Foundation

public protocol FileFnSecretStore: Sendable {
    func storeUploadSessionToken(_ token: String, uploadID: String) async throws
    func loadUploadSessionToken(uploadID: String) async throws -> String?
    func deleteUploadSessionToken(uploadID: String) async throws
}
