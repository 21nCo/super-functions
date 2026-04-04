@testable import FileFnClient
import Foundation
import Testing

private struct HeaderAuthProvider: FileFnAuthProvider {
    let headersToReturn: [String: String]

    init(_ headersToReturn: [String: String]) {
        self.headersToReturn = headersToReturn
    }

    func headers(for _: FileFnAuthContext) async throws -> [String: String] {
        headersToReturn
    }
}

struct FileFnConfigurationTests {
    @Test
    func relativeBaseURLIsRejected() {
        let configuration = FileFnClientConfiguration(baseURL: URL(string: "/relative")!)

        do {
            _ = try FileFnClient(configuration: configuration)
            Issue.record("Expected configuration validation to fail")
        } catch {
            #expect(
                error as? FileFnClientError ==
                .configurationInvalid(field: "baseURL", message: "baseURL must be an absolute URL")
            )
        }
    }

    @Test
    func requestBuildNormalizesBaseURLAndInjectsHeaders() async throws {
        let configuration = FileFnClientConfiguration(
            baseURL: URL(string: "https://api.example.test/filefn/")!,
            authProvider: HeaderAuthProvider(["Authorization": "Bearer abc"]),
            defaultHeaders: ["x-extra": "1"],
            retryPolicy: .default,
            requestIDProvider: { "req_swift_001" },
            logger: nil,
            sendClientVersionHeader: true
        )

        let client = try FileFnClient(configuration: configuration)
        let request = try await client.makeRequest(
            method: "GET",
            path: "/",
            query: ["limit": "2"],
            requiresUploadSessionToken: false
        )

        #expect(request.url?.absoluteString == "https://api.example.test/filefn/?limit=2")
        #expect(request.value(forHTTPHeaderField: "Authorization") == "Bearer abc")
        #expect(request.value(forHTTPHeaderField: "x-extra") == "1")
        #expect(request.value(forHTTPHeaderField: "x-request-id") == "req_swift_001")
        #expect(request.value(forHTTPHeaderField: "Content-Type") == "application/json")
        #expect(request.value(forHTTPHeaderField: "x-filefn-client-version") == "filefn-swift/0.0.1")
    }

    @Test
    func uploadInitRetryRequiresIdempotencyKey() {
        let policy = FileFnRetryPolicy.default
        #expect(policy.shouldRetry(method: "POST", path: "/upload/init", hasIdempotencyKey: false) == false)
        #expect(policy.shouldRetry(method: "POST", path: "/upload/init", hasIdempotencyKey: true) == true)
    }

    @Test
    func retryableGetRequestsRetryOnTransientFailures() async throws {
        let host = "config-retry.example.test"
        defer { FileFnMockURLProtocol.unregister(host: host) }

        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [FileFnMockURLProtocol.self]

        let attempts = LockedCounter()
        FileFnMockURLProtocol.register(host: host) { request in
            let attempt = attempts.incrementAndLoad()
            if attempt == 1 {
                return makeJSONResponse(
                    request: request,
                    status: 503,
                    body: """
                    {
                      "ok": false,
                      "error": {
                        "code": "FILEFN_TEMPORARY_UNAVAILABLE",
                        "message": "Try again"
                      }
                    }
                    """
                )
            }

            return makeJSONResponse(
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
        }

        let client = try FileFnClient(
            configuration: FileFnClientConfiguration(
                baseURL: URL(string: "https://\(host)/filefn")!,
                retryPolicy: FileFnRetryPolicy(maxAttempts: 2, baseDelayMilliseconds: 0, maxDelayMilliseconds: 0),
                sendClientVersionHeader: false,
                urlSession: URLSession(configuration: configuration)
            )
        )

        let file = try await client.getFile(fileId: "file_001")
        #expect(file.fileId == "file_001")
        #expect(attempts.load() == 2)
    }
}

private final class LockedCounter: @unchecked Sendable {
    private let lock = NSLock()
    private var value = 0

    func incrementAndLoad() -> Int {
        lock.lock()
        defer { lock.unlock() }
        value += 1
        return value
    }

    func load() -> Int {
        lock.lock()
        defer { lock.unlock() }
        return value
    }
}
