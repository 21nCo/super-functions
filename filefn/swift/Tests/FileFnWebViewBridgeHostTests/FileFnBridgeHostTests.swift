@testable import FileFnClient
@testable import FileFnWebViewBridgeHost
import Foundation
import Testing

final class FileFnBridgeMockURLProtocol: URLProtocol, @unchecked Sendable {
    private static let lock = NSLock()
    private static var handlers: [String: @Sendable (URLRequest) throws -> (HTTPURLResponse, Data)] = [:]

    static func register(
        host: String,
        handler: @escaping @Sendable (URLRequest) throws -> (HTTPURLResponse, Data)
    ) {
        lock.lock()
        handlers[host] = handler
        lock.unlock()
    }

    static func unregister(host: String) {
        lock.lock()
        handlers.removeValue(forKey: host)
        lock.unlock()
    }

    private static func handler(for host: String) -> (@Sendable (URLRequest) throws -> (HTTPURLResponse, Data))? {
        lock.lock()
        defer { lock.unlock() }
        return handlers[host]
    }

    override class func canInit(with request: URLRequest) -> Bool {
        request.url?.host != nil
    }

    override class func canonicalRequest(for request: URLRequest) -> URLRequest {
        request
    }

    override func startLoading() {
        guard let host = request.url?.host,
              let handler = Self.handler(for: host) else {
            client?.urlProtocol(self, didFailWithError: URLError(.badServerResponse))
            return
        }

        do {
            let (response, data) = try handler(request)
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: data)
            client?.urlProtocolDidFinishLoading(self)
        } catch {
            client?.urlProtocol(self, didFailWithError: error)
        }
    }

    override func stopLoading() {}
}

