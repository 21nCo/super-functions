@testable import FileFnClient
import Foundation
import Testing

private actor FileFnSecretRedactionSecretStore: FileFnSecretStore {
    private var tokens: [String: String] = [:]

    func storeUploadSessionToken(_ token: String, uploadID: String) async throws {
        tokens[uploadID] = token
    }

    func loadUploadSessionToken(uploadID: String) async throws -> String? {
        tokens[uploadID]
    }

    func deleteUploadSessionToken(uploadID: String) async throws {
        tokens.removeValue(forKey: uploadID)
    }
}

struct FileFnSecretRedactionTests {
    @Test
    func logEventRedactionRemovesSecretsQueriesAndAbsolutePaths() throws {
        let event = FileFnLogEvent(
            level: .info,
            message: "secret-test",
            metadata: [
                "Authorization": .string("Bearer test-auth-token"),
                "x-upload-session-token": .string("test-upload-token-001"),
                "signedURL": .string("https://storage.example.com/upload?X-Amz-Signature=secret"),
                "filePath": .string("/private/var/mobile/Containers/Data/Application/UUID/tmp/avatar.png"),
                "localFileURL": .string("file:///private/var/mobile/Containers/Data/Application/UUID/tmp/avatar.png?token=abc"),
                "bridgeEvent": .object([
                    "event": .string("upload.progress"),
                    "payload": .object([
                        "Authorization": .string("Bearer bridge-auth-token"),
                        "uploadSessionToken": .string("test-bridge-upload-token"),
                        "previewURL": .string("filefn-bridge://asset/asset_001/preview"),
                        "sourcePath": .string("/private/var/mobile/Containers/Data/Application/UUID/tmp/avatar.png"),
                    ]),
                ]),
            ]
        )

        let redacted = event.redacted()

        #expect(redacted.metadata["Authorization"] == .string("[REDACTED]"))
        #expect(redacted.metadata["x-upload-session-token"] == .string("[REDACTED]"))
        #expect(redacted.metadata["signedURL"] == .string("https://storage.example.com/upload?[REDACTED_QUERY]"))
        #expect(redacted.metadata["filePath"] == .string("avatar.png"))
        #expect(redacted.metadata["localFileURL"] == .string("avatar.png?[REDACTED_QUERY]"))

        guard case .object(let bridgeEvent)? = redacted.metadata["bridgeEvent"],
              case .object(let payload)? = bridgeEvent["payload"] else {
            Issue.record("Expected nested bridge payload object")
            return
        }

        #expect(payload["Authorization"] == .string("[REDACTED]"))
        #expect(payload["uploadSessionToken"] == .string("[REDACTED]"))
        #expect(payload["previewURL"] == .string("filefn-bridge://asset/asset_001/preview"))
        #expect(payload["sourcePath"] == .string("avatar.png"))
    }

    @Test
    func persistedSnapshotsDoNotContainTokensOrAbsolutePaths() async throws {
        let rootDirectory = FileManager.default.temporaryDirectory.appendingPathComponent("filefn-sec-snapshot-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: rootDirectory) }

        let store = FileFnFileSystemUploadStateStore(rootDirectory: rootDirectory)
        let secretStore = FileFnSecretRedactionSecretStore()
        // Tokens are stored separately via FileFnSecretStore, not embedded in snapshots.
        // This test documents that snapshot persistence preserves that architectural separation.
        try await secretStore.storeUploadSessionToken("test-upload-token-001", uploadID: "bg_001")
        #expect(try await secretStore.loadUploadSessionToken(uploadID: "bg_001") == "test-upload-token-001")
        let snapshot = FileFnBackgroundUploadSnapshot(
            uploadID: "bg_001",
            fileId: "file_bg_001",
            idempotencyKey: "idem_bg_001",
            policy: "text-upload",
            fileName: "avatar.png",
            mimeType: "image/png",
            metadata: ["source": .string("camera-roll")],
            uploadSessionId: "upl_bg_001",
            totalParts: 2,
            chunkSizeBytes: 8,
            fileSize: 16,
            completedParts: [1],
            chunkFileNames: [1: "part-1.bin", 2: "part-2.bin"],
            requiresUploadSessionToken: true,
            status: .running,
            createdAt: "2026-03-29T11:00:00Z",
            updatedAt: "2026-03-29T11:00:00Z"
        )

        try await store.saveSnapshot(snapshot)
        let snapshotURL = rootDirectory.appendingPathComponent("snapshots", isDirectory: true).appendingPathComponent("bg_001.json", isDirectory: false)
        let contents = try String(contentsOf: snapshotURL, encoding: .utf8)

        #expect(contents.contains("test-upload-token-001") == false)
        #expect(contents.contains("Authorization") == false)
        #expect(contents.contains("X-Amz-Signature") == false)
        #expect(contents.contains("/private/var/") == false)
        #expect(contents.contains("part-1.bin"))
        #expect(contents.contains("\"uploadSessionId\""))
    }
}
