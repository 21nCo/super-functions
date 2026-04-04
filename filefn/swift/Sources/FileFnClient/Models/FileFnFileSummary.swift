import Foundation

public struct FileFnFileSummary: Codable, Sendable, Equatable {
    public let fileId: String
    public let currentVersionId: String
    public let ownerId: String
    public let tenantId: String?
    public let visibility: String
    public let policy: String
    public let mimeType: String
    public let size: Int64
    public let name: String
    public let metadata: [String: FileFnJSONValue]
    public let createdAt: String
    public let updatedAt: String

    enum CodingKeys: String, CodingKey {
        case fileId
        case currentVersionId
        case ownerId
        case tenantId
        case visibility
        case policy
        case mimeType
        case size
        case name
        case metadata
        case createdAt
        case updatedAt
    }

    public init(
        fileId: String,
        currentVersionId: String,
        ownerId: String,
        tenantId: String?,
        visibility: String,
        policy: String,
        mimeType: String,
        size: Int64,
        name: String,
        metadata: [String: FileFnJSONValue],
        createdAt: String,
        updatedAt: String
    ) {
        self.fileId = fileId
        self.currentVersionId = currentVersionId
        self.ownerId = ownerId
        self.tenantId = tenantId
        self.visibility = visibility
        self.policy = policy
        self.mimeType = mimeType
        self.size = size
        self.name = name
        self.metadata = metadata
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        fileId = try container.decode(String.self, forKey: .fileId)
        currentVersionId = try container.decode(String.self, forKey: .currentVersionId)
        ownerId = try container.decode(String.self, forKey: .ownerId)
        tenantId = try container.decodeIfPresent(String.self, forKey: .tenantId)
        visibility = try container.decode(String.self, forKey: .visibility)
        policy = try container.decode(String.self, forKey: .policy)
        mimeType = try container.decode(String.self, forKey: .mimeType)
        size = try container.decode(Int64.self, forKey: .size)
        name = try container.decode(String.self, forKey: .name)
        metadata = try container.decodeIfPresent([String: FileFnJSONValue].self, forKey: .metadata) ?? [:]
        createdAt = try container.decode(String.self, forKey: .createdAt)
        updatedAt = try container.decode(String.self, forKey: .updatedAt)
    }
}

public struct FileFnFilePage: Codable, Sendable, Equatable {
    public let files: [FileFnFileSummary]
    public let nextCursor: String?

    public init(files: [FileFnFileSummary], nextCursor: String?) {
        self.files = files
        self.nextCursor = nextCursor
    }
}
