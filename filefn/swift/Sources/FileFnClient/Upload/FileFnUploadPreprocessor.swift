import Foundation

public struct FileFnPreparedUpload: Sendable {
    public let fileURL: URL
    public let fileName: String
    public let mimeType: String
    public let metadata: [String: FileFnJSONValue]?
    public let fileSize: Int64
    public let cleanupFileURL: URL?

    public init(
        fileURL: URL,
        fileName: String,
        mimeType: String,
        metadata: [String: FileFnJSONValue]? = nil,
        fileSize: Int64,
        cleanupFileURL: URL? = nil
    ) {
        self.fileURL = fileURL
        self.fileName = fileName
        self.mimeType = mimeType
        self.metadata = metadata
        self.fileSize = fileSize
        self.cleanupFileURL = cleanupFileURL
    }

    public func replacing(
        fileURL: URL? = nil,
        fileName: String? = nil,
        mimeType: String? = nil,
        metadata: [String: FileFnJSONValue]?? = nil,
        fileSize: Int64? = nil,
        cleanupFileURL: URL?? = nil
    ) -> FileFnPreparedUpload {
        FileFnPreparedUpload(
            fileURL: fileURL ?? self.fileURL,
            fileName: fileName ?? self.fileName,
            mimeType: mimeType ?? self.mimeType,
            metadata: metadata ?? self.metadata,
            fileSize: fileSize ?? self.fileSize,
            cleanupFileURL: cleanupFileURL ?? self.cleanupFileURL
        )
    }
}

public protocol FileFnUploadPreprocessor: Sendable {
    func prepare(_ upload: FileFnPreparedUpload) async throws -> FileFnPreparedUpload
}

struct FileFnPreparedUploadHandle: Sendable {
    let upload: FileFnPreparedUpload
    private let cleanupURLs: [URL]

    init(upload: FileFnPreparedUpload, cleanupURLs: [URL]) {
        self.upload = upload
        self.cleanupURLs = cleanupURLs
    }

    func cleanup() {
        for url in cleanupURLs {
            try? FileManager.default.removeItem(at: url)
        }
    }
}

enum FileFnUploadPreparation {
    static func prepare(
        request: FileFnForegroundUploadRequest,
        defaultPreprocessors: [any FileFnUploadPreprocessor]
    ) async throws -> FileFnPreparedUploadHandle {
        let materialized = try FileFnTemporaryFileMaterializer.materialize(
            source: request.source,
            preferredFileName: request.fileName
        )
        var cleanupURLs: [URL] = materialized.isTemporary ? [materialized.fileURL] : []
        var prepared = FileFnPreparedUpload(
            fileURL: materialized.fileURL,
            fileName: materialized.fileName,
            mimeType: fileFnInferMimeType(
                requestedMimeType: request.mimeType,
                fileName: materialized.fileName
            ),
            metadata: request.metadata,
            fileSize: materialized.fileSize,
            cleanupFileURL: materialized.isTemporary ? materialized.fileURL : nil
        )

        let preprocessors = request.preprocessors ?? defaultPreprocessors
        for preprocessor in preprocessors {
            let next = try await preprocessor.prepare(prepared)
            try validatePreparedUpload(next)
            if let cleanupFileURL = next.cleanupFileURL,
               !cleanupURLs.contains(cleanupFileURL)
            {
                cleanupURLs.append(cleanupFileURL)
            }
            prepared = next
        }

        return FileFnPreparedUploadHandle(upload: prepared, cleanupURLs: cleanupURLs)
    }

    private static func validatePreparedUpload(_ upload: FileFnPreparedUpload) throws {
        let values = try upload.fileURL.resourceValues(forKeys: [.isRegularFileKey, .fileSizeKey])
        guard values.isRegularFile == true else {
            throw FileFnClientError.fileAccess(reason: "Prepared upload source must be a regular file")
        }
        let actualFileSize = Int64(values.fileSize ?? 0)
        guard actualFileSize == upload.fileSize else {
            throw FileFnClientError.fileAccess(
                reason: "Prepared upload fileSize \(upload.fileSize) did not match actual file size \(actualFileSize)"
            )
        }
    }
}
