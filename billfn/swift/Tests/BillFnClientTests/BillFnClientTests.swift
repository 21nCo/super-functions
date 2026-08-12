import BillFnClient
import Foundation
import Testing

@Suite("BillFn client")
struct BillFnClientTests {
    @Test("Builds endpoint URLs relative to the configured base URL")
    func buildsEndpointURLs() throws {
        let client = BillFnClient(
            configuration: BillFnClientConfiguration(
                baseURL: URL(string: "https://billfn.example.test/billfn")!
            )
        )

        let url = try client.endpoint("subscriptions/sync")
        #expect(url.absoluteString == "https://billfn.example.test/billfn/subscriptions/sync")
    }

    @Test("Preserves query strings when building endpoint URLs")
    func preservesEndpointQueries() throws {
        let client = BillFnClient(
            configuration: BillFnClientConfiguration(
                baseURL: URL(string: "https://billfn.example.test/billfn")!
            )
        )

        let url = try client.endpoint("ops/reconciliation/jobs?cursor=abc&limit=10")
        #expect(url.absoluteString == "https://billfn.example.test/billfn/ops/reconciliation/jobs?cursor=abc&limit=10")
    }

    @Test("Merges base and endpoint query strings")
    func mergesBaseAndEndpointQueries() throws {
        let client = BillFnClient(
            configuration: BillFnClientConfiguration(
                baseURL: URL(string: "https://billfn.example.test/billfn?workspace=main")!
            )
        )

        let url = try client.endpoint("ops/reconciliation/jobs?cursor=abc&limit=10")
        #expect(url.absoluteString == "https://billfn.example.test/billfn/ops/reconciliation/jobs?workspace=main&cursor=abc&limit=10")
    }

    @Test("Normalizes trailing base slashes and leading path slashes")
    func normalizesEndpointSlashes() throws {
        let client = BillFnClient(
            configuration: BillFnClientConfiguration(
                baseURL: URL(string: "https://billfn.example.test/billfn/")!
            )
        )

        let url = try client.endpoint("/subscriptions/sync")
        #expect(url.absoluteString == "https://billfn.example.test/billfn/subscriptions/sync")
    }

    @Test("Builds requests with optional body and headers")
    func buildsRequestsWithBodyAndHeaders() throws {
        let client = BillFnClient(
            configuration: BillFnClientConfiguration(
                baseURL: URL(string: "https://billfn.example.test/billfn?workspace=main")!
            )
        )
        let body = Data("{\"ok\":true}".utf8)

        let request = try client.makeRequest(
            path: "subscriptions/sync",
            method: "POST",
            body: body,
            headers: ["Authorization": "Bearer token"],
            accept: "application/json"
        )

        #expect(request.url?.absoluteString == "https://billfn.example.test/billfn/subscriptions/sync?workspace=main")
        #expect(request.httpBody == body)
        #expect(request.value(forHTTPHeaderField: "Content-Type") == "application/json")
        #expect(request.value(forHTTPHeaderField: "Accept") == "application/json")
        #expect(request.value(forHTTPHeaderField: "Authorization") == "Bearer token")
    }
}
