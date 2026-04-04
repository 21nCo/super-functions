import Foundation

public struct FileFnTriggerProcessingRequest: Codable, Sendable, Equatable {
    public var versionId: String?
    public var storageKey: String
    public var mimeType: String
    public var size: Int64
    public var fileName: String

    public init(
        versionId: String? = nil,
        storageKey: String,
        mimeType: String,
        size: Int64,
        fileName: String
    ) {
        self.versionId = versionId
        self.storageKey = storageKey
        self.mimeType = mimeType
        self.size = size
        self.fileName = fileName
    }
}

public struct FileFnProcessingStatus: Codable, Sendable, Equatable {
    public let started: Bool
    public let enqueued: Bool
    public let jobId: String?

    public init(started: Bool, enqueued: Bool, jobId: String?) {
        self.started = started
        self.enqueued = enqueued
        self.jobId = jobId
    }
}
