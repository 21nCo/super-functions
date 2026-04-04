import Foundation

public struct FileFnVersionSummary: Codable, Sendable, Equatable {
    public let versionId: String
    public let size: Int64
    public let mimeType: String
    public let createdAt: String

    public init(versionId: String, size: Int64, mimeType: String, createdAt: String) {
        self.versionId = versionId
        self.size = size
        self.mimeType = mimeType
        self.createdAt = createdAt
    }
}

public struct FileFnVersionDetail: Codable, Sendable, Equatable {
    public let versionId: String
    public let fileId: String
    public let size: Int64
    public let mimeType: String
    public let createdAt: String

    public init(versionId: String, fileId: String, size: Int64, mimeType: String, createdAt: String) {
        self.versionId = versionId
        self.fileId = fileId
        self.size = size
        self.mimeType = mimeType
        self.createdAt = createdAt
    }
}
