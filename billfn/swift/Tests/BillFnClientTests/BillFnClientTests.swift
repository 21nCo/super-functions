import BillFnClient
import Foundation
import Testing

@Suite("BillFn client")
struct BillFnClientTests {
    @Test("Builds endpoint URLs relative to the configured base URL")
    func buildsEndpointURLs() throws {
        let client = BillFnClient(
            configuration: BillFnClientConfiguration(
                baseURL: URL(string: "https://billfn.example.test/billfn/")!
            )
        )

        let url = try client.endpoint("subscriptions/sync")
        #expect(url.absoluteString == "https://billfn.example.test/billfn/subscriptions/sync")
    }
}
