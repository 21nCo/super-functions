@testable import FileFnClient
@testable import FileFnSwiftUI
@testable import FileFnWebViewBridgeHost
import Foundation
import Testing

struct FileFnAssetLoaderTests {
    @Test
    func importedAssetsFeedDirectUploadsAndNativeAssetRegistration() async throws {
        let asset = try FileFnPhotosPickerLoader.loadImportedData(
            Data("picker-image".utf8),
            fileName: "avatar.heic",
            mimeType: "image/heic"
        )

        #expect(asset.fileName == "avatar.heic")
        #expect(asset.mimeType == "image/heic")
        #expect(FileManager.default.fileExists(atPath: asset.fileURL.path))

        let request = asset.makeUploadRequest(policy: "public-image")
        #expect(request.source == .fileURL(asset.fileURL))
        #expect(request.fileName == "avatar.heic")
        #expect(request.mimeType == "image/heic")

        let registry = FileFnNativeAssetRegistry()
        let descriptor = try await registry.register(
            fileURL: asset.fileURL,
            fileName: asset.fileName,
            mimeType: asset.mimeType,
            assetHandle: "asset_001"
        )
        #expect(descriptor.assetHandle == "asset_001")
        #expect(descriptor.previewURL.absoluteString == "filefn-bridge://asset/asset_001/preview")
    }

    @Test
    func photosPickerLoaderThrowsWhenImportDataIsUnavailable() throws {
        do {
            _ = try FileFnPhotosPickerLoader.loadImportedData(
                nil,
                fileName: "avatar.heic",
                mimeType: "image/heic"
            )
            Issue.record("Expected import failure")
        } catch let error as FileFnClientError {
            switch error {
            case .fileAccess(let reason):
                #expect(reason.contains("import"))
            default:
                Issue.record("Unexpected error \(error)")
            }
        }
    }

    @Test
    func fileImporterCopiesReadableFilesAndUnreadableRegistrationFails() async throws {
        let rootDirectory = FileManager.default.temporaryDirectory.appendingPathComponent("filefn-swiftui-import-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: rootDirectory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: rootDirectory) }

        let originalURL = rootDirectory.appendingPathComponent("notes.txt")
        try Data("hello-import".utf8).write(to: originalURL)

        let imported = try await FileFnFileImporterLoader.load(url: originalURL)
        #expect(imported.fileName == "notes.txt")
        #expect(imported.fileURL != originalURL)
        #expect(FileManager.default.fileExists(atPath: imported.fileURL.path))

        let registry = FileFnNativeAssetRegistry()
        let missingURL = rootDirectory.appendingPathComponent("missing.txt")
        do {
            _ = try await registry.register(fileURL: missingURL)
            Issue.record("Expected native asset registration to fail")
        } catch let error as FileFnBridgeError {
            #expect(error.code == "NATIVE_ASSET_NOT_FOUND")
            #expect(error.message == "Native asset must resolve to a regular file")
        }
    }
}
