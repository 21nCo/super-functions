@testable import FileFnClient
@testable import FileFnWebViewBridgeHost
import Foundation
import Testing

private func makeSecurityBridgeTestClient(
    host: String,
    basePath: String = "/filefn",
    handler: @escaping @Sendable (URLRequest) throws -> (HTTPURLResponse, Data)
) throws -> FileFnClient {
    FileFnBridgeMockURLProtocol.register(host: host, handler: handler)

    let configuration = URLSessionConfiguration.ephemeral
    configuration.protocolClasses = [FileFnBridgeMockURLProtocol.self]

    return try FileFnClient(
        configuration: FileFnClientConfiguration(
            baseURL: URL(string: "https://\(host)\(basePath)")!,
            sendClientVersionHeader: false,
            urlSession: URLSession(configuration: configuration)
        )
    )
}

private func makeSecurityBridgeJSONResponse(
    request: URLRequest,
    status: Int,
    body: String,
    headers: [String: String] = [:]
) -> (HTTPURLResponse, Data) {
    var finalHeaders = ["content-type": "application/json"]
    for (key, value) in headers {
        finalHeaders[key] = value
    }
    let response = HTTPURLResponse(
        url: request.url!,
        statusCode: status,
        httpVersion: nil,
        headerFields: finalHeaders
    )!
    return (response, Data(body.utf8))
}

private func securityBridgePayloadValue(_ object: Any) throws -> [String: Any] {
    try #require(object as? [String: Any])
}

