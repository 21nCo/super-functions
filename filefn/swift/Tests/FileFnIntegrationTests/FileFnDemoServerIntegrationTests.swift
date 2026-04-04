@testable import FileFnClient
import Foundation
import Testing

struct FileFnDemoServerIntegrationTests {
    @Test(.enabled(if: fileFnIntegrationTestsEnabled(), "Set FILEFN_BASE_URL to run live FileFn integration tests."))
    func demoServerPoliciesAreMounted() async throws {
        let client = try makeIntegrationClient()
        let policies = try await client.listPolicies()

        #expect(policies.contains(where: { $0.name == "public-image" }))
    }

    @Test(.enabled(if: fileFnIntegrationTestsEnabled(), "Set FILEFN_BASE_URL to run live FileFn integration tests."))
    func foregroundUploadRoundTripsAgainstDemoServer() async throws {
        let client = try makeIntegrationClient()
        let sourceURL = try fileFnWriteIntegrationPNG()
        defer { try? FileManager.default.removeItem(at: sourceURL.deletingLastPathComponent()) }

        let fileId = "file_demo_\(UUID().uuidString.replacingOccurrences(of: "-", with: "").lowercased())"
        let uploader = FileFnForegroundUploader(client: client)
        let task = uploader.upload(
            FileFnForegroundUploadRequest(
                source: .fileURL(sourceURL),
                policy: "public-image",
                fileName: "tiny.png",
                mimeType: "image/png",
                metadata: ["source": .string("swift-integration")],
                fileId: fileId,
                idempotencyKey: "idem_\(UUID().uuidString.replacingOccurrences(of: "-", with: "").lowercased())"
            )
        )

        let result = try await task.value()
        #expect(result.fileId == fileId)

        let file = try await client.getFile(fileId: result.fileId)
        #expect(file.fileId == result.fileId)
        #expect(file.currentVersionId == result.versionId)
        #expect(file.name == "tiny.png")
        #expect(file.mimeType == "image/png")

        let files = try await client.listFiles(limit: 100)
        #expect(files.files.contains(where: { $0.fileId == result.fileId }))

        let download = try await client.downloadURL(fileId: result.fileId)
        let expectedHost = try integrationBaseURL().host
        #expect(download.url.scheme == "http" || download.url.scheme == "https")
        #expect(download.url.host == expectedHost)

        let versions = try await client.listVersions(fileId: result.fileId)
        #expect(versions.contains(where: { $0.versionId == result.versionId }))

        try await client.deleteFile(fileId: result.fileId)
    }
}

private func makeIntegrationClient() throws -> FileFnClient {
    try FileFnClient(
        configuration: FileFnClientConfiguration(
            baseURL: try integrationBaseURL()
        )
    )
}

private func integrationBaseURL() throws -> URL {
    guard let rawValue = ProcessInfo.processInfo.environment["FILEFN_BASE_URL"],
          let url = fileFnValidatedIntegrationBaseURL(rawValue) else {
        throw FileFnClientError.configurationInvalid(
            field: "FILEFN_BASE_URL",
            message: "FILEFN_BASE_URL must be an absolute URL"
        )
    }

    return url
}

private func fileFnIntegrationTestsEnabled() -> Bool {
    guard let rawValue = ProcessInfo.processInfo.environment["FILEFN_BASE_URL"] else {
        return false
    }

    return fileFnValidatedIntegrationBaseURL(rawValue) != nil
}

private func fileFnValidatedIntegrationBaseURL(_ rawValue: String) -> URL? {
    let trimmedValue = rawValue.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmedValue.isEmpty,
          let url = URL(string: trimmedValue),
          url.scheme != nil,
          url.host != nil else {
        return nil
    }
    return url
}

private func fileFnWriteIntegrationPNG() throws -> URL {
    let directory = FileManager.default.temporaryDirectory
        .appendingPathComponent("filefn-integration-\(UUID().uuidString)", isDirectory: true)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)

    let pngData = Data(base64Encoded: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a4p0AAAAASUVORK5CYII=")!
    let fileURL = directory.appendingPathComponent("tiny.png", isDirectory: false)
    try pngData.write(to: fileURL, options: .atomic)
    return fileURL
}
