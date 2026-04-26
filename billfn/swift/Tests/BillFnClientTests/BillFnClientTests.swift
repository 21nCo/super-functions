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
}
