import Foundation

public protocol FileFnAuthProvider: Sendable {
    func headers(for request: FileFnAuthContext) async throws -> [String: String]
}

public struct FileFnAuthContext: Sendable, Equatable {
    public let method: String
    public let path: String
    public let requiresUploadSessionToken: Bool

    public init(
        method: String,
        path: String,
        requiresUploadSessionToken: Bool
    ) {
        self.method = method
        self.path = path
        self.requiresUploadSessionToken = requiresUploadSessionToken
    }
}
