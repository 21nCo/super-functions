@testable import FileFnClient
import Foundation
import Testing

private actor FileFnInMemorySecretStore: FileFnSecretStore {
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

    func storedUploadIDs() async -> [String] {
        Array(tokens.keys).sorted()
    }
}

private final class FileFnBlockingGate: @unchecked Sendable {
    private let lock = NSLock()
    private var blocked = true

    func isBlocked() -> Bool {
        lock.lock()
        defer { lock.unlock() }
        return blocked
    }

    func release() {
        lock.lock()
        blocked = false
        lock.unlock()
    }
}

struct FileFnBackgroundUploaderTests {
    @Test
    func enqueueRejectsNonDiskBackedSources() async throws {
        let host = "background-upload-enqueue-invalid.example.test"
        defer { FileFnMockURLProtocol.unregister(host: host) }

        let client = try makeFileFnTestClient(host: host) { request in
            Issue.record("Unexpected request \(request.httpMethod ?? "nil") \(request.url?.absoluteString ?? "nil")")
            return makeJSONResponse(
                request: request,
                status: 500,
                body: #"{"ok":false,"error":{"code":"TEST_UNEXPECTED","message":"Unexpected request"}}"#
            )
        }

        let rootDirectory = FileManager.default.temporaryDirectory.appendingPathComponent("filefn-bg-invalid-\(UUID().uuidString)")
        let uploader = FileFnBackgroundUploader(
            client: client,
            configuration: FileFnBackgroundUploadConfiguration(
                workingDirectory: rootDirectory,
                stateStore: FileFnFileSystemUploadStateStore(rootDirectory: rootDirectory),
                secretStore: FileFnInMemorySecretStore()
            )
        )

        await #expect(throws: FileFnClientError.fileAccess(reason: "Background uploads require a disk-backed file URL source")) {
            _ = try await uploader.enqueue(
                FileFnForegroundUploadRequest(
                    source: .data(Data("hello".utf8)),
                    policy: "text-upload"
                )
            )
        }
    }

    @Test
    func enqueueFailsWhenChunkPlanDoesNotMatchServerDeclaredTotalParts() async throws {
        let host = "background-upload-enqueue-chunk-mismatch.example.test"
        defer { FileFnMockURLProtocol.unregister(host: host) }

        let rootDirectory = FileManager.default.temporaryDirectory.appendingPathComponent("filefn-bg-chunk-mismatch-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: rootDirectory) }

        let stateStore = FileFnFileSystemUploadStateStore(rootDirectory: rootDirectory)
        let secretStore = FileFnInMemorySecretStore()
        let configuration = FileFnBackgroundUploadConfiguration(
            workingDirectory: rootDirectory,
            stateStore: stateStore,
            secretStore: secretStore
        )

        let sourceURL = rootDirectory.appendingPathComponent("mismatch.txt")
        try FileManager.default.createDirectory(at: rootDirectory, withIntermediateDirectories: true)
        try Data("hello-world".utf8).write(to: sourceURL)

        final class AbortRecorder: @unchecked Sendable {
            private let lock = NSLock()
            private(set) var abortedUploadSessionIDs: [String] = []
            private(set) var abortTokens: [String?] = []

            func recordAbort(uploadSessionId: String, token: String?) {
                lock.lock()
                abortedUploadSessionIDs.append(uploadSessionId)
                abortTokens.append(token)
                lock.unlock()
            }
        }
        let abortRecorder = AbortRecorder()

        let client = try makeFileFnTestClient(host: host) { request in
            switch (request.httpMethod, request.url?.path) {
            case ("POST", "/filefn/upload/init"):
                return makeJSONResponse(
                    request: request,
                    status: 200,
                    body: """
                    {
                      "ok": true,
                      "data": {
                        "uploadSessionId": "upl_chunk_mismatch_001",
                        "uploadSessionToken": "upls_chunk_mismatch_001",
                        "uploadMode": "proxy",
                        "chunkSizeBytes": 4,
                        "totalParts": 2,
                        "expiresAt": "2026-03-29T12:00:00Z"
                      }
                    }
                    """
                )
            case ("POST", "/filefn/upload/upl_chunk_mismatch_001/abort"):
                abortRecorder.recordAbort(
                    uploadSessionId: "upl_chunk_mismatch_001",
                    token: request.value(forHTTPHeaderField: "x-upload-session-token")
                )
                return makeJSONResponse(
                    request: request,
                    status: 200,
                    body: #"{"ok":true,"data":{"aborted":true}}"#
                )
            default:
                Issue.record("Unexpected request \(request.httpMethod ?? "nil") \(request.url?.absoluteString ?? "nil")")
                return makeJSONResponse(
                    request: request,
                    status: 500,
                    body: #"{"ok":false,"error":{"code":"TEST_UNEXPECTED","message":"Unexpected request"}}"#
                )
            }
        }

        let uploader = FileFnBackgroundUploader(client: client, configuration: configuration)

        do {
            _ = try await uploader.enqueue(
                FileFnForegroundUploadRequest(
                    source: .fileURL(sourceURL),
                    policy: "text-upload"
                )
            )
            Issue.record("Expected enqueue to fail when the chunk plan does not match totalParts")
        } catch {
            #expect(
                error as? FileFnClientError ==
                .invalidResponse(
                    reason: "Chunk plan did not match server-declared totalParts",
                    requestId: nil
                )
            )
        }

        #expect(try await stateStore.loadSnapshots() == [])
        #expect(await secretStore.storedUploadIDs() == [])
        #expect(abortRecorder.abortedUploadSessionIDs == ["upl_chunk_mismatch_001"])
        #expect(abortRecorder.abortTokens == ["upls_chunk_mismatch_001"])

        let uploadsDirectory = rootDirectory.appendingPathComponent("uploads", isDirectory: true)
        if FileManager.default.fileExists(atPath: uploadsDirectory.path) {
            let uploadEntries = try FileManager.default.contentsOfDirectory(
                at: uploadsDirectory,
                includingPropertiesForKeys: nil
            )
            #expect(uploadEntries == [])
        }
    }

    @Test
    func recoverReconcilesRecordedPartsAndCleansUpOnCompletion() async throws {
        let host = "background-upload-recover.example.test"
        defer { FileFnMockURLProtocol.unregister(host: host) }

        let rootDirectory = FileManager.default.temporaryDirectory.appendingPathComponent("filefn-bg-recover-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: rootDirectory) }

        let stateStore = FileFnFileSystemUploadStateStore(rootDirectory: rootDirectory)
        let secretStore = FileFnInMemorySecretStore()
        let configuration = FileFnBackgroundUploadConfiguration(
            workingDirectory: rootDirectory,
            stateStore: stateStore,
            secretStore: secretStore
        )

        let uploadID = "bg_001"
        let uploadDirectory = rootDirectory.appendingPathComponent("uploads", isDirectory: true).appendingPathComponent(uploadID, isDirectory: true)
        let chunksDirectory = uploadDirectory.appendingPathComponent("chunks", isDirectory: true)
        try FileManager.default.createDirectory(at: chunksDirectory, withIntermediateDirectories: true)
        try Data("part-two".utf8).write(to: chunksDirectory.appendingPathComponent("part-2.bin"))
        try Data("part-three".utf8).write(to: chunksDirectory.appendingPathComponent("part-3.bin"))

        let snapshot = FileFnBackgroundUploadSnapshot(
            uploadID: uploadID,
            fileId: "file_bg_001",
            idempotencyKey: "idem_bg_001",
            policy: "text-upload",
            fileName: "hello.txt",
            mimeType: "text/plain",
            uploadSessionId: "upl_bg_001",
            totalParts: 3,
            chunkSizeBytes: 8,
            fileSize: 24,
            completedParts: [1],
            chunkFileNames: [2: "part-2.bin", 3: "part-3.bin"],
            requiresUploadSessionToken: true,
            status: .running,
            createdAt: "2026-03-29T11:00:00Z",
            updatedAt: "2026-03-29T11:00:00Z"
        )
        try await stateStore.saveSnapshot(snapshot)
        try await secretStore.storeUploadSessionToken("upls_bg_001", uploadID: uploadID)

        final class RecoveryRecorder: @unchecked Sendable {
            var resumedParts: [Int] = []
        }
        let recorder = RecoveryRecorder()

        let client = try makeFileFnTestClient(host: host) { request in
            switch (request.httpMethod, request.url?.path) {
            case ("GET", "/filefn/upload/upl_bg_001/status"):
                #expect(request.value(forHTTPHeaderField: "x-upload-session-token") == "upls_bg_001")
                return makeJSONResponse(
                    request: request,
                    status: 200,
                    body: """
                    {
                      "ok": true,
                      "data": {
                        "uploadSessionId": "upl_bg_001",
                        "status": "in_progress",
                        "totalParts": 3,
                        "recordedParts": [1],
                        "uploadedParts": [1],
                        "chunkSizeBytes": 8,
                        "fileSize": 24,
                        "expiresAt": "2026-03-29T12:00:00Z"
                      }
                    }
                    """
                )
            case ("POST", "/filefn/upload/upl_bg_001/parts/2/sign"),
                 ("POST", "/filefn/upload/upl_bg_001/parts/3/sign"):
                let partNumber = request.url?.path.contains("/parts/2/") == true ? 2 : 3
                #expect(request.value(forHTTPHeaderField: "x-upload-session-token") == "upls_bg_001")
                return makeJSONResponse(
                    request: request,
                    status: 200,
                    body: """
                    {
                      "ok": true,
                      "data": {
                        "url": "/upload/upl_bg_001/parts/\(partNumber)",
                        "headers": {
                          "content-type": "application/octet-stream"
                        },
                        "expiresAt": "2026-03-29T12:00:00Z"
                      }
                    }
                    """
                )
            case ("PUT", "/filefn/upload/upl_bg_001/parts/2"),
                 ("PUT", "/filefn/upload/upl_bg_001/parts/3"):
                let partNumber = request.url?.path.contains("/parts/2") == true ? 2 : 3
                recorder.resumedParts.append(partNumber)
                #expect(request.value(forHTTPHeaderField: "x-upload-session-token") == "upls_bg_001")
                return makeJSONResponse(
                    request: request,
                    status: 200,
                    body: """
                    {
                      "ok": true,
                      "data": {
                        "etag": "proxy-\(partNumber)",
                        "size": 8,
                        "recorded": true
                      }
                    }
                    """
                )
            case ("POST", "/filefn/upload/upl_bg_001/complete"):
                #expect(request.value(forHTTPHeaderField: "x-upload-session-token") == "upls_bg_001")
                return makeJSONResponse(
                    request: request,
                    status: 200,
                    body: """
                    {
                      "ok": true,
                      "data": {
                        "fileId": "file_bg_001",
                        "versionId": "ver_bg_001"
                      }
                    }
                    """
                )
            default:
                Issue.record("Unexpected request \(request.httpMethod ?? "nil") \(request.url?.absoluteString ?? "nil")")
                return makeJSONResponse(
                    request: request,
                    status: 500,
                    body: #"{"ok":false,"error":{"code":"TEST_UNEXPECTED","message":"Unexpected request"}}"#
                )
            }
        }

        let uploader = FileFnBackgroundUploader(client: client, configuration: configuration)
        let recovered = try await uploader.recover()
        #expect(recovered == [snapshot])

        let result = try await uploader.waitForCompletion(uploadID: uploadID)
        #expect(result == FileFnCompletedUpload(fileId: "file_bg_001", versionId: "ver_bg_001"))
        #expect(recorder.resumedParts.sorted() == [2, 3])
        #expect(try await stateStore.loadSnapshot(uploadID: uploadID) == nil)
        #expect(try await secretStore.loadUploadSessionToken(uploadID: uploadID) == nil)
        #expect(FileManager.default.fileExists(atPath: uploadDirectory.path) == false)
    }

    @Test
    func recoverFailsWhenChunkIsMissingAndMarksSnapshotFailed() async throws {
        let host = "background-upload-missing-chunk.example.test"
        defer { FileFnMockURLProtocol.unregister(host: host) }

        let rootDirectory = FileManager.default.temporaryDirectory.appendingPathComponent("filefn-bg-missing-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: rootDirectory) }

        let stateStore = FileFnFileSystemUploadStateStore(rootDirectory: rootDirectory)
        let secretStore = FileFnInMemorySecretStore()
        let configuration = FileFnBackgroundUploadConfiguration(
            workingDirectory: rootDirectory,
            stateStore: stateStore,
            secretStore: secretStore
        )

        let uploadID = "bg_001"
        let chunksDirectory = rootDirectory
            .appendingPathComponent("uploads", isDirectory: true)
            .appendingPathComponent(uploadID, isDirectory: true)
            .appendingPathComponent("chunks", isDirectory: true)
        try FileManager.default.createDirectory(at: chunksDirectory, withIntermediateDirectories: true)

        let snapshot = FileFnBackgroundUploadSnapshot(
            uploadID: uploadID,
            fileId: "file_bg_001",
            idempotencyKey: "idem_bg_001",
            policy: "text-upload",
            fileName: "hello.txt",
            mimeType: "text/plain",
            uploadSessionId: "upl_bg_001",
            totalParts: 3,
            chunkSizeBytes: 8,
            fileSize: 24,
            completedParts: [1],
            chunkFileNames: [2: "part-2.bin", 3: "part-3.bin"],
            requiresUploadSessionToken: true,
            status: .running,
            createdAt: "2026-03-29T11:00:00Z",
            updatedAt: "2026-03-29T11:00:00Z"
        )
        try await stateStore.saveSnapshot(snapshot)
        try await secretStore.storeUploadSessionToken("upls_bg_001", uploadID: uploadID)

        let client = try makeFileFnTestClient(host: host) { request in
            Issue.record("Unexpected network request during missing chunk test: \(request.httpMethod ?? "nil") \(request.url?.absoluteString ?? "nil")")
            return makeJSONResponse(
                request: request,
                status: 500,
                body: #"{"ok":false,"error":{"code":"TEST_UNEXPECTED","message":"Unexpected request"}}"#
            )
        }

        let uploader = FileFnBackgroundUploader(client: client, configuration: configuration)
        await #expect(throws: FileFnClientError.backgroundStateCorrupt(uploadID: uploadID, reason: "missing chunk file for part 2")) {
            _ = try await uploader.recover()
        }

        let failed = try await stateStore.loadSnapshot(uploadID: uploadID)
        #expect(failed?.status == .failed)
        #expect(failed?.lastError == "missing chunk file for part 2")
    }

    @Test
    func cancelRemovesSnapshotTokenAndChunks() async throws {
        let host = "background-upload-cancel.example.test"
        defer { FileFnMockURLProtocol.unregister(host: host) }

        let rootDirectory = FileManager.default.temporaryDirectory.appendingPathComponent("filefn-bg-cancel-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: rootDirectory) }

        let stateStore = FileFnFileSystemUploadStateStore(rootDirectory: rootDirectory)
        let secretStore = FileFnInMemorySecretStore()
        let configuration = FileFnBackgroundUploadConfiguration(
            workingDirectory: rootDirectory,
            stateStore: stateStore,
            secretStore: secretStore
        )

        let sourceURL = rootDirectory.appendingPathComponent("cancel.txt")
        try FileManager.default.createDirectory(at: rootDirectory, withIntermediateDirectories: true)
        try Data("hello-world".utf8).write(to: sourceURL)

        let gate = FileFnBlockingGate()

        let client = try makeFileFnTestClient(host: host) { request in
            switch (request.httpMethod, request.url?.path) {
            case ("POST", "/filefn/upload/init"):
                return makeJSONResponse(
                    request: request,
                    status: 200,
                    body: """
                    {
                      "ok": true,
                      "data": {
                        "uploadSessionId": "upl_cancel_001",
                        "uploadSessionToken": "upls_cancel_001",
                        "uploadMode": "proxy",
                        "chunkSizeBytes": 4,
                        "totalParts": 3,
                        "expiresAt": "2026-03-29T12:00:00Z"
                      }
                    }
                    """
                )
            case ("POST", "/filefn/upload/upl_cancel_001/parts/1/sign"):
                return makeJSONResponse(
                    request: request,
                    status: 200,
                    body: """
                    {
                      "ok": true,
                      "data": {
                        "url": "/upload/upl_cancel_001/parts/1",
                        "headers": {
                          "content-type": "application/octet-stream"
                        },
                        "expiresAt": "2026-03-29T12:00:00Z"
                      }
                    }
                    """
                )
            case ("PUT", "/filefn/upload/upl_cancel_001/parts/1"):
                while gate.isBlocked() {
                    Thread.sleep(forTimeInterval: 0.02)
                }
                return makeJSONResponse(
                    request: request,
                    status: 200,
                    body: """
                    {
                      "ok": true,
                      "data": {
                        "etag": "proxy-1",
                        "size": 4,
                        "recorded": true
                      }
                    }
                    """
                )
            case ("POST", "/filefn/upload/upl_cancel_001/abort"):
                return makeJSONResponse(
                    request: request,
                    status: 200,
                    body: #"{"ok":true,"data":{"aborted":true}}"#
                )
            default:
                return makeJSONResponse(
                    request: request,
                    status: 500,
                    body: #"{"ok":false,"error":{"code":"TEST_UNEXPECTED","message":"Unexpected request"}}"#
                )
            }
        }

        let uploader = FileFnBackgroundUploader(client: client, configuration: configuration)
        let snapshot = try await uploader.enqueue(
            FileFnForegroundUploadRequest(
                source: .fileURL(sourceURL),
                policy: "text-upload"
            )
        )
        try await Task.sleep(nanoseconds: 50_000_000)
        try await uploader.cancel(uploadID: snapshot.uploadID)
        gate.release()

        #expect(try await stateStore.loadSnapshot(uploadID: snapshot.uploadID) == nil)
        #expect(try await secretStore.loadUploadSessionToken(uploadID: snapshot.uploadID) == nil)
        let uploadDirectory = rootDirectory.appendingPathComponent("uploads", isDirectory: true).appendingPathComponent(snapshot.uploadID, isDirectory: true)
        #expect(FileManager.default.fileExists(atPath: uploadDirectory.path) == false)
    }
}
