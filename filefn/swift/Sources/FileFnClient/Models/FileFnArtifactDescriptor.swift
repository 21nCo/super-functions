import Foundation

public struct FileFnArtifactDescriptor: Codable, Sendable, Equatable {
    public let artifactId: String
    public let fileId: String
    public let versionId: String
    public let kind: String
    public let mimeType: String
    public let size: Int64
    public let createdAt: String

    public init(
        artifactId: String,
        fileId: String,
        versionId: String,
        kind: String,
        mimeType: String,
        size: Int64,
        createdAt: String
    ) {
        self.artifactId = artifactId
        self.fileId = fileId
        self.versionId = versionId
        self.kind = kind
        self.mimeType = mimeType
        self.size = size
        self.createdAt = createdAt
    }
}
