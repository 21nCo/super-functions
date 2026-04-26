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
                "clientId": .string("client_1"),
                "mode": .string("native-backed"),
                "baseURL": .string("https://billfn.example.test/billfn"),
            ])
        )

        #expect(response.ok)
        #expect(response.result?["bridgeVersion"] == .integer(1))
        #expect(response.result?["billingOwner"] == .string("native"))
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
        #expect(response.result?["type"] == .string("manage-subscription"))
        #expect(response.result?["url"] == .string("https://apps.apple.com/account/subscriptions"))
    }

    @Test("Bridge values round-trip fractional numbers")
    func bridgeValuesSupportFractionalNumbers() throws {
        let envelope = BillFnBridgeResponseEnvelope.success(id: "req_3", result: [
            "usage": .double(12.5),
            "active": .bool(true),
        ])
        let encoded = try JSONEncoder().encode(envelope)
        let decoded = try JSONDecoder().decode(BillFnBridgeResponseEnvelope.self, from: encoded)

        #expect(decoded.result?["usage"] == .double(12.5))
        #expect(decoded.result?["active"] == .bool(true))
    }
}
