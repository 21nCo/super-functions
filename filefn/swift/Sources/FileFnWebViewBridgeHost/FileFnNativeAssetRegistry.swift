import Foundation
import UniformTypeIdentifiers

public struct FileFnNativeAssetDescriptor: Codable, Sendable, Equatable {
    public let assetHandle: String
    public let fileName: String
    public let mimeType: String
    public let size: Int64
    public let previewURL: URL

    public init(
        assetHandle: String,
        fileName: String,
        mimeType: String,
        size: Int64,
        previewURL: URL
    ) {
        self.assetHandle = assetHandle
        self.fileName = fileName
        self.mimeType = mimeType
        self.size = size
        self.previewURL = previewURL
    }
}

private struct FileFnNativeAssetRecord: Sendable {
    let descriptor: FileFnNativeAssetDescriptor
    let fileURL: URL
}

public actor FileFnNativeAssetRegistry {
    public let previewScheme: String

    private var records: [String: FileFnNativeAssetRecord] = [:]

    public init(previewScheme: String = "filefn-bridge") {
        self.previewScheme = previewScheme
    }

    public func register(
        fileURL: URL,
        fileName: String? = nil,
        mimeType: String? = nil,
        assetHandle: String? = nil
    ) throws -> FileFnNativeAssetDescriptor {
        let values: URLResourceValues
        do {
            values = try fileURL.resourceValues(forKeys: [.fileSizeKey, .nameKey, .isRegularFileKey])
        } catch {
            throw FileFnBridgeError(
                code: "NATIVE_ASSET_NOT_FOUND",
                message: "Native asset must resolve to a regular file",
                details: ["path": .string(fileURL.path)]
            )
        }
        guard values.isRegularFile == true else {
            throw FileFnBridgeError(
                code: "NATIVE_ASSET_NOT_FOUND",
                message: "Native asset must resolve to a regular file",
                details: ["path": .string(fileURL.path)]
            )
        }

        let handle = assetHandle ?? fileFnBridgeGenerateRandomIdentifier(prefix: "asset")
        guard fileFnBridgeIsValidPreviewScheme(previewScheme) else {
            throw FileFnBridgeError(
                code: "BRIDGE_INVALID_SOURCE",
                message: "Preview scheme must use a valid custom URL scheme",
                details: ["previewScheme": .string(previewScheme)]
            )
        }
        guard fileFnBridgeIsValidAssetHandle(handle) else {
            throw FileFnBridgeError(
                code: "BRIDGE_INVALID_SOURCE",
                message: "Asset handle must use URL-safe characters",
                details: ["assetHandle": .string(handle)]
            )
        }
        let resolvedFileName = fileName ?? values.name ?? fileURL.lastPathComponent
        let resolvedMimeType = mimeType ?? fileFnBridgeInferMimeType(fileName: resolvedFileName)
        let previewURL = try fileFnBridgePreviewURL(previewScheme: previewScheme, assetHandle: handle)
        let descriptor = FileFnNativeAssetDescriptor(
            assetHandle: handle,
            fileName: resolvedFileName,
            mimeType: resolvedMimeType,
            size: Int64(values.fileSize ?? 0),
            previewURL: previewURL
        )
        records[handle] = FileFnNativeAssetRecord(descriptor: descriptor, fileURL: fileURL)
        return descriptor
    }

    public func descriptor(for assetHandle: String) throws -> FileFnNativeAssetDescriptor {
        guard let record = records[assetHandle] else {
            throw FileFnBridgeError(
                code: "NATIVE_ASSET_NOT_FOUND",
                message: "Native asset handle was not registered",
                details: ["assetHandle": .string(assetHandle)]
            )
        }
        return record.descriptor
    }

    public func fileURL(for assetHandle: String) throws -> URL {
        guard let record = records[assetHandle] else {
            throw FileFnBridgeError(
                code: "NATIVE_ASSET_NOT_FOUND",
                message: "Native asset handle was not registered",
                details: ["assetHandle": .string(assetHandle)]
            )
        }
        return record.fileURL
    }

    func assetHandle(for previewURL: URL) -> String? {
        guard previewURL.scheme == previewScheme else {
            return nil
        }
        let components = previewURL.pathComponents.filter { $0 != "/" }
        if previewURL.host == "asset", let handle = components.first {
            return handle
        }
        return nil
    }
}

private func fileFnBridgeGenerateRandomIdentifier(prefix: String) -> String {
    let suffix = UUID().uuidString.replacingOccurrences(of: "-", with: "").lowercased()
    return "\(prefix)_\(suffix)"
}

private func fileFnBridgeInferMimeType(fileName: String) -> String {
    let fileExtension = URL(fileURLWithPath: fileName).pathExtension
    if !fileExtension.isEmpty,
       let type = UTType(filenameExtension: fileExtension),
       let mimeType = type.preferredMIMEType
    {
        return mimeType
    }

    return "application/octet-stream"
}

private func fileFnBridgePreviewURL(previewScheme: String, assetHandle: String) throws -> URL {
    var components = URLComponents()
    components.scheme = previewScheme
    components.host = "asset"
    components.percentEncodedPath = "/\(assetHandle)/preview"
    guard let url = components.url else {
        throw FileFnBridgeError(
            code: "BRIDGE_INVALID_SOURCE",
            message: "Unable to construct preview URL",
            details: [
                "previewScheme": .string(previewScheme),
                "assetHandle": .string(assetHandle),
            ]
        )
    }
    return url
}

private func fileFnBridgeIsValidPreviewScheme(_ previewScheme: String) -> Bool {
    guard let first = previewScheme.unicodeScalars.first,
          CharacterSet.letters.contains(first)
    else {
        return false
    }
    let allowed = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "+-."))
    return previewScheme.unicodeScalars.allSatisfy { allowed.contains($0) }
}

private func fileFnBridgeIsValidAssetHandle(_ assetHandle: String) -> Bool {
    guard !assetHandle.isEmpty else {
        return false
    }
    let allowed = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "-._~"))
    return assetHandle.unicodeScalars.allSatisfy { allowed.contains($0) }
}
