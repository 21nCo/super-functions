import FileFnClient
import Foundation
#if canImport(UniformTypeIdentifiers)
import UniformTypeIdentifiers
#endif

public enum FileFnFileImporterLoader {
    public static func load(url: URL) async throws -> FileFnImportedAsset {
        guard url.isFileURL else {
            throw FileFnClientError.fileAccess(reason: "Imported file must use a local file URL")
        }

        let didStartSecurityScope = url.startAccessingSecurityScopedResource()
        let normalizedURL = url.standardizedFileURL.resolvingSymlinksInPath()
        defer {
            if didStartSecurityScope {
                url.stopAccessingSecurityScopedResource()
            }
        }

        let values = try normalizedURL.resourceValues(forKeys: [.isRegularFileKey, .nameKey])
        guard values.isRegularFile == true else {
            throw FileFnClientError.fileAccess(reason: "Imported file URL must reference a readable regular file")
        }

        let fileName = values.name ?? normalizedURL.lastPathComponent
        let mimeType = fileFnImportedAssetMimeType(
            for: UTType(filenameExtension: normalizedURL.pathExtension),
            fileName: fileName
        )
        let localURL = try fileFnCopyImportedAsset(from: normalizedURL, fileName: fileName)
        return FileFnImportedAsset(fileURL: localURL, fileName: fileName, mimeType: mimeType)
    }
}