struct FileFnBridgeSecurityTests {
    @Test
    func bridgeSanitizerPreservesHandshakeOwnershipFields() {
        let sanitized = fileFnBridgeSanitize(.object([
            "authOwner": .string("native"),
            "uploadOwner": .string("native"),
            "Authorization": .string("Bearer bridge-auth-token"),
            "Proxy-Authorization": .string("Bearer bridge-proxy-token"),
            "x-upload-session-token": .string("test-upload-token-001"),
        ]))

        #expect(sanitized == .object([
            "authOwner": .string("native"),
            "uploadOwner": .string("native"),
            "Authorization": .string("[REDACTED]"),
            "Proxy-Authorization": .string("[REDACTED]"),
            "x-upload-session-token": .string("[REDACTED]"),
        ]))
    }

    @Test
    func failureEnvelopesRedactSensitiveMessageAndDetails() throws {
        let response = FileFnBridgeResponseEnvelope.failure(
            id: "bridge_req_failure_001",
            error: FileFnBridgeError(
                code: "FILEFN_CLIENT_ERROR",
                message: "Unable to read /private/var/mobile/Containers/Data/Application/UUID/tmp/avatar.png",
                details: [
                    "bodySnippet": .string("https://storage.example.com/upload?X-Amz-Signature=secret"),
                    "Authorization": .string("Bearer bridge-auth-token"),
                ]
            )
        )

        let object = try securityBridgePayloadValue(fileFnBridgeFoundationObject(from: response))
        let error = try #require(object["error"] as? [String: Any])
        let details = try #require(error["details"] as? [String: Any])

        #expect(error["message"] as? String == "Sensitive bridge error redacted")
        #expect(details["bodySnippet"] as? String == "https://storage.example.com/upload?[REDACTED_QUERY]")
        #expect(details["Authorization"] as? String == "[REDACTED]")
    }

    @Test
    func failureEnvelopesRedactCamelCaseUploadSessionTokenMentions() throws {
        let response = FileFnBridgeResponseEnvelope.failure(
            id: "bridge_req_failure_002",
            error: FileFnBridgeError(
                code: "FILEFN_CLIENT_ERROR",
                message: "uploadSessionToken=test-bridge-upload-token"
            )
        )

        let object = try securityBridgePayloadValue(fileFnBridgeFoundationObject(from: response))
        let error = try #require(object["error"] as? [String: Any])

        #expect(error["message"] as? String == "Sensitive bridge error redacted")
    }

    @Test
    func nativeAssetPreviewURLIsOpaqueAndDoesNotExposeFilesystemPaths() async throws {
        let rootDirectory = FileManager.default.temporaryDirectory.appendingPathComponent("filefn-bridge-preview-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: rootDirectory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: rootDirectory) }

        let fileURL = rootDirectory.appendingPathComponent("avatar.png")
        try Data("avatar".utf8).write(to: fileURL)

        let registry = FileFnNativeAssetRegistry()
        let descriptor = try await registry.register(fileURL: fileURL, mimeType: "image/png", assetHandle: "asset_opaque_001")

        #expect(descriptor.previewURL.absoluteString == "filefn-bridge://asset/asset_opaque_001/preview")
        #expect(descriptor.previewURL.absoluteString.contains(rootDirectory.path) == false)
    }

    @Test
    func bridgeResponsesRedactHeadersSignedQueriesAndAbsolutePaths() async throws {
        let host = "bridge-security-redaction.example.test"
        defer { FileFnBridgeMockURLProtocol.unregister(host: host) }

        let client = try makeSecurityBridgeTestClient(host: host) { request in
            switch (request.httpMethod, request.url?.path) {
            case ("GET", "/filefn/file_001/download"):
                return makeSecurityBridgeJSONResponse(
                    request: request,
                    status: 200,
                    body: """
                    {
                      "ok": true,
                      "data": {
                        "url": "https://storage.example.com/upload?X-Amz-Signature=secret",
                        "headers": {
                          "Authorization": "Bearer test-auth-token",
                          "x-upload-session-token": "test-upload-token-001"
                        }
                      }
                    }
                    """
                )
            default:
                Issue.record("Unexpected request \(request.httpMethod ?? "nil") \(request.url?.absoluteString ?? "nil")")
                return makeSecurityBridgeJSONResponse(
                    request: request,
                    status: 500,
                    body: #"{"ok":false,"error":{"code":"TEST_UNEXPECTED","message":"Unexpected request"}}"#
                )
            }
        }

        let bridgeHost = await MainActor.run {
            FileFnWKWebViewBridgeHost(client: client)
        }
        _ = await bridgeHost.handleMessageForTesting([
            "protocol": FILEFN_BRIDGE_PROTOCOL,
            "id": "bridge_req_030",
            "method": "handshake",
            "payload": [
                "clientId": "ios-webview-shell",
                "mode": "native-backed",
                "baseURL": "https://api.example.test/filefn",
            ],
        ])

        let response = await bridgeHost.handleMessageForTesting([
            "protocol": FILEFN_BRIDGE_PROTOCOL,
            "id": "bridge_req_031",
            "method": "download.resolve",
            "payload": [
                "fileId": "file_001",
            ],
        ])

        #expect(response.ok)
        let object = try securityBridgePayloadValue(fileFnBridgeFoundationObject(from: response))
        let result = try #require(object["result"] as? [String: Any])
        let headers = try #require(result["headers"] as? [String: Any])

        #expect(result["url"] as? String == "https://storage.example.com/upload?[REDACTED_QUERY]")
        #expect(headers["Authorization"] as? String == "[REDACTED]")
        #expect(headers["x-upload-session-token"] as? String == "[REDACTED]")
    }

    @Test
    func bridgeEventEmitterRedactsSecretsAndAbsolutePaths() throws {
        let emitter = FileFnBridgeEventEmitter()
        var captured: FileFnBridgeEventEnvelope?
        emitter.setSink { event in
            captured = event
        }

        emitter.emit(
            event: "upload.progress",
            payload: .object([
                "Authorization": .string("Bearer bridge-auth-token"),
                "uploadSessionToken": .string("test-bridge-upload-token"),
                "signedURL": .string("https://storage.example.com/upload?X-Amz-Signature=secret"),
                "sourcePath": .string("/private/var/mobile/Containers/Data/Application/UUID/tmp/avatar.png"),
                "localFileURL": .string("file:///private/var/mobile/Containers/Data/Application/UUID/tmp/avatar.png?token=abc"),
                "previewURL": .string("filefn-bridge://asset/asset_001/preview"),
            ])
        )

        let payload = try #require(captured?.payload)
        #expect(payload == .object([
            "Authorization": .string("[REDACTED]"),
            "uploadSessionToken": .string("[REDACTED]"),
            "signedURL": .string("https://storage.example.com/upload?[REDACTED_QUERY]"),
            "sourcePath": .string("avatar.png"),
            "localFileURL": .string("avatar.png?[REDACTED_QUERY]"),
            "previewURL": .string("filefn-bridge://asset/asset_001/preview"),
        ]))
    }
}
