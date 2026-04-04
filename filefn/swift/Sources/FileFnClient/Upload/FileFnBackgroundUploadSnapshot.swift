import Foundation

public enum FileFnBackgroundUploadStatus: String, Codable, Sendable, Equatable {
    case pending
    case running
    case failed
}

public struct FileFnBackgroundUploadSnapshot: Codable, Sendable, Equatable {
    public let uploadID: String
    public let fileId: String
    public let idempotencyKey: String
    public let policy: String
    public let fileName: String
    public let mimeType: String
    public let metadata: [String: FileFnJSONValue]?
    public let uploadSessionId: String
    public let totalParts: Int
    public let chunkSizeBytes: Int
    public let fileSize: Int64
    public let completedParts: [Int]
    public let chunkFileNames: [Int: String]
    public let requiresUploadSessionToken: Bool
    public let status: FileFnBackgroundUploadStatus
    public let lastError: String?
    public let createdAt: String
    public let updatedAt: String

    public init(
        uploadID: String,
        fileId: String,
        idempotencyKey: String,
        policy: String,
        fileName: String,
        mimeType: String,
        metadata: [String: FileFnJSONValue]? = nil,
        uploadSessionId: String,
        totalParts: Int,
        chunkSizeBytes: Int,
        fileSize: Int64,
        completedParts: [Int],
        chunkFileNames: [Int: String],
        requiresUploadSessionToken: Bool,
        status: FileFnBackgroundUploadStatus,
        lastError: String? = nil,
        createdAt: String,
        updatedAt: String
    ) {
        self.uploadID = uploadID
        self.fileId = fileId
        self.idempotencyKey = idempotencyKey
        self.policy = policy
        self.fileName = fileName
        self.mimeType = mimeType
        self.metadata = metadata
        self.uploadSessionId = uploadSessionId
        self.totalParts = totalParts
        self.chunkSizeBytes = chunkSizeBytes
        self.fileSize = fileSize
        self.completedParts = completedParts.sorted()
        self.chunkFileNames = chunkFileNames
        self.requiresUploadSessionToken = requiresUploadSessionToken
        self.status = status
        self.lastError = lastError
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }

    func updating(
        completedParts: [Int]? = nil,
        status: FileFnBackgroundUploadStatus? = nil,
        lastError: String? = nil,
        updatedAt: String = fileFnISO8601Timestamp()
    ) -> FileFnBackgroundUploadSnapshot {
        FileFnBackgroundUploadSnapshot(
            uploadID: uploadID,
            fileId: fileId,
            idempotencyKey: idempotencyKey,
            policy: policy,
            fileName: fileName,
            mimeType: mimeType,
            metadata: metadata,
            uploadSessionId: uploadSessionId,
            totalParts: totalParts,
            chunkSizeBytes: chunkSizeBytes,
            fileSize: fileSize,
            completedParts: completedParts ?? self.completedParts,
            chunkFileNames: chunkFileNames,
            requiresUploadSessionToken: requiresUploadSessionToken,
            status: status ?? self.status,
            lastError: lastError,
            createdAt: createdAt,
            updatedAt: updatedAt
        )
    }
}
