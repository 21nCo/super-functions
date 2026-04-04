@testable import FileFnClient
import Foundation
import Testing

final class FileFnMockURLProtocol: URLProtocol, @unchecked Sendable {
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

func makeFileFnTestClient(
    host: String,
    basePath: String = "/filefn",
    handler: @escaping @Sendable (URLRequest) throws -> (HTTPURLResponse, Data)
) throws -> FileFnClient {
    FileFnMockURLProtocol.register(host: host, handler: handler)

    let configuration = URLSessionConfiguration.ephemeral
    configuration.protocolClasses = [FileFnMockURLProtocol.self]

    return try FileFnClient(
        configuration: FileFnClientConfiguration(
            baseURL: URL(string: "https://\(host)\(basePath)")!,
            defaultHeaders: ["x-phase": "01"],
            requestIDProvider: { "req_swift_phase_01" },
            sendClientVersionHeader: false,
            urlSession: URLSession(configuration: configuration)
        )
    )
}

func makeJSONResponse(
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

struct FileFnFileRouteTests {
    @Test
    func listFilesDecodesSummariesAndPassesOpaqueCursor() async throws {
        let host = "file-routes-list.example.test"
        defer { FileFnMockURLProtocol.unregister(host: host) }

        let client = try makeFileFnTestClient(host: host) { request in
            #expect(request.httpMethod == "GET")
            #expect(request.value(forHTTPHeaderField: "x-phase") == "01")
            #expect(request.value(forHTTPHeaderField: "x-request-id") == "req_swift_phase_01")

            let components = URLComponents(url: try #require(request.url), resolvingAgainstBaseURL: false)
            #expect(components?.path == "/filefn/")
            #expect(components?.queryItems?.first(where: { $0.name == "cursor" })?.value == "cursor_opaque_001==")
            #expect(components?.queryItems?.first(where: { $0.name == "limit" })?.value == "2")

            return makeJSONResponse(
                request: request,
                status: 200,
                body: """
                {
                  "ok": true,
                  "data": {
                    "files": [
                      {
                        "fileId": "file_003",
                        "currentVersionId": "ver_003",
                        "ownerId": "user_123",
                        "tenantId": "org_123",
                        "visibility": "private",
                        "policy": "public-image",
                        "mimeType": "image/png",
                        "size": 123,
                        "name": "avatar.png",
                        "metadata": { "source": "ios" },
                        "createdAt": "2026-03-20T12:00:00.000Z",
                        "updatedAt": "2026-03-20T16:00:00.000Z"
                      }
                    ],
                    "nextCursor": "cursor_001"
                  },
                  "requestId": "req_file_001"
                }
                """
            )
        }

        let page = try await client.listFiles(cursor: "cursor_opaque_001==", limit: 2)

        #expect(page.files.count == 1)
        #expect(page.files[0].fileId == "file_003")
        #expect(page.files[0].policy == "public-image")
        #expect(page.files[0].metadata["source"] == .string("ios"))
        #expect(page.nextCursor == "cursor_001")
    }

    @Test
    func getFileAndDeleteFilePreserveCanonicalContract() async throws {
        let host = "file-routes-detail.example.test"
        defer { FileFnMockURLProtocol.unregister(host: host) }

        let client = try makeFileFnTestClient(host: host) { request in
            switch (request.httpMethod, request.url?.path) {
            case ("GET", "/filefn/file_003"):
                return makeJSONResponse(
                    request: request,
                    status: 200,
                    body: """
                    {
                      "ok": true,
                      "data": {
                        "fileId": "file_003",
                        "currentVersionId": "ver_003",
                        "ownerId": "user_123",
                        "tenantId": "org_123",
                        "visibility": "private",
                        "mimeType": "image/png",
                        "size": 123,
                        "name": "avatar.png",
                        "createdAt": "2026-03-20T12:00:00.000Z",
                        "updatedAt": "2026-03-20T16:00:00.000Z"
                      },
                      "requestId": "req_get_001"
                    }
                    """
                )
            case ("DELETE", "/filefn/file_003"):
                return makeJSONResponse(
                    request: request,
                    status: 200,
                    body: """
                    {
                      "ok": true,
                      "data": {
                        "deleted": true
                      },
                      "requestId": "req_delete_001"
                    }
                    """
                )
            default:
                Issue.record("Unexpected request: \(request.httpMethod ?? "nil") \(request.url?.absoluteString ?? "nil")")
                return makeJSONResponse(request: request, status: 500, body: #"{"ok":false,"error":{"code":"TEST_UNEXPECTED","message":"Unexpected request"}} "#)
            }
        }

        let file = try await client.getFile(fileId: "file_003")
        #expect(file.fileId == "file_003")
        #expect(file.mimeType == "image/png")
        #expect(file.name == "avatar.png")

        try await client.deleteFile(fileId: "file_003")
    }

    @Test
    func listVersionsAndGetVersionDecodeDistinctPayloads() async throws {
        let host = "file-routes-versions.example.test"
        defer { FileFnMockURLProtocol.unregister(host: host) }

        let client = try makeFileFnTestClient(host: host) { request in
            switch (request.httpMethod, request.url?.path) {
            case ("GET", "/filefn/file_003/versions"):
                return makeJSONResponse(
                    request: request,
                    status: 200,
                    body: """
                    {
                      "ok": true,
                      "data": {
                        "versions": [
                          {
                            "versionId": "ver_003",
                            "size": 123,
                            "mimeType": "image/png",
                            "createdAt": "2026-03-20T12:00:00.000Z"
                          }
                        ]
                      },
                      "requestId": "req_versions_001"
                    }
                    """
                )
            case ("GET", "/filefn/file_003/versions/ver_003"):
                return makeJSONResponse(
                    request: request,
                    status: 200,
                    body: """
                    {
                      "ok": true,
                      "data": {
                        "versionId": "ver_003",
                        "fileId": "file_003",
                        "size": 123,
                        "mimeType": "image/png",
                        "createdAt": "2026-03-20T12:00:00.000Z"
                      },
                      "requestId": "req_version_001"
                    }
                    """
                )
            default:
                Issue.record("Unexpected request: \(request.httpMethod ?? "nil") \(request.url?.absoluteString ?? "nil")")
                return makeJSONResponse(request: request, status: 500, body: #"{"ok":false,"error":{"code":"TEST_UNEXPECTED","message":"Unexpected request"}} "#)
            }
        }

        let versions = try await client.listVersions(fileId: "file_003")
        #expect(versions == [
            FileFnVersionSummary(
                versionId: "ver_003",
                size: 123,
                mimeType: "image/png",
                createdAt: "2026-03-20T12:00:00.000Z"
            ),
        ])

        let version = try await client.getVersion(fileId: "file_003", versionId: "ver_003")
        #expect(version.fileId == "file_003")
        #expect(version.versionId == "ver_003")
    }

    @Test
    func canonicalMissingFileErrorsSurfaceAsServerErrors() async throws {
        let host = "file-routes-missing.example.test"
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
                    "message": "File not found"
                  },
                  "requestId": "req_missing_001"
                }
                """
            )
        }

        await #expect(throws: FileFnClientError.server(
            status: 404,
            payload: FileFnServerErrorPayload(
                code: "FILEFN_NOT_FOUND",
                message: "File not found"
            ),
            requestId: "req_missing_001"
        )) {
            _ = try await client.getFile(fileId: "file_missing")
        }
    }
}
