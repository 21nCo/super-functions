@testable import FileFnClient
import Foundation
import Testing

private func fileFnRequestBodyData(_ request: URLRequest) throws -> Data {
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

struct FileFnCapabilityRouteTests {
    @Test
    func mountedPolicyAndQuotaRoutesDecodeSuccessfully() async throws {
        let host = "capability-policy.example.test"
        defer { FileFnMockURLProtocol.unregister(host: host) }

        let client = try makeFileFnTestClient(host: host) { request in
            switch (request.httpMethod, request.url?.path) {
            case ("GET", "/filefn/policies"):
                return makeJSONResponse(
                    request: request,
                    status: 200,
                    body: """
                    {
                      "ok": true,
                      "data": {
                        "policies": [
                          {
                            "name": "public-image",
                            "maxSizeBytes": 10485760,
                            "contentTypes": ["image/png", "image/jpeg"],
                            "visibility": "public"
                          }
                        ]
                      }
                    }
                    """
                )
            case ("GET", "/filefn/quota/storage"):
                return makeJSONResponse(
                    request: request,
                    status: 200,
                    body: """
                    {
                      "ok": true,
                      "data": {
                        "current": 5120,
                        "limit": 10240
                      }
                    }
                    """
                )
            default:
                Issue.record("Unexpected request \(request.httpMethod ?? "nil") \(request.url?.absoluteString ?? "nil")")
                return makeJSONResponse(request: request, status: 500, body: #"{"ok":false,"error":{"code":"TEST_UNEXPECTED","message":"Unexpected request"}}"#)
            }
        }

        let policies = try await client.listPolicies()
        let quota = try await client.getStorageQuota()

        #expect(policies == [
            FileFnPolicySummary(
                name: "public-image",
                maxSizeBytes: 10_485_760,
                contentTypes: ["image/png", "image/jpeg"],
                visibility: "public"
            ),
        ])
        #expect(quota == FileFnStorageQuota(current: 5120, limit: 10240))
    }

    @Test
    func nonCanonicalQuotaRouteMissingBecomesCapabilityUnavailable() async throws {
        let host = "capability-quota-missing.example.test"
        defer { FileFnMockURLProtocol.unregister(host: host) }

        let client = try makeFileFnTestClient(host: host) { request in
            let response = HTTPURLResponse(
                url: try #require(request.url),
                statusCode: 404,
                httpVersion: nil,
                headerFields: ["content-type": "text/html"]
            )!
            return (response, Data("<html>not found</html>".utf8))
        }

        await #expect(throws: FileFnClientError.capabilityUnavailable(.quota, status: 404, requestId: nil)) {
            _ = try await client.getStorageQuota()
        }
    }

    @Test
    func mountedCanonicalQuotaFailureRemainsServerError() async throws {
        let host = "capability-quota-server.example.test"
        defer { FileFnMockURLProtocol.unregister(host: host) }

        let client = try makeFileFnTestClient(host: host) { request in
            makeJSONResponse(
                request: request,
                status: 404,
                body: """
                {
                  "ok": false,
                  "error": {
                    "code": "FILEFN_NOT_FOUND",
                    "message": "Quota not found"
                  },
                  "requestId": "req_quota_404"
                }
                """
            )
        }

        await #expect(throws: FileFnClientError.server(
            status: 404,
            payload: FileFnServerErrorPayload(code: "FILEFN_NOT_FOUND", message: "Quota not found"),
            requestId: "req_quota_404"
        )) {
            _ = try await client.getStorageQuota()
        }
    }

    @Test
    func grantRoutesEncodeDecodeAndRevoke() async throws {
        let host = "capability-grants.example.test"
        defer { FileFnMockURLProtocol.unregister(host: host) }

        let client = try makeFileFnTestClient(host: host) { request in
            switch (request.httpMethod, request.url?.path) {
            case ("POST", "/filefn/file_001/permissions"):
                let body = try JSONSerialization.jsonObject(with: fileFnRequestBodyData(request)) as? [String: Any]
                #expect(body?["userId"] as? String == "user_456")
                #expect(body?["canRead"] as? Bool == true)
                #expect(body?["canWrite"] as? Bool == true)
                #expect(body?["canDelete"] as? Bool == false)
                #expect(body?["canShare"] as? Bool == false)
                return makeJSONResponse(
                    request: request,
                    status: 201,
                    body: """
                    {
                      "ok": true,
                      "data": {
                        "permissionId": "perm_001",
                        "fileId": "file_001",
                        "userId": "user_456",
                        "role": null,
                        "tenantId": null,
                        "canRead": true,
                        "canWrite": true,
                        "canDelete": false,
                        "canShare": false,
                        "expiresAt": null,
                        "createdAt": "2026-03-27T07:16:42Z"
                      }
                    }
                    """
                )
            case ("GET", "/filefn/file_001/permissions"):
                return makeJSONResponse(
                    request: request,
                    status: 200,
                    body: """
                    {
                      "ok": true,
                      "data": {
                        "permissions": [
                          {
                            "permissionId": "perm_001",
                            "fileId": "file_001",
                            "userId": "user_456",
                            "role": null,
                            "tenantId": null,
                            "canRead": true,
                            "canWrite": true,
                            "canDelete": false,
                            "canShare": false,
                            "expiresAt": null,
                            "createdAt": "2026-03-27T07:16:42Z"
                          }
                        ]
                      }
                    }
                    """
                )
            case ("DELETE", "/filefn/file_001/permissions/perm_001"):
                return makeJSONResponse(
                    request: request,
                    status: 200,
                    body: """
                    {
                      "ok": true,
                      "data": {
                        "revoked": true
                      }
                    }
                    """
                )
            default:
                Issue.record("Unexpected request \(request.httpMethod ?? "nil") \(request.url?.absoluteString ?? "nil")")
                return makeJSONResponse(request: request, status: 500, body: #"{"ok":false,"error":{"code":"TEST_UNEXPECTED","message":"Unexpected request"}}"#)
            }
        }

        let created = try await client.createGrant(
            fileId: "file_001",
            request: FileFnCreateGrantRequest(
                userId: "user_456",
                canRead: true,
                canWrite: true,
                canDelete: false,
                canShare: false
            )
        )
        #expect(created.permissionId == "perm_001")
        #expect(created.canWrite)

        let listed = try await client.listGrants(fileId: "file_001")
        #expect(listed.count == 1)
        #expect(listed[0].userId == "user_456")

        try await client.revokeGrant(fileId: "file_001", permissionId: "perm_001")
    }

    @Test
    func mountedCanonicalGrantFailureStaysServerError() async throws {
        let host = "capability-grants-server.example.test"
        defer { FileFnMockURLProtocol.unregister(host: host) }

        let client = try makeFileFnTestClient(host: host) { request in
            makeJSONResponse(
                request: request,
                status: 403,
                body: """
                {
                  "ok": false,
                  "error": {
                    "code": "FILEFN_FORBIDDEN",
                    "message": "Access denied"
                  }
                }
                """
            )
        }

        await #expect(throws: FileFnClientError.server(
            status: 403,
            payload: FileFnServerErrorPayload(code: "FILEFN_FORBIDDEN", message: "Access denied"),
            requestId: nil
        )) {
            _ = try await client.listGrants(fileId: "file_001")
        }
    }

    @Test
    func shareRoutesResolveRelativeDownloadDescriptors() async throws {
        let host = "capability-shares.example.test"
        defer { FileFnMockURLProtocol.unregister(host: host) }

        let client = try makeFileFnTestClient(host: host) { request in
            switch (request.httpMethod, request.url?.path) {
            case ("POST", "/filefn/file_001/share-links"):
                return makeJSONResponse(
                    request: request,
                    status: 201,
                    body: """
                    {
                      "ok": true,
                      "data": {
                        "token": "share_token_001",
                        "expiresAt": "2026-03-28T07:16:42Z"
                      }
                    }
                    """
                )
            case ("GET", "/filefn/file_001/share-links"):
                return makeJSONResponse(
                    request: request,
                    status: 200,
                    body: """
                    {
                      "ok": true,
                      "data": {
                        "shares": [
                          {
                            "tokenHashPrefix": "abc12345",
                            "fileId": "file_001",
                            "versionId": null,
                            "expiresAt": "2026-03-28T07:16:42Z",
                            "requiresAuth": false,
                            "maxDownloads": 5,
                            "downloads": 1,
                            "createdAt": "2026-03-27T07:16:42Z",
                            "revokedAt": null
                          }
                        ]
                      }
                    }
                    """
                )
            case ("DELETE", "/filefn/file_001/share-links/share_token_001"):
                return makeJSONResponse(
                    request: request,
                    status: 200,
                    body: """
                    {
                      "ok": true,
                      "data": {
                        "revoked": true
                      }
                    }
                    """
                )
            case ("GET", "/filefn/share-links/share_token_001/download"):
                return makeJSONResponse(
                    request: request,
                    status: 200,
                    body: """
                    {
                      "ok": true,
                      "data": {
                        "url": "/proxy/share-links/share_token_001/download",
                        "fileName": "avatar.png",
                        "mimeType": "image/png"
                      }
                    }
                    """
                )
            default:
                Issue.record("Unexpected request \(request.httpMethod ?? "nil") \(request.url?.absoluteString ?? "nil")")
                return makeJSONResponse(request: request, status: 500, body: #"{"ok":false,"error":{"code":"TEST_UNEXPECTED","message":"Unexpected request"}}"#)
            }
        }

        let created = try await client.createShareLink(fileId: "file_001", request: FileFnCreateShareLinkRequest())
        #expect(created.token == "share_token_001")

        let shares = try await client.listShareLinks(fileId: "file_001")
        #expect(shares.count == 1)
        #expect(shares[0].tokenHashPrefix == "abc12345")

        let download = try await client.resolveShareDownload(token: "share_token_001")
        #expect(download.url.absoluteString == "https://\(host)/filefn/proxy/share-links/share_token_001/download")
        #expect(download.fileName == "avatar.png")
        #expect(download.mimeType == "image/png")

        try await client.revokeShareLink(fileId: "file_001", token: "share_token_001")
    }

    @Test
    func canonicalShareErrorsRemainServerErrors() async throws {
        let host = "capability-shares-server.example.test"
        defer { FileFnMockURLProtocol.unregister(host: host) }

        let client = try makeFileFnTestClient(host: host) { request in
            makeJSONResponse(
                request: request,
                status: 410,
                body: """
                {
                  "ok": false,
                  "error": {
                    "code": "FILEFN_SHARE_EXPIRED",
                    "message": "Share link has expired"
                  }
                }
                """
            )
        }

        await #expect(throws: FileFnClientError.server(
            status: 410,
            payload: FileFnServerErrorPayload(code: "FILEFN_SHARE_EXPIRED", message: "Share link has expired"),
            requestId: nil
        )) {
            _ = try await client.resolveShareDownload(token: "share_token_001")
        }
    }

    @Test
    func triggerProcessingEncodesAndDecodesMountedResponse() async throws {
        let host = "capability-processing.example.test"
        defer { FileFnMockURLProtocol.unregister(host: host) }

        let client = try makeFileFnTestClient(host: host) { request in
            switch (request.httpMethod, request.url?.path) {
            case ("POST", "/filefn/file_001/process"):
                break
            default:
                Issue.record("Unexpected request \(request.httpMethod ?? "nil") \(request.url?.absoluteString ?? "nil")")
                return makeJSONResponse(
                    request: request,
                    status: 500,
                    body: #"{"ok":false,"error":{"code":"TEST_UNEXPECTED","message":"Unexpected request"}}"#
                )
            }

            let body = try JSONSerialization.jsonObject(with: fileFnRequestBodyData(request)) as? [String: Any]
            #expect(body?["versionId"] as? String == "ver_001")
            #expect(body?["storageKey"] as? String == "tenant/file_001/ver_001.png")
            #expect(body?["mimeType"] as? String == "image/png")
            #expect((body?["size"] as? Int) == 123 || (body?["size"] as? Int64) == 123)
            #expect(body?["fileName"] as? String == "avatar.png")

            return makeJSONResponse(
                request: request,
                status: 200,
                body: """
                {
                  "ok": true,
                  "data": {
                    "processing": {
                      "started": true,
                      "enqueued": true,
                      "jobId": "job_001"
                    }
                  }
                }
                """
            )
        }

        let status = try await client.triggerProcessing(
            fileId: "file_001",
            request: FileFnTriggerProcessingRequest(
                versionId: "ver_001",
                storageKey: "tenant/file_001/ver_001.png",
                mimeType: "image/png",
                size: 123,
                fileName: "avatar.png"
            )
        )

        #expect(status == FileFnProcessingStatus(started: true, enqueued: true, jobId: "job_001"))
    }

    @Test
    func canonicalProcessingFailureRemainsServerErrorAndMissingRouteMapsToCapabilityUnavailable() async throws {
        let serverHost = "capability-processing-server.example.test"
        let missingHost = "capability-processing-missing.example.test"
        defer {
            FileFnMockURLProtocol.unregister(host: serverHost)
            FileFnMockURLProtocol.unregister(host: missingHost)
        }

        let serverClient = try makeFileFnTestClient(host: serverHost) { request in
            makeJSONResponse(
                request: request,
                status: 503,
                body: """
                {
                  "ok": false,
                  "error": {
                    "code": "FILEFN_PROCESSING_ENQUEUE_FAILED",
                    "message": "Failed to enqueue processing"
                  }
                }
                """
            )
        }

        await #expect(throws: FileFnClientError.server(
            status: 503,
            payload: FileFnServerErrorPayload(
                code: "FILEFN_PROCESSING_ENQUEUE_FAILED",
                message: "Failed to enqueue processing"
            ),
            requestId: nil
        )) {
            _ = try await serverClient.triggerProcessing(
                fileId: "file_001",
                request: FileFnTriggerProcessingRequest(
                    versionId: "ver_001",
                    storageKey: "tenant/file_001/ver_001.png",
                    mimeType: "image/png",
                    size: 123,
                    fileName: "avatar.png"
                )
            )
        }

        let missingClient = try makeFileFnTestClient(host: missingHost) { request in
            let response = HTTPURLResponse(
                url: try #require(request.url),
                statusCode: 405,
                httpVersion: nil,
                headerFields: ["content-type": "text/plain"]
            )!
            return (response, Data("method not allowed".utf8))
        }

        await #expect(throws: FileFnClientError.capabilityUnavailable(.processing, status: 405, requestId: nil)) {
            _ = try await missingClient.triggerProcessing(
                fileId: "file_001",
                request: FileFnTriggerProcessingRequest(
                    versionId: "ver_001",
                    storageKey: "tenant/file_001/ver_001.png",
                    mimeType: "image/png",
                    size: 123,
                    fileName: "avatar.png"
                )
            )
        }
    }
}
