import BillFnWebViewBridgeHost
import Foundation
import Testing

@Suite("BillFn WebView bridge host")
struct BillFnWebViewBridgeHostTests {
    @Test("Handshake returns the native bridge contract")
    func handshakeSucceeds() throws {
        let dispatcher = BillFnBridgeDispatcher(
            configuration: BillFnBridgeConfiguration(baseURL: "https://billfn.example.test/billfn")
        )

        let response = dispatcher.handle(
            BillFnBridgeRequestEnvelope(id: "req_1", method: "handshake", payload: [
                "clientId": "client_1",
                "mode": "native-backed",
                "baseURL": "https://billfn.example.test/billfn",
            ])
        )

        #expect(response.ok)
        #expect(response.result?["bridgeVersion"] == "1")
        #expect(response.result?["billingOwner"] == "native")
    }

    @Test("Subscription manage routes to the Apple-managed URL")
    func manageSubscriptionReturnsManageURL() throws {
        let dispatcher = BillFnBridgeDispatcher(
            configuration: BillFnBridgeConfiguration(baseURL: "https://billfn.example.test/billfn")
        )

        let response = dispatcher.handle(
            BillFnBridgeRequestEnvelope(id: "req_2", method: "subscription.manage")
        )

        #expect(response.ok)
        #expect(response.result?["type"] == "manage-subscription")
        #expect(response.result?["url"] == "https://apps.apple.com/account/subscriptions")
    }
}
