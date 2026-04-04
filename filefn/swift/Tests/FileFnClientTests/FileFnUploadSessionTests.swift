@testable import FileFnClient
import Foundation
import Testing

private func fileFnUploadRequestBody(_ request: URLRequest) throws -> [String: Any] {
    let body = try fileFnRequestBodyDataForUploads(request)
    let object = try JSONSerialization.jsonObject(with: body)
    return try #require(object as? [String: Any])
}

private func fileFnRequestBodyDataForUploads(_ request: URLRequest) throws -> Data {
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

struct FileFnUploadSessionTests {
    @Test
    func lowLevelUploadRoutesPreserveHeadersAndIdempotentCompletion() async throws {
        let host = "upload-routes-low-level.example.test"
        defer { FileFnMockURLProtocol.unregister(host: host) }

        let client = try makeFileFnTestClient(host: host) { request in
            switch (request.httpMethod, request.url?.path) {
            case ("POST", "/filefn/upload/init"):
                #expect(request.value(forHTTPHeaderField: "x-idempotency-key") == "idem_swift_001")
                let body = try fileFnUploadRequestBody(request)
                #expect(body["policy"] as? String == "public-image")
                #expect(body["fileName"] as? String == "avatar.png")
                #expect(body["fileId"] as? String == "file_swift_001")
                return makeJSONResponse(
                    request: request,
                    status: 200,
                    body: """
                    {
                      "ok": true,
                      "data": {
                        "uploadSessionId": "upl_001",
                        "uploadSessionToken": "upls_anon_001",
                        "uploadMode": "multipart-signed-url",
                        "chunkSizeBytes": 8388608,
                        "totalParts": 1,
                        "expiresAt": "2026-03-28T07:16:42Z"
                      },
                      "requestId": "req_upload_init_001"
                    }
                    """
                )
            case ("GET", "/filefn/upload/upl_001/status"):
                #expect(request.value(forHTTPHeaderField: "x-upload-session-token") == "upls_anon_001")
                return makeJSONResponse(
                    request: request,
                    status: 200,
                    body: """
                    {
                      "ok": true,
                      "data": {
                        "uploadSessionId": "upl_001",
                        "status": "pending",
                        "totalParts": 1,
                        "recordedParts": [],
                        "uploadedParts": [],
                        "chunkSizeBytes": 8388608,
                        "fileSize": 2097152,
                        "expiresAt": "2026-03-28T07:16:42Z"
                      },
                      "requestId": "req_upload_status_001"
                    }
                    """
                )
            case ("POST", "/filefn/upload/upl_001/parts/1/sign"):
                #expect(request.value(forHTTPHeaderField: "x-upload-session-token") == "upls_anon_001")
                let body = try fileFnUploadRequestBody(request)
                #expect((body["contentLength"] as? Int) == 2097152 || (body["contentLength"] as? NSNumber)?.intValue == 2097152)
                return makeJSONResponse(
                    request: request,
                    status: 200,
                    body: """
                    {
                      "ok": true,
                      "data": {
                        "url": "/upload/upl_001/parts/1",
                        "headers": {
                          "content-type": "image/png"
                        },
                        "expiresAt": "2026-03-28T07:16:42Z"
                      },
                      "requestId": "req_upload_sign_001"
                    }
                    """
                )
            case ("POST", "/filefn/upload/upl_001/parts/1/complete"):
                #expect(request.value(forHTTPHeaderField: "x-upload-session-token") == "upls_anon_001")
                let body = try fileFnUploadRequestBody(request)
                #expect(body["etag"] as? String == "\"etag_swift_001\"")
                #expect((body["size"] as? Int) == 2097152 || (body["size"] as? NSNumber)?.intValue == 2097152)
                return makeJSONResponse(
                    request: request,
                    status: 200,
                    body: """
                    {
                      "ok": true,
                      "data": {
                        "recorded": true
                      },
                      "requestId": "req_upload_complete_part_001"
                    }
                    """
                )
            case ("POST", "/filefn/upload/upl_001/complete"):
                #expect(request.value(forHTTPHeaderField: "x-upload-session-token") == "upls_anon_001")
                return makeJSONResponse(
                    request: request,
                    status: 200,
                    body: """
                    {
                      "ok": true,
                      "data": {
                        "fileId": "file_swift_001",
                        "versionId": "ver_001"
                      },
                      "requestId": "req_upload_complete_001"
                    }
                    """
                )
            case ("POST", "/filefn/upload/upl_abort_001/abort"):
                #expect(request.value(forHTTPHeaderField: "x-upload-session-token") == "upls_abort_001")
                return makeJSONResponse(
                    request: request,
                    status: 200,
                    body: """
                    {
                      "ok": true,
                      "data": {
                        "aborted": true
                      },
                      "requestId": "req_upload_abort_001"
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

        let session = try await client.createUploadSession(
            request: FileFnCreateUploadSessionRequest(
                policy: "public-image",
                fileName: "avatar.png",
                size: 2_097_152,
                mimeType: "image/png",
                fileId: "file_swift_001"
            ),
            idempotencyKey: "idem_swift_001"
        )
        #expect(session.uploadSessionToken == "upls_anon_001")
        #expect(session.uploadMode == .multipartSignedURL)

        let status = try await client.getUploadStatus(
            uploadSessionId: "upl_001",
            uploadSessionToken: "upls_anon_001"
        )
        #expect(status.totalParts == 1)
        #expect(status.chunkSizeBytes == 8_388_608)

        let signature = try await client.signPart(
            uploadSessionId: "upl_001",
            partNumber: 1,
            contentLength: 2_097_152,
            uploadSessionToken: "upls_anon_001"
        )
        #expect(signature.url.absoluteString == "https://\(host)/filefn/upload/upl_001/parts/1")
        #expect(signature.headers["content-type"] == "image/png")

        let part = try await client.completePart(
            uploadSessionId: "upl_001",
            partNumber: 1,
            etag: "\"etag_swift_001\"",
            size: 2_097_152,
            uploadSessionToken: "upls_anon_001"
        )
        #expect(part.recorded)

        let completed = try await client.completeUpload(
            uploadSessionId: "upl_001",
            uploadSessionToken: "upls_anon_001"
        )
        let replay = try await client.completeUpload(
            uploadSessionId: "upl_001",
            uploadSessionToken: "upls_anon_001"
        )
        #expect(completed == FileFnCompletedUpload(fileId: "file_swift_001", versionId: "ver_001"))
        #expect(replay == completed)

        let aborted = try await client.abortUpload(
            uploadSessionId: "upl_abort_001",
            uploadSessionToken: "upls_abort_001"
        )
        #expect(aborted.aborted)
    }

    @Test
    func missingTokenAndCanonicalUploadErrorsSurfaceAsServerErrors() async throws {
        let host = "upload-routes-errors.example.test"
        defer { FileFnMockURLProtocol.unregister(host: host) }

        let client = try makeFileFnTestClient(host: host) { request in
            switch (request.httpMethod, request.url?.path) {
            case ("GET", "/filefn/upload/upl_001/status"):
                #expect(request.value(forHTTPHeaderField: "x-upload-session-token") == nil)
                return makeJSONResponse(
                    request: request,
                    status: 401,
                    body: """
                    {
                      "ok": false,
                      "error": {
                        "code": "FILEFN_SESSION_TOKEN_REQUIRED",
                        "message": "Upload session token required"
                      },
                      "requestId": "req_status_missing_token"
                    }
                    """
                )
            case ("POST", "/filefn/upload/upl_001/parts/9/sign"):
                return makeJSONResponse(
                    request: request,
                    status: 400,
                    body: """
                    {
                      "ok": false,
                      "error": {
                        "code": "FILEFN_INVALID_PART_NUMBER",
                        "message": "Invalid part number"
                      },
                      "requestId": "req_invalid_part_number"
                    }
                    """
                )
            case ("POST", "/filefn/upload/upl_001/parts/1/complete"):
                if request.value(forHTTPHeaderField: "x-upload-session-token") == "upls_wrong_001" {
                    return makeJSONResponse(
                        request: request,
                        status: 403,
                        body: """
                        {
                          "ok": false,
                          "error": {
                            "code": "FILEFN_SESSION_TOKEN_INVALID",
                            "message": "Invalid upload session token"
                          },
                          "requestId": "req_invalid_token"
                        }
                        """
                    )
                }
                return makeJSONResponse(
                    request: request,
                    status: 400,
                    body: """
                    {
                      "ok": false,
                      "error": {
                        "code": "FILEFN_INVALID_ETAG",
                        "message": "Invalid ETag"
                      },
                      "requestId": "req_invalid_etag"
                    }
                    """
                )
            case ("POST", "/filefn/upload/upl_001/complete"):
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
                      "requestId": "req_upload_incomplete"
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

        await #expect(throws: FileFnClientError.server(
            status: 401,
            payload: FileFnServerErrorPayload(
                code: "FILEFN_SESSION_TOKEN_REQUIRED",
                message: "Upload session token required"
            ),
            requestId: "req_status_missing_token"
        )) {
            _ = try await client.getUploadStatus(uploadSessionId: "upl_001")
        }

        await #expect(throws: FileFnClientError.server(
            status: 400,
            payload: FileFnServerErrorPayload(
                code: "FILEFN_INVALID_PART_NUMBER",
                message: "Invalid part number"
            ),
            requestId: "req_invalid_part_number"
        )) {
            _ = try await client.signPart(uploadSessionId: "upl_001", partNumber: 9, contentLength: 10)
        }

        await #expect(throws: FileFnClientError.server(
            status: 403,
            payload: FileFnServerErrorPayload(
                code: "FILEFN_SESSION_TOKEN_INVALID",
                message: "Invalid upload session token"
            ),
            requestId: "req_invalid_token"
        )) {
            _ = try await client.completePart(
                uploadSessionId: "upl_001",
                partNumber: 1,
                etag: "\"etag_wrong\"",
                size: 10,
                uploadSessionToken: "upls_wrong_001"
            )
        }

        await #expect(throws: FileFnClientError.server(
            status: 400,
            payload: FileFnServerErrorPayload(
                code: "FILEFN_INVALID_ETAG",
                message: "Invalid ETag"
            ),
            requestId: "req_invalid_etag"
        )) {
            _ = try await client.completePart(
                uploadSessionId: "upl_001",
                partNumber: 1,
                etag: "",
                size: 10,
                uploadSessionToken: "upls_anon_001"
            )
        }

        await #expect(throws: FileFnClientError.server(
            status: 409,
            payload: FileFnServerErrorPayload(
                code: "FILEFN_UPLOAD_INCOMPLETE",
                message: "Upload incomplete"
            ),
            requestId: "req_upload_incomplete"
        )) {
            _ = try await client.completeUpload(
                uploadSessionId: "upl_001",
                uploadSessionToken: "upls_anon_001"
            )
        }
    }
}
