@testable import FileFnClient
import Foundation
import Testing

struct FileFnHEICPreprocessorTests {
    @Test
    func foregroundUploadUsesHEICPreprocessorBeforeSessionCreation() async throws {
        let host = "heic-foreground.example.test"
        defer { FileFnMockURLProtocol.unregister(host: host) }

        let rootDirectory = FileManager.default.temporaryDirectory.appendingPathComponent("filefn-heic-fg-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: rootDirectory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: rootDirectory) }

        let sourceURL = rootDirectory.appendingPathComponent("photo.HEIC")
        try Data("heic-bytes".utf8).write(to: sourceURL)
        let converted = Data("jpeg-bytes".utf8)

        let client = try makeFileFnTestClient(host: host) { request in
            switch (request.httpMethod, request.url?.path) {
            case ("POST", "/filefn/upload/init"):
                let body = try fileFnHEICRequestBody(request)
                let metadata = try #require(body["metadata"] as? [String: Any])
                #expect(body["fileName"] as? String == "photo.jpg")
                #expect(body["mimeType"] as? String == "image/jpeg")
                #expect(metadata["album"] as? String == "camera-roll")
                #expect(metadata["originalMimeType"] as? String == "image/heic")
                return makeJSONResponse(
                    request: request,
                    status: 200,
                    body: """
                    {
                      "ok": true,
                      "data": {
                        "uploadSessionId": "upl_heic_001",
                        "uploadSessionToken": "upls_heic_001",
                        "uploadMode": "proxy",
                        "chunkSizeBytes": 32,
                        "totalParts": 1,
                        "expiresAt": "2026-03-29T12:00:00Z"
                      }
                    }
                    """
                )
            case ("POST", "/filefn/upload/upl_heic_001/parts/1/sign"):
                return makeJSONResponse(
                    request: request,
                    status: 200,
                    body: """
                    {
                      "ok": true,
                      "data": {
                        "url": "/upload/upl_heic_001/parts/1",
                        "headers": {
                          "content-type": "application/octet-stream"
                        },
                        "expiresAt": "2026-03-29T12:00:00Z"
                      }
                    }
                    """
                )
            case ("PUT", "/filefn/upload/upl_heic_001/parts/1"):
                let body = try fileFnHEICRequestBodyData(request)
                #expect(body == converted)
                return makeJSONResponse(
                    request: request,
                    status: 200,
                    body: """
                    {
                      "ok": true,
                      "data": {
                        "etag": "etag_heic_001",
                        "size": \(converted.count),
                        "recorded": true
                      }
                    }
                    """
                )
            case ("POST", "/filefn/upload/upl_heic_001/complete"):
                return makeJSONResponse(
                    request: request,
                    status: 200,
                    body: """
                    {
                      "ok": true,
                      "data": {
                        "fileId": "file_heic_001",
                        "versionId": "ver_heic_001"
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

        let uploader = FileFnForegroundUploader(
            client: client,
            preprocessors: [
                FileFnHEICPreprocessor { inputURL, outputURL, _ in
                    #expect(inputURL.lastPathComponent == "photo.HEIC")
                    try converted.write(to: outputURL, options: .atomic)
                },
            ]
        )

        let uploadTask = uploader.upload(
            FileFnForegroundUploadRequest(
                source: .fileURL(sourceURL),
                policy: "public-image",
                mimeType: "image/heic",
                metadata: ["album": .string("camera-roll")]
            )
        )

        let result = try await uploadTask.value()
        #expect(result == FileFnCompletedUpload(fileId: "file_heic_001", versionId: "ver_heic_001"))
    }

    @Test
    func heicConversionFailureSurfacesPreprocessingErrorBeforeUploadSessionCreation() async throws {
        let host = "heic-preprocess-failure.example.test"
        defer { FileFnMockURLProtocol.unregister(host: host) }

        let rootDirectory = FileManager.default.temporaryDirectory.appendingPathComponent("filefn-heic-failure-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: rootDirectory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: rootDirectory) }

        let sourceURL = rootDirectory.appendingPathComponent("photo.HEIC")
        try Data("heic-bytes".utf8).write(to: sourceURL)

        final class RequestCounter: @unchecked Sendable {
            private let lock = NSLock()
            private var value = 0

            func increment() {
                lock.lock()
                value += 1
                lock.unlock()
            }

            func load() -> Int {
                lock.lock()
                defer { lock.unlock() }
                return value
            }
        }
        let counter = RequestCounter()

        let client = try makeFileFnTestClient(host: host) { request in
            counter.increment()
            Issue.record("Unexpected request \(request.httpMethod ?? "nil") \(request.url?.absoluteString ?? "nil")")
            return makeJSONResponse(
                request: request,
                status: 500,
                body: #"{"ok":false,"error":{"code":"TEST_UNEXPECTED","message":"Unexpected request"}}"#
            )
        }

        let uploader = FileFnForegroundUploader(
            client: client,
            preprocessors: [
                FileFnHEICPreprocessor { _, _, _ in
                    throw NSError(domain: "FileFnHEICTests", code: 9)
                },
            ]
        )

        let uploadTask = uploader.upload(
            FileFnForegroundUploadRequest(
                source: .fileURL(sourceURL),
                policy: "public-image",
                mimeType: "image/heic"
            )
        )

        do {
            _ = try await uploadTask.value()
            Issue.record("Expected HEIC preprocessing to fail")
        } catch let error as FileFnClientError {
            switch error {
            case .preprocessingFailed(let code, let message):
                #expect(code == "FILEFN_HEIC_CONVERSION_FAILED")
                #expect(message.contains("HEIC preprocessing failed"))
            default:
                Issue.record("Unexpected error \(error)")
            }
        }

        #expect(counter.load() == 0)
    }

    @Test
    func backgroundUploadUsesHEICPreprocessorBeforeSnapshotAndSessionCreation() async throws {
        let host = "heic-background.example.test"
        defer { FileFnMockURLProtocol.unregister(host: host) }

        let rootDirectory = FileManager.default.temporaryDirectory.appendingPathComponent("filefn-heic-bg-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: rootDirectory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: rootDirectory) }

        let sourceURL = rootDirectory.appendingPathComponent("photo.HEIC")
        try Data("heic-background".utf8).write(to: sourceURL)
        let converted = Data("jpeg-background".utf8)

        let configuration = FileFnBackgroundUploadConfiguration(
            workingDirectory: rootDirectory,
            stateStore: FileFnFileSystemUploadStateStore(rootDirectory: rootDirectory),
            secretStore: FileFnHEICInMemorySecretStore()
        )

        let client = try makeFileFnTestClient(host: host) { request in
            switch (request.httpMethod, request.url?.path) {
            case ("POST", "/filefn/upload/init"):
                let body = try fileFnHEICRequestBody(request)
                let metadata = try #require(body["metadata"] as? [String: Any])
                #expect(body["fileName"] as? String == "photo.jpg")
                #expect(body["mimeType"] as? String == "image/jpeg")
                #expect(metadata["originalMimeType"] as? String == "image/heic")
                return makeJSONResponse(
                    request: request,
                    status: 200,
                    body: """
                    {
                      "ok": true,
                      "data": {
                        "uploadSessionId": "upl_heic_bg_001",
                        "uploadSessionToken": "test-upload-token-heic-bg",
                        "uploadMode": "proxy",
                        "chunkSizeBytes": 64,
                        "totalParts": 1,
                        "expiresAt": "2026-03-29T12:00:00Z"
                      }
                    }
                    """
                )
            case ("POST", "/filefn/upload/upl_heic_bg_001/parts/1/sign"):
                return makeJSONResponse(
                    request: request,
                    status: 200,
                    body: """
                    {
                      "ok": true,
                      "data": {
                        "url": "/upload/upl_heic_bg_001/parts/1",
                        "headers": {
                          "content-type": "application/octet-stream"
                        },
                        "expiresAt": "2026-03-29T12:00:00Z"
                      }
                    }
                    """
                )
            case ("PUT", "/filefn/upload/upl_heic_bg_001/parts/1"):
                let body = try fileFnHEICRequestBodyData(request)
                #expect(body == converted)
                return makeJSONResponse(
                    request: request,
                    status: 200,
                    body: """
                    {
                      "ok": true,
                      "data": {
                        "etag": "etag_heic_bg_001",
                        "size": \(converted.count),
                        "recorded": true
                      }
                    }
                    """
                )
            case ("POST", "/filefn/upload/upl_heic_bg_001/complete"):
                return makeJSONResponse(
                    request: request,
                    status: 200,
                    body: """
                    {
                      "ok": true,
                      "data": {
                        "fileId": "file_heic_bg_001",
                        "versionId": "ver_heic_bg_001"
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

        let uploader = FileFnBackgroundUploader(
            client: client,
            configuration: configuration,
            preprocessors: [
                FileFnHEICPreprocessor { _, outputURL, _ in
                    try converted.write(to: outputURL, options: .atomic)
                },
            ]
        )

        let snapshot = try await uploader.enqueue(
            FileFnForegroundUploadRequest(
                source: .fileURL(sourceURL),
                policy: "public-image",
                mimeType: "image/heic"
            )
        )
        let result = try await uploader.waitForCompletion(uploadID: snapshot.uploadID)

        #expect(snapshot.fileName == "photo.jpg")
        #expect(snapshot.mimeType == "image/jpeg")
        #expect(snapshot.metadata?["originalMimeType"] == .string("image/heic"))
        #expect(result == FileFnCompletedUpload(fileId: "file_heic_bg_001", versionId: "ver_heic_bg_001"))
    }
}

private actor FileFnHEICInMemorySecretStore: FileFnSecretStore {
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

private func fileFnHEICRequestBody(_ request: URLRequest) throws -> [String: Any] {
    let body = try fileFnHEICRequestBodyData(request)
    let object = try JSONSerialization.jsonObject(with: body)
    return try #require(object as? [String: Any])
}

private func fileFnHEICRequestBodyData(_ request: URLRequest) throws -> Data {
    if let body = request.httpBody {
        return body
    }

    guard let stream = request.httpBodyStream else {
        throw URLError(.badURL)
    }

    stream.open()
    defer { stream.close() }

    var data = Data()
    let bufferSize = 4096
    let buffer = UnsafeMutablePointer<UInt8>.allocate(capacity: bufferSize)
    defer { buffer.deallocate() }

    while stream.hasBytesAvailable {
        let bytesRead = stream.read(buffer, maxLength: bufferSize)
        if bytesRead < 0 {
            throw stream.streamError ?? URLError(.cannotDecodeRawData)
        }
        if bytesRead == 0 {
            break
        }
        data.append(buffer, count: bytesRead)
    }

    return data
}