func makeBridgeTestClient(
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

func makeBridgeJSONResponse(
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

func bridgePayloadValue(_ object: Any) throws -> [String: Any] {
    try #require(object as? [String: Any])
}

struct FileFnBridgeHostTests {
    @Test
    func handshakeAndClientMethodDispatchSucceed() async throws {
        let host = "bridge-host-dispatch.example.test"
        defer { FileFnBridgeMockURLProtocol.unregister(host: host) }

        let client = try makeBridgeTestClient(host: host) { request in
            switch (request.httpMethod, request.url?.path) {
            case ("GET", "/filefn/file_001"):
                return makeBridgeJSONResponse(
                    request: request,
                    status: 200,
                    body: """
                    {
                      "ok": true,
                      "data": {
                        "fileId": "file_001",
                        "currentVersionId": "ver_001",
                        "ownerId": "user_001",
                        "tenantId": "tenant_001",
                        "visibility": "private",
                        "mimeType": "image/png",
                        "size": 42,
                        "name": "avatar.png",
                        "createdAt": "2026-03-29T11:00:00Z",
                        "updatedAt": "2026-03-29T11:00:00Z"
                      }
                    }
                    """
                )
            case ("GET", "/filefn/policies"):
                return makeBridgeJSONResponse(
                    request: request,
                    status: 200,
                    body: """
                    {
                      "ok": true,
                      "data": {
                        "policies": [
                          {
                            "name": "public-image",
                            "maxSizeBytes": 1024,
                            "contentTypes": ["image/png"],
                            "visibility": "public"
                          }
                        ]
                      }
                    }
                    """
                )
            default:
                Issue.record("Unexpected request \(request.httpMethod ?? "nil") \(request.url?.absoluteString ?? "nil")")
                return makeBridgeJSONResponse(
                    request: request,
                    status: 500,
                    body: #"{"ok":false,"error":{"code":"TEST_UNEXPECTED","message":"Unexpected request"}}"#
                )
            }
        }

        let bridgeHost = await MainActor.run {
            FileFnWKWebViewBridgeHost(client: client)
        }

        let handshake = await bridgeHost.handleMessageForTesting([
            "protocol": FILEFN_BRIDGE_PROTOCOL,
            "id": "bridge_req_001",
            "method": "handshake",
            "payload": [
                "clientId": "ios-webview-shell",
                "mode": "native-backed",
                "baseURL": "https://api.example.test/filefn",
            ],
        ])

        #expect(handshake.ok)
        let handshakeObject = try bridgePayloadValue(fileFnBridgeFoundationObject(from: handshake))
        #expect((handshakeObject["result"] as? [String: Any])?["previewScheme"] as? String == "filefn-bridge")

        let fileGet = await bridgeHost.handleMessageForTesting([
            "protocol": FILEFN_BRIDGE_PROTOCOL,
            "id": "bridge_req_002",
            "method": "file.get",
            "payload": ["fileId": "file_001"],
        ])
        #expect(fileGet.ok)
        let fileGetObject = try bridgePayloadValue(fileFnBridgeFoundationObject(from: fileGet))
        #expect((fileGetObject["result"] as? [String: Any])?["fileId"] as? String == "file_001")

        let policyList = await bridgeHost.handleMessageForTesting([
            "protocol": FILEFN_BRIDGE_PROTOCOL,
            "id": "bridge_req_003",
            "method": "policy.list",
        ])
        #expect(policyList.ok)
        let policyObject = try bridgePayloadValue(fileFnBridgeFoundationObject(from: policyList))
        #expect(((policyObject["result"] as? [[String: Any]])?.first)?["name"] as? String == "public-image")
    }

    @Test
    func bridgeHandshakeRequirementAndInvalidSourceErrorsAreStable() async throws {
        let host = "bridge-host-errors.example.test"
        defer { FileFnBridgeMockURLProtocol.unregister(host: host) }

        let client = try makeBridgeTestClient(host: host) { request in
            return makeBridgeJSONResponse(
                request: request,
                status: 500,
                body: #"{"ok":false,"error":{"code":"TEST_UNEXPECTED","message":"Unexpected request"}}"#
            )
        }

        let bridgeHost = await MainActor.run {
            FileFnWKWebViewBridgeHost(client: client)
        }

        let preHandshake = await bridgeHost.handleMessageForTesting([
            "protocol": FILEFN_BRIDGE_PROTOCOL,
            "id": "bridge_req_010",
            "method": "health.check",
        ])
        #expect(preHandshake == fileFnBridgeFailure(
            id: "bridge_req_010",
            code: "BRIDGE_HANDSHAKE_REQUIRED",
            message: "handshake must complete before native-backed requests"
        ))

        let mismatch = await bridgeHost.handleMessageForTesting([
            "protocol": FILEFN_BRIDGE_PROTOCOL,
            "id": "bridge_req_011",
            "method": "handshake",
            "payload": [
                "clientId": "ios-webview-shell",
                "mode": "web-owned",
                "baseURL": "https://api.example.test/filefn",
            ],
        ])
        #expect(mismatch == fileFnBridgeFailure(
            id: "bridge_req_011",
            code: "BRIDGE_PROTOCOL_MISMATCH",
            message: "Native-backed mode mismatch",
            details: ["expectedMode": .string("native-backed")]
        ))

        _ = await bridgeHost.handleMessageForTesting([
            "protocol": FILEFN_BRIDGE_PROTOCOL,
            "id": "bridge_req_012",
            "method": "handshake",
            "payload": [
                "clientId": "ios-webview-shell",
                "mode": "native-backed",
                "baseURL": "https://api.example.test/filefn",
            ],
        ])

        let invalidSource = await bridgeHost.handleMessageForTesting([
            "protocol": FILEFN_BRIDGE_PROTOCOL,
            "id": "bridge_req_013",
            "method": "upload.start",
            "payload": [
                "policy": "public-image",
                "blob": "base64:AAAA",
            ],
        ])
        #expect(invalidSource == fileFnBridgeFailure(
            id: "bridge_req_013",
            code: "BRIDGE_INVALID_SOURCE",
            message: "Native-backed uploads require assetHandle"
        ))
    }

    @Test
    func backgroundUploadStartEmitsProgressAndCompletedEventsWithoutLeakingSecrets() async throws {
        let host = "bridge-host-upload.example.test"
        defer { FileFnBridgeMockURLProtocol.unregister(host: host) }

        let assetDirectory = FileManager.default.temporaryDirectory.appendingPathComponent("filefn-bridge-assets-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: assetDirectory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: assetDirectory) }

        let assetURL = assetDirectory.appendingPathComponent("avatar.png")
        try Data("hello-bridge".utf8).write(to: assetURL)

        let bridgeWorkingDirectory = assetDirectory.appendingPathComponent("background")
        let assetRegistry = FileFnNativeAssetRegistry()
        let descriptor = try await assetRegistry.register(fileURL: assetURL, mimeType: "image/png", assetHandle: "asset_001")

        let client = try makeBridgeTestClient(host: host) { request in
            switch (request.httpMethod, request.url?.path) {
            case ("POST", "/filefn/upload/init"):
                return makeBridgeJSONResponse(
                    request: request,
                    status: 200,
                    body: """
                    {
                      "ok": true,
                      "data": {
                        "uploadSessionId": "upl_bridge_001",
                        "uploadSessionToken": "test-upload-token-bridge",
                        "uploadMode": "proxy",
                        "chunkSizeBytes": 5,
                        "totalParts": 3,
                        "expiresAt": "2026-03-29T12:00:00Z"
                      }
                    }
                    """
                )
            case ("POST", "/filefn/upload/upl_bridge_001/parts/1/sign"),
                 ("POST", "/filefn/upload/upl_bridge_001/parts/2/sign"),
                 ("POST", "/filefn/upload/upl_bridge_001/parts/3/sign"):
                let path = request.url?.path ?? ""
                let partNumber = path.contains("/parts/1/") ? 1 : (path.contains("/parts/2/") ? 2 : 3)
                return makeBridgeJSONResponse(
                    request: request,
                    status: 200,
                    body: """
                    {
                      "ok": true,
                      "data": {
                        "url": "/upload/upl_bridge_001/parts/\(partNumber)",
                        "headers": {
                          "Authorization": "Bearer should_not_leak"
                        },
                        "expiresAt": "2026-03-29T12:00:00Z"
                      }
                    }
                    """
                )
            case ("PUT", "/filefn/upload/upl_bridge_001/parts/1"),
                 ("PUT", "/filefn/upload/upl_bridge_001/parts/2"),
                 ("PUT", "/filefn/upload/upl_bridge_001/parts/3"):
                #expect(request.value(forHTTPHeaderField: "x-upload-session-token") == "test-upload-token-bridge")
                return makeBridgeJSONResponse(
                    request: request,
                    status: 200,
                    body: """
                    {
                      "ok": true,
                      "data": {
                        "etag": "proxy-etag",
                        "size": 5,
                        "recorded": true
                      }
                    }
                    """
                )
            case ("POST", "/filefn/upload/upl_bridge_001/complete"):
                return makeBridgeJSONResponse(
                    request: request,
                    status: 200,
                    body: """
                    {
                      "ok": true,
                      "data": {
                        "fileId": "file_native_001",
                        "versionId": "ver_native_001"
                      }
                    }
                    """
                )
            default:
                Issue.record("Unexpected request \(request.httpMethod ?? "nil") \(request.url?.absoluteString ?? "nil")")
                return makeBridgeJSONResponse(
                    request: request,
                    status: 500,
                    body: #"{"ok":false,"error":{"code":"TEST_UNEXPECTED","message":"Unexpected request"}}"#
                )
            }
        }

        let backgroundUploader = FileFnBackgroundUploader(
            client: client,
            configuration: FileFnBackgroundUploadConfiguration(
                workingDirectory: bridgeWorkingDirectory
            )
        )

        let bridgeHost = await MainActor.run {
            FileFnWKWebViewBridgeHost(
                client: client,
                assetRegistry: assetRegistry,
                backgroundUploader: backgroundUploader
            )
        }

        let sink = LockedBridgeSink()
        bridgeHost.setTestingSink { value in
            sink.append(value)
        }

        _ = await bridgeHost.handleMessageForTesting([
            "protocol": FILEFN_BRIDGE_PROTOCOL,
            "id": "bridge_req_020",
            "method": "handshake",
            "payload": [
                "clientId": "ios-webview-shell",
                "mode": "native-backed",
                "baseURL": "https://api.example.test/filefn",
            ],
        ])

        let startResponse = await bridgeHost.handleMessageForTesting([
            "protocol": FILEFN_BRIDGE_PROTOCOL,
            "id": "bridge_req_021",
            "method": "upload.start",
            "payload": [
                "policy": "public-image",
                "assetHandle": descriptor.assetHandle,
                "background": true,
            ],
        ])
        #expect(startResponse.ok)

        try await waitForBridgeEvent(named: "upload.completed", sink: sink)
        let events = sink.events()

        let progressEvent = try #require(events.first(where: { ($0["event"] as? String) == "upload.progress" }))
        let completedEvent = try #require(events.first(where: { ($0["event"] as? String) == "upload.completed" }))

        #expect(((progressEvent["payload"] as? [String: Any])?["uploadID"] as? String)?.hasPrefix("bg_") == true)
        #expect((((completedEvent["payload"] as? [String: Any])?["result"] as? [String: Any])?["fileId"] as? String) == "file_native_001")

        let eventDump = String(describing: events)
        #expect(eventDump.contains("uploadSessionToken") == false)
        #expect(eventDump.contains("Authorization") == false)
        #expect(eventDump.contains("/private/var/") == false)
    }

    @Test
    func nativeBackedBridgeUploadsRunThroughHEICPreprocessing() async throws {
        let host = "bridge-host-heic.example.test"
        defer { FileFnBridgeMockURLProtocol.unregister(host: host) }

        let assetDirectory = FileManager.default.temporaryDirectory.appendingPathComponent("filefn-bridge-heic-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: assetDirectory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: assetDirectory) }

        let sourceURL = assetDirectory.appendingPathComponent("avatar.HEIC")
        try Data("bridge-heic".utf8).write(to: sourceURL)
        let converted = Data("bridge-jpeg".utf8)

        let client = try makeBridgeTestClient(host: host) { request in
            switch (request.httpMethod, request.url?.path) {
            case ("POST", "/filefn/upload/init"):
                let body = try bridgeRequestBody(request)
                let metadata = try #require(body["metadata"] as? [String: Any])
                #expect(body["fileName"] as? String == "avatar.jpg")
                #expect(body["mimeType"] as? String == "image/jpeg")
                #expect(metadata["originalMimeType"] as? String == "image/heic")
                return makeBridgeJSONResponse(
                    request: request,
                    status: 200,
                    body: """
                    {
                      "ok": true,
                      "data": {
                        "uploadSessionId": "upl_bridge_heic_001",
                        "uploadSessionToken": "test-upload-token-bridge-heic",
                        "uploadMode": "proxy",
                        "chunkSizeBytes": 64,
                        "totalParts": 1,
                        "expiresAt": "2026-03-29T12:00:00Z"
                      }
                    }
                    """
                )
            case ("POST", "/filefn/upload/upl_bridge_heic_001/parts/1/sign"):
                return makeBridgeJSONResponse(
                    request: request,
                    status: 200,
                    body: """
                    {
                      "ok": true,
                      "data": {
                        "url": "/upload/upl_bridge_heic_001/parts/1",
                        "headers": {
                          "content-type": "application/octet-stream"
                        },
                        "expiresAt": "2026-03-29T12:00:00Z"
                      }
                    }
                    """
                )
            case ("PUT", "/filefn/upload/upl_bridge_heic_001/parts/1"):
                let body = try bridgeRequestBodyData(request)
                #expect(body == converted)
                return makeBridgeJSONResponse(
                    request: request,
                    status: 200,
                    body: """
                    {
                      "ok": true,
                      "data": {
                        "etag": "etag_bridge_heic_001",
                        "size": \(converted.count),
                        "recorded": true
                      }
                    }
                    """
                )
            case ("POST", "/filefn/upload/upl_bridge_heic_001/complete"):
                return makeBridgeJSONResponse(
                    request: request,
                    status: 200,
                    body: """
                    {
                      "ok": true,
                      "data": {
                        "fileId": "file_bridge_heic_001",
                        "versionId": "ver_bridge_heic_001"
                      }
                    }
                    """
                )
            default:
                Issue.record("Unexpected request \(request.httpMethod ?? "nil") \(request.url?.absoluteString ?? "nil")")
                return makeBridgeJSONResponse(
                    request: request,
                    status: 500,
                    body: #"{"ok":false,"error":{"code":"TEST_UNEXPECTED","message":"Unexpected request"}}"#
                )
            }
        }

        let assetRegistry = FileFnNativeAssetRegistry()
        _ = try await assetRegistry.register(
            fileURL: sourceURL,
            fileName: "avatar.HEIC",
            mimeType: "image/heic",
            assetHandle: "asset_bridge_heic_001"
        )

        let foregroundUploader = FileFnForegroundUploader(
            client: client,
            preprocessors: [
                FileFnHEICPreprocessor { _, outputURL, _ in
                    try converted.write(to: outputURL, options: .atomic)
                },
            ]
        )

        let bridgeHost = await MainActor.run {
            FileFnWKWebViewBridgeHost(
                client: client,
                assetRegistry: assetRegistry,
                foregroundUploader: foregroundUploader
            )
        }

        let sink = LockedBridgeSink()
        bridgeHost.setTestingSink { value in
            sink.append(value)
        }

        _ = await bridgeHost.handleMessageForTesting([
            "protocol": FILEFN_BRIDGE_PROTOCOL,
            "id": "bridge_req_100",
            "method": "handshake",
            "payload": [
                "clientId": "ios-webview-shell",
                "mode": "native-backed",
                "baseURL": "https://api.example.test/filefn",
            ],
        ])

        let response = await bridgeHost.handleMessageForTesting([
            "protocol": FILEFN_BRIDGE_PROTOCOL,
            "id": "bridge_req_101",
            "method": "upload.start",
            "payload": [
                "policy": "public-image",
                "assetHandle": "asset_bridge_heic_001",
                "background": false,
            ],
        ])

        #expect(response.ok)
        try await waitForBridgeEvent(named: "upload.completed", sink: sink)
        let events = sink.events()
        let completedEvent = try #require(events.first(where: { ($0["event"] as? String) == "upload.completed" }))
        let result = (completedEvent["payload"] as? [String: Any])?["result"] as? [String: Any]
        #expect(result?["fileId"] as? String == "file_bridge_heic_001")
        #expect(result?["versionId"] as? String == "ver_bridge_heic_001")
    }
}

private final class LockedBridgeSink: @unchecked Sendable {
    private let lock = NSLock()
    private var values: [[String: Any]] = []

    func append(_ value: Any) {
        guard let object = value as? [String: Any],
              object["event"] != nil else {
            return
        }
        lock.lock()
        values.append(object)
        lock.unlock()
    }

    func events() -> [[String: Any]] {
        lock.lock()
        defer { lock.unlock() }
        return values
    }
}

private func waitForBridgeEvent(named eventName: String, sink: LockedBridgeSink) async throws {
    for _ in 0 ..< 50 {
        if sink.events().contains(where: { ($0["event"] as? String) == eventName }) {
            return
        }
        try await Task.sleep(nanoseconds: 20_000_000)
    }
    throw NSError(
        domain: "FileFnBridgeHostTests",
        code: 1,
        userInfo: [
            NSLocalizedDescriptionKey: "Timed out waiting for bridge event \(eventName). Events: \(sink.events())",
        ]
    )
}

private func bridgeRequestBody(_ request: URLRequest) throws -> [String: Any] {
    let body = try bridgeRequestBodyData(request)
    let object = try JSONSerialization.jsonObject(with: body)
    return try #require(object as? [String: Any])
}

private func bridgeRequestBodyData(_ request: URLRequest) throws -> Data {
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
