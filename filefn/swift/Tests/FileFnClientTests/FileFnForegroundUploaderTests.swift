@testable import FileFnClient
import Foundation
import Testing

private func fileFnForegroundRequestBody(_ request: URLRequest) throws -> [String: Any] {
    let body = try fileFnForegroundRequestBodyData(request)
    let object = try JSONSerialization.jsonObject(with: body)
    return try #require(object as? [String: Any])
}

private func fileFnForegroundRequestBodyData(_ request: URLRequest) throws -> Data {
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

struct FileFnForegroundUploaderTests {
    @Test
    func signedForegroundUploadGeneratesIdentifiersAndEmitsMonotonicEvents() async throws {
        let apiHost = "foreground-upload-api.example.test"
        let uploadHost = "foreground-upload-signed.example.test"
        defer { FileFnMockURLProtocol.unregister(host: apiHost) }
        defer { FileFnMockURLProtocol.unregister(host: uploadHost) }

        let payload = Data("avatar-bytes".utf8)
        let temporaryURL = FileManager.default.temporaryDirectory.appendingPathComponent("avatar.png")
        try payload.write(to: temporaryURL, options: .atomic)
        defer { try? FileManager.default.removeItem(at: temporaryURL) }

        final class SignedUploadState: @unchecked Sendable {
            var generatedFileId = ""
        }
        let state = SignedUploadState()

        FileFnMockURLProtocol.register(host: uploadHost) { request in
            #expect(request.httpMethod == "PUT")
            #expect(request.value(forHTTPHeaderField: "x-upload-auth") == "signed_part_001")
            #expect(request.value(forHTTPHeaderField: "x-upload-session-token") == nil)
            let data = try fileFnForegroundRequestBodyData(request)
            #expect(data == payload)

            let response = HTTPURLResponse(
                url: try #require(request.url),
                statusCode: 200,
                httpVersion: nil,
                headerFields: ["etag": "\"etag_signed_001\""]
            )!
            return (response, Data())
        }

        let client = try makeFileFnTestClient(host: apiHost) { request in
            switch (request.httpMethod, request.url?.path) {
            case ("POST", "/filefn/upload/init"):
                #expect(request.value(forHTTPHeaderField: "x-idempotency-key")?.hasPrefix("idem_") == true)
                let body = try fileFnForegroundRequestBody(request)
                let fileId = try #require(body["fileId"] as? String)
                #expect(fileId.hasPrefix("file_"))
                state.generatedFileId = fileId
                #expect(body["fileName"] as? String == "avatar.png")
                #expect(body["mimeType"] as? String == "image/png")
                return makeJSONResponse(
                    request: request,
                    status: 200,
                    body: """
                    {
                      "ok": true,
                      "data": {
                        "uploadSessionId": "upl_signed_001",
                        "uploadMode": "multipart-signed-url",
                        "chunkSizeBytes": 8388608,
                        "totalParts": 1,
                        "expiresAt": "2026-03-29T11:00:00Z"
                      },
                      "requestId": "req_signed_init_001"
                    }
                    """
                )
            case ("POST", "/filefn/upload/upl_signed_001/parts/1/sign"):
                let body = try fileFnForegroundRequestBody(request)
                #expect((body["contentLength"] as? Int) == payload.count || (body["contentLength"] as? NSNumber)?.intValue == payload.count)
                return makeJSONResponse(
                    request: request,
                    status: 200,
                    body: """
                    {
                      "ok": true,
                      "data": {
                        "url": "https://\(uploadHost)/put/upl_signed_001/1?sig=abc",
                        "headers": {
                          "x-upload-auth": "signed_part_001"
                        },
                        "expiresAt": "2026-03-29T11:05:00Z"
                      },
                      "requestId": "req_signed_sign_001"
                    }
                    """
                )
            case ("POST", "/filefn/upload/upl_signed_001/parts/1/complete"):
                let body = try fileFnForegroundRequestBody(request)
                #expect(body["etag"] as? String == "\"etag_signed_001\"")
                #expect((body["size"] as? Int) == payload.count || (body["size"] as? NSNumber)?.intValue == payload.count)
                return makeJSONResponse(
                    request: request,
                    status: 200,
                    body: """
                    {
                      "ok": true,
                      "data": {
                        "recorded": true
                      },
                      "requestId": "req_signed_complete_part_001"
                    }
                    """
                )
            case ("POST", "/filefn/upload/upl_signed_001/complete"):
                return makeJSONResponse(
                    request: request,
                    status: 200,
                    body: """
                    {
                      "ok": true,
                      "data": {
                        "fileId": "file_generated",
                        "versionId": "ver_001"
                      },
                      "requestId": "req_signed_complete_001"
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

        let uploader = FileFnForegroundUploader(client: client)
        let uploadTask = uploader.upload(
            FileFnForegroundUploadRequest(
                source: .fileURL(temporaryURL),
                policy: "public-image",
                mimeType: "image/png"
            )
        )

        var events: [FileFnForegroundUploadEvent] = []
        for try await event in uploadTask.events {
            events.append(event)
        }
        let result = try await uploadTask.value()

        #expect(uploadTask.fileId.hasPrefix("file_"))
        #expect(uploadTask.fileId == state.generatedFileId)
        #expect(result == FileFnCompletedUpload(fileId: "file_generated", versionId: "ver_001"))
        #expect(events.map(\.kind.rawValue) == ["queued", "sessionCreated", "partProgress", "partCompleted", "completed"])
        #expect(events.map(\.progress.bytesUploaded) == [0, 0, Int64(payload.count), Int64(payload.count), Int64(payload.count)])
        #expect(events.map(\.progress.partsCompleted) == [0, 0, 1, 1, 1])
        #expect(events.last?.result == result)
    }

    @Test
    func proxyForegroundUploadReusesAnonymousTokenAndSkipsExplicitPartCompletionWhenRecorded() async throws {
        let host = "foreground-upload-proxy.example.test"
        defer { FileFnMockURLProtocol.unregister(host: host) }

        final class ProxyUploadState: @unchecked Sendable {
            var completePartCalls = 0
        }
        let state = ProxyUploadState()

        let client = try makeFileFnTestClient(host: host) { request in
            switch (request.httpMethod, request.url?.path) {
            case ("POST", "/filefn/upload/init"):
                #expect(request.value(forHTTPHeaderField: "x-idempotency-key")?.hasPrefix("idem_") == true)
                let body = try fileFnForegroundRequestBody(request)
                #expect((body["size"] as? Int) == 5 || (body["size"] as? NSNumber)?.intValue == 5)
                return makeJSONResponse(
                    request: request,
                    status: 200,
                    body: """
                    {
                      "ok": true,
                      "data": {
                        "uploadSessionId": "upl_proxy_001",
                        "uploadSessionToken": "upls_proxy_001",
                        "uploadMode": "proxy",
                        "chunkSizeBytes": 8,
                        "totalParts": 1,
                        "expiresAt": "2026-03-29T11:00:00Z"
                      },
                      "requestId": "req_proxy_init_001"
                    }
                    """
                )
            case ("POST", "/filefn/upload/upl_proxy_001/parts/1/sign"):
                #expect(request.value(forHTTPHeaderField: "x-upload-session-token") == "upls_proxy_001")
                return makeJSONResponse(
                    request: request,
                    status: 200,
                    body: """
                    {
                      "ok": true,
                      "data": {
                        "url": "/upload/upl_proxy_001/parts/1",
                        "headers": {
                          "content-type": "application/octet-stream"
                        },
                        "expiresAt": "2026-03-29T11:05:00Z"
                      },
                      "requestId": "req_proxy_sign_001"
                    }
                    """
                )
            case ("PUT", "/filefn/upload/upl_proxy_001/parts/1"):
                #expect(request.value(forHTTPHeaderField: "x-upload-session-token") == "upls_proxy_001")
                let data = try fileFnForegroundRequestBodyData(request)
                #expect(String(data: data, encoding: .utf8) == "hello")
                return makeJSONResponse(
                    request: request,
                    status: 200,
                    body: """
                    {
                      "ok": true,
                      "data": {
                        "etag": "proxy-sha256-001",
                        "size": 5,
                        "recorded": true
                      },
                      "requestId": "req_proxy_put_001"
                    }
                    """
                )
            case ("POST", "/filefn/upload/upl_proxy_001/parts/1/complete"):
                state.completePartCalls += 1
                return makeJSONResponse(
                    request: request,
                    status: 200,
                    body: #"{"ok":true,"data":{"recorded":true}}"#
                )
            case ("POST", "/filefn/upload/upl_proxy_001/complete"):
                #expect(request.value(forHTTPHeaderField: "x-upload-session-token") == "upls_proxy_001")
                return makeJSONResponse(
                    request: request,
                    status: 200,
                    body: """
                    {
                      "ok": true,
                      "data": {
                        "fileId": "file_proxy_001",
                        "versionId": "ver_proxy_001"
                      },
                      "requestId": "req_proxy_complete_001"
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

        let uploader = FileFnForegroundUploader(client: client)
        let uploadTask = uploader.upload(
            FileFnForegroundUploadRequest(
                source: .data(Data("hello".utf8)),
                policy: "text-upload"
            )
        )

        var events: [FileFnForegroundUploadEvent] = []
        for try await event in uploadTask.events {
            events.append(event)
        }
        let result = try await uploadTask.value()

        #expect(result == FileFnCompletedUpload(fileId: "file_proxy_001", versionId: "ver_proxy_001"))
        #expect(events.map(\.kind.rawValue) == ["queued", "sessionCreated", "partProgress", "partCompleted", "completed"])
        #expect(events[1].uploadMode == .proxy)
        #expect(state.completePartCalls == 0)
    }

    @Test
    func foregroundUploaderSurfacesCanonicalIncompleteErrorAfterUploadingParts() async throws {
        let apiHost = "foreground-upload-incomplete.example.test"
        let uploadHost = "foreground-upload-incomplete-signed.example.test"
        defer { FileFnMockURLProtocol.unregister(host: apiHost) }
        defer { FileFnMockURLProtocol.unregister(host: uploadHost) }

        let payload = Data("avatar-bytes".utf8)
        let temporaryURL = FileManager.default.temporaryDirectory.appendingPathComponent("avatar-incomplete.png")
        try payload.write(to: temporaryURL, options: .atomic)
        defer { try? FileManager.default.removeItem(at: temporaryURL) }

        FileFnMockURLProtocol.register(host: uploadHost) { request in
            let response = HTTPURLResponse(
                url: try #require(request.url),
                statusCode: 200,
                httpVersion: nil,
                headerFields: ["etag": "\"etag_signed_002\""]
            )!
            return (response, Data())
        }

        let client = try makeFileFnTestClient(host: apiHost) { request in
            switch (request.httpMethod, request.url?.path) {
            case ("POST", "/filefn/upload/init"):
                return makeJSONResponse(
                    request: request,
                    status: 200,
                    body: """
                    {
                      "ok": true,
                      "data": {
                        "uploadSessionId": "upl_signed_002",
                        "uploadMode": "multipart-signed-url",
                        "chunkSizeBytes": 8388608,
                        "totalParts": 1,
                        "expiresAt": "2026-03-29T11:00:00Z"
                      }
                    }
                    """
                )
            case ("POST", "/filefn/upload/upl_signed_002/parts/1/sign"):
                return makeJSONResponse(
                    request: request,
                    status: 200,
                    body: """
                    {
                      "ok": true,
                      "data": {
                        "url": "https://\(uploadHost)/put/upl_signed_002/1?sig=abc",
                        "headers": {
                          "x-upload-auth": "signed_part_002"
                        },
                        "expiresAt": "2026-03-29T11:05:00Z"
                      }
                    }
                    """
                )
            case ("POST", "/filefn/upload/upl_signed_002/parts/1/complete"):
                return makeJSONResponse(
                    request: request,
                    status: 200,
                    body: #"{"ok":true,"data":{"recorded":true}}"#
                )
            case ("POST", "/filefn/upload/upl_signed_002/complete"):
                return makeJSONResponse(
                    request: request,
                    status: 409,
                    body: """
                    {
                      "ok": false,
                      "error": {
                        "code": "FILEFN_UPLOAD_INCOMPLETE",
                        "message": "Upload incomplete"
                      },
                      "requestId": "req_signed_incomplete_001"
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

        let uploader = FileFnForegroundUploader(client: client)
        let uploadTask = uploader.upload(
            FileFnForegroundUploadRequest(
                source: .fileURL(temporaryURL),
                policy: "public-image",
                mimeType: "image/png"
            )
        )

        var events: [FileFnForegroundUploadEvent] = []
        do {
            for try await event in uploadTask.events {
                events.append(event)
            }
            Issue.record("Expected upload stream to terminate with FILEFN_UPLOAD_INCOMPLETE")
        } catch let error as FileFnClientError {
            #expect(error == .server(
                status: 409,
                payload: FileFnServerErrorPayload(
                    code: "FILEFN_UPLOAD_INCOMPLETE",
                    message: "Upload incomplete"
                ),
                requestId: "req_signed_incomplete_001"
            ))
        }

        await #expect(throws: FileFnClientError.server(
            status: 409,
            payload: FileFnServerErrorPayload(
                code: "FILEFN_UPLOAD_INCOMPLETE",
                message: "Upload incomplete"
            ),
            requestId: "req_signed_incomplete_001"
        )) {
            _ = try await uploadTask.value()
        }
        #expect(events.map(\.kind.rawValue) == ["queued", "sessionCreated", "partProgress", "partCompleted"])
    }

    @Test
    func chunkerAndMaterializerUseDiskBackedChunksForDataSources() throws {
        let payload = Data("abcdefg".utf8)
        let materialized = try FileFnTemporaryFileMaterializer.materialize(
            source: .data(payload),
            preferredFileName: "sample.bin"
        )
        defer { FileFnTemporaryFileMaterializer.cleanup(materialized) }

        #expect(materialized.isTemporary)
        #expect(materialized.fileName == "sample.bin")
        #expect(materialized.fileSize == 7)

        let chunks = FileFnChunker(fileSize: materialized.fileSize, chunkSizeBytes: 3).chunks()
        #expect(chunks == [
            FileFnUploadChunk(partNumber: 1, offset: 0, size: 3),
            FileFnUploadChunk(partNumber: 2, offset: 3, size: 3),
            FileFnUploadChunk(partNumber: 3, offset: 6, size: 1),
        ])

        let chunkData = try chunks.map { try FileFnChunker.readChunk(from: materialized.fileURL, chunk: $0) }
        #expect(chunkData == [Data("abc".utf8), Data("def".utf8), Data("g".utf8)])
    }
}
