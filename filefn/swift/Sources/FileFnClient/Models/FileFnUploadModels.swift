import Foundation

public enum FileFnUploadMode: String, Codable, Sendable, Equatable {
    case multipartSignedURL = "multipart-signed-url"
    case proxy
}

public struct FileFnCreateUploadSessionRequest: Encodable, Sendable, Equatable {
    public let policy: String
    public let fileName: String
    public let size: Int64
    public let mimeType: String
    public let fileId: String?
    public let metadata: [String: FileFnJSONValue]?

    public init(
        policy: String,
        fileName: String,
        size: Int64,
        mimeType: String,
        fileId: String? = nil,
        metadata: [String: FileFnJSONValue]? = nil
    ) {
        self.policy = policy
        self.fileName = fileName
        self.size = size
        self.mimeType = mimeType
        self.fileId = fileId
        self.metadata = metadata
    }
}

public struct FileFnUploadSession: Decodable, Sendable, Equatable {
    public let uploadSessionId: String
    public let uploadSessionToken: String?
    public let uploadMode: FileFnUploadMode
    public let chunkSizeBytes: Int
    public let totalParts: Int
    public let expiresAt: String

    public init(
        uploadSessionId: String,
        uploadSessionToken: String? = nil,
        uploadMode: FileFnUploadMode,
        chunkSizeBytes: Int,
        totalParts: Int,
        expiresAt: String
    ) {
        self.uploadSessionId = uploadSessionId
        self.uploadSessionToken = uploadSessionToken
        self.uploadMode = uploadMode
        self.chunkSizeBytes = chunkSizeBytes
        self.totalParts = totalParts
        self.expiresAt = expiresAt
    }
}

public struct FileFnUploadStatus: Decodable, Sendable, Equatable {
    public let uploadSessionId: String
    public let status: String
    public let totalParts: Int
    public let recordedParts: [Int]
    public let uploadedParts: [Int]
    public let chunkSizeBytes: Int
    public let fileSize: Int64
    public let expiresAt: String

    public init(
        uploadSessionId: String,
        status: String,
        totalParts: Int,
        recordedParts: [Int],
        uploadedParts: [Int],
        chunkSizeBytes: Int,
        fileSize: Int64,
        expiresAt: String
    ) {
        self.uploadSessionId = uploadSessionId
        self.status = status
        self.totalParts = totalParts
        self.recordedParts = recordedParts
        self.uploadedParts = uploadedParts
        self.chunkSizeBytes = chunkSizeBytes
        self.fileSize = fileSize
        self.expiresAt = expiresAt
    }
}

public struct FileFnUploadPartSignature: Decodable, Sendable, Equatable {
    public let url: URL
    public let headers: [String: String]
    public let expiresAt: String

    public init(
        url: URL,
        headers: [String: String] = [:],
        expiresAt: String
    ) {
        self.url = url
        self.headers = headers
        self.expiresAt = expiresAt
    }

    public func resolved(against baseURL: URL, requestId: String?) throws -> FileFnUploadPartSignature {
        FileFnUploadPartSignature(
            url: try fileFnResolveURL(url, against: baseURL, requestId: requestId),
            headers: headers,
            expiresAt: expiresAt
        )
    }
}

public struct FileFnRecordedUploadPart: Decodable, Sendable, Equatable {
    public let recorded: Bool

    public init(recorded: Bool) {
        self.recorded = recorded
    }
}

public struct FileFnCompletedUpload: Decodable, Sendable, Equatable {
    public let fileId: String
    public let versionId: String

    public init(fileId: String, versionId: String) {
        self.fileId = fileId
        self.versionId = versionId
    }
}

public struct FileFnAbortedUpload: Decodable, Sendable, Equatable {
    public let aborted: Bool

    public init(aborted: Bool) {
        self.aborted = aborted
    }
}

public struct FileFnUploadedPart: Sendable, Equatable {
    public let etag: String
    public let size: Int
    public let recorded: Bool

    public init(etag: String, size: Int, recorded: Bool) {
        self.etag = etag
        self.size = size
        self.recorded = recorded
    }
}

public struct FileFnForegroundUploadRequest: Sendable {
    public let source: FileFnUploadSource
    public let policy: String
    public let fileName: String?
    public let mimeType: String?
    public let metadata: [String: FileFnJSONValue]?
    public let fileId: String?
    public let idempotencyKey: String?
    public let preprocessors: [any FileFnUploadPreprocessor]?

    public init(
        source: FileFnUploadSource,
        policy: String,
        fileName: String? = nil,
        mimeType: String? = nil,
        metadata: [String: FileFnJSONValue]? = nil,
        fileId: String? = nil,
        idempotencyKey: String? = nil,
        preprocessors: [any FileFnUploadPreprocessor]? = nil
    ) {
        self.source = source
        self.policy = policy
        self.fileName = fileName
        self.mimeType = mimeType
        self.metadata = metadata
        self.fileId = fileId
        self.idempotencyKey = idempotencyKey
        self.preprocessors = preprocessors
    }
}

public struct FileFnForegroundUploadProgress: Sendable, Equatable {
    public let bytesUploaded: Int64
    public let totalBytes: Int64
    public let partsCompleted: Int
    public let totalParts: Int

    public init(
        bytesUploaded: Int64,
        totalBytes: Int64,
        partsCompleted: Int,
        totalParts: Int
    ) {
        self.bytesUploaded = bytesUploaded
        self.totalBytes = totalBytes
        self.partsCompleted = partsCompleted
        self.totalParts = totalParts
    }
}

public enum FileFnForegroundUploadEventKind: String, Codable, Sendable, Equatable {
    case queued
    case sessionCreated
    case partProgress
    case partCompleted
    case completed
}

public struct FileFnForegroundUploadEvent: Sendable, Equatable {
    public let kind: FileFnForegroundUploadEventKind
    public let fileId: String
    public let uploadSessionId: String?
    public let uploadMode: FileFnUploadMode?
    public let partNumber: Int?
    public let progress: FileFnForegroundUploadProgress
    public let result: FileFnCompletedUpload?

    public init(
        kind: FileFnForegroundUploadEventKind,
        fileId: String,
        uploadSessionId: String? = nil,
        uploadMode: FileFnUploadMode? = nil,
        partNumber: Int? = nil,
        progress: FileFnForegroundUploadProgress,
        result: FileFnCompletedUpload? = nil
    ) {
        self.kind = kind
        self.fileId = fileId
        self.uploadSessionId = uploadSessionId
        self.uploadMode = uploadMode
        self.partNumber = partNumber
        self.progress = progress
        self.result = result
    }
}
