import FileFnClient
import Foundation
#if canImport(PhotosUI)
import PhotosUI
#endif
#if canImport(SwiftUI)
import SwiftUI
#endif
#if canImport(UniformTypeIdentifiers)
import UniformTypeIdentifiers
#endif

public struct FileFnImportedAsset: Sendable, Equatable {
    public let fileURL: URL
    public let fileName: String
    public let mimeType: String

    public init(fileURL: URL, fileName: String, mimeType: String) {
        self.fileURL = fileURL
        self.fileName = fileName
        self.mimeType = mimeType
    }

    public func makeUploadRequest(
        policy: String,
        metadata: [String: FileFnJSONValue]? = nil,
        fileId: String? = nil,
        idempotencyKey: String? = nil,
        preprocessors: [any FileFnUploadPreprocessor]? = nil
    ) -> FileFnForegroundUploadRequest {
        FileFnForegroundUploadRequest(
            source: .fileURL(fileURL),
            policy: policy,
            fileName: fileName,
            mimeType: mimeType,
            metadata: metadata,
            fileId: fileId,
            idempotencyKey: idempotencyKey,
            preprocessors: preprocessors
        )
    }
}

public enum FileFnPhotosPickerLoader {
    #if canImport(PhotosUI)
    public static func load(item: PhotosPickerItem) async throws -> FileFnImportedAsset {
        let payload = try await item.loadTransferable(type: Data.self)
        let contentType = item.supportedContentTypes.first
        let fileName = fileFnImportedAssetDefaultName(base: "photo", contentType: contentType)
        return try loadImportedData(
            payload,
            fileName: fileName,
            mimeType: fileFnImportedAssetMimeType(for: contentType, fileName: fileName)
        )
    }
    #endif

    static func loadImportedData(
        _ data: Data?,
        fileName: String,
        mimeType: String
    ) throws -> FileFnImportedAsset {
        guard let data else {
            throw FileFnClientError.fileAccess(reason: "Unable to import asset from PhotosPicker item")
        }
        let fileURL = try fileFnWriteImportedAsset(data: data, fileName: fileName)
        return FileFnImportedAsset(fileURL: fileURL, fileName: fileName, mimeType: mimeType)
    }
}

func fileFnWriteImportedAsset(data: Data, fileName: String) throws -> URL {
    let destinationURL = try fileFnImportedAssetDestinationURL(fileName: fileName)
    do {
        try data.write(to: destinationURL, options: .atomic)
        return destinationURL
    } catch {
        throw FileFnClientError.fileAccess(reason: "Unable to import asset into a local file: \(error.localizedDescription)")
    }
}

func fileFnCopyImportedAsset(from sourceURL: URL, fileName: String) throws -> URL {
    let destinationURL = try fileFnImportedAssetDestinationURL(fileName: fileName)
    do {
        if FileManager.default.fileExists(atPath: destinationURL.path) {
            try FileManager.default.removeItem(at: destinationURL)
        }
        try FileManager.default.copyItem(at: sourceURL, to: destinationURL)
        return destinationURL
    } catch {
        throw FileFnClientError.fileAccess(reason: "Unable to import asset into a local file: \(error.localizedDescription)")
    }
}

private func fileFnImportedAssetDestinationURL(fileName: String) throws -> URL {
    let sanitizedFileName = fileName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        ? "imported"
        : fileName
    let baseURL = FileManager.default.temporaryDirectory
        .appendingPathComponent(fileFnImportedAssetIdentifier(), isDirectory: true)
    try FileManager.default.createDirectory(at: baseURL, withIntermediateDirectories: true)
    return baseURL.appendingPathComponent(sanitizedFileName, isDirectory: false)
}

func fileFnImportedAssetIdentifier() -> String {
    UUID().uuidString.replacingOccurrences(of: "-", with: "").lowercased()
}

func fileFnImportedAssetDefaultName(base: String, contentType: UTType?) -> String {
    guard let contentType else {
        return base
    }
    let preferredExtension = contentType.preferredFilenameExtension ?? ""
    return preferredExtension.isEmpty ? base : "\(base).\(preferredExtension)"
}

func fileFnImportedAssetMimeType(for contentType: UTType?, fileName: String) -> String {
    if let mimeType = contentType?.preferredMIMEType {
        return mimeType
    }

    let fileExtension = URL(fileURLWithPath: fileName).pathExtension
    if !fileExtension.isEmpty,
       let resolvedType = UTType(filenameExtension: fileExtension),
       let mimeType = resolvedType.preferredMIMEType
    {
        return mimeType
    }

    return "application/octet-stream"
}
