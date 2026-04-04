import Foundation

public struct FileFnFileDetail: Codable, Sendable, Equatable {
    public let fileId: String
    public let currentVersionId: String
    public let ownerId: String
    public let tenantId: String?
    public let visibility: String
    public let mimeType: String
    public let size: Int64
    public let name: String
    public let createdAt: String
    public let updatedAt: String

    public init(
        fileId: String,
        currentVersionId: String,
        ownerId: String,
        tenantId: String?,
        visibility: String,
        mimeType: String,
        size: Int64,
        name: String,
        createdAt: String,
        updatedAt: String
    ) {
        self.fileId = fileId
        self.currentVersionId = currentVersionId
        self.ownerId = ownerId
        self.tenantId = tenantId
        self.visibility = visibility
        self.mimeType = mimeType
        self.size = size
        self.name = name
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }
}
