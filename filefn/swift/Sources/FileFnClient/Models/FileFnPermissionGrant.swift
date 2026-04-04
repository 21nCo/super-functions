import Foundation

public struct FileFnCreateGrantRequest: Codable, Sendable, Equatable {
    public var userId: String?
    public var role: String?
    public var tenantId: String?
    public var canRead: Bool?
    public var canWrite: Bool?
    public var canDelete: Bool?
    public var canShare: Bool?
    public var expiresAt: String?

    public init(
        userId: String? = nil,
        role: String? = nil,
        tenantId: String? = nil,
        canRead: Bool? = nil,
        canWrite: Bool? = nil,
        canDelete: Bool? = nil,
        canShare: Bool? = nil,
        expiresAt: String? = nil
    ) {
        self.userId = userId
        self.role = role
        self.tenantId = tenantId
        self.canRead = canRead
        self.canWrite = canWrite
        self.canDelete = canDelete
        self.canShare = canShare
        self.expiresAt = expiresAt
    }
}

public struct FileFnPermissionGrant: Codable, Sendable, Equatable {
    public let permissionId: String
    public let fileId: String
    public let userId: String?
    public let role: String?
    public let tenantId: String?
    public let canRead: Bool
    public let canWrite: Bool
    public let canDelete: Bool
    public let canShare: Bool
    public let expiresAt: String?
    public let createdAt: String

    public init(
        permissionId: String,
        fileId: String,
        userId: String?,
        role: String?,
        tenantId: String?,
        canRead: Bool,
        canWrite: Bool,
        canDelete: Bool,
        canShare: Bool,
        expiresAt: String?,
        createdAt: String
    ) {
        self.permissionId = permissionId
        self.fileId = fileId
        self.userId = userId
        self.role = role
        self.tenantId = tenantId
        self.canRead = canRead
        self.canWrite = canWrite
        self.canDelete = canDelete
        self.canShare = canShare
        self.expiresAt = expiresAt
        self.createdAt = createdAt
    }
}
