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
        #expect(response.result?["capabilities"] == .array([
            .string("subscription.manage"),
            .string("health.check"),
        ]))
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

    @Test("Dispatcher rejects protocol mismatches")
    func protocolMismatchFails() throws {
        let dispatcher = BillFnBridgeDispatcher(
            configuration: BillFnBridgeConfiguration(baseURL: "https://billfn.example.test/billfn")
        )

        let response = dispatcher.handle(
            BillFnBridgeRequestEnvelope(protocolVersion: "billfn-bridge/v0", id: "req_4", method: "handshake")
        )

        #expect(!response.ok)
        #expect(response.error?.code == "BRIDGE_PROTOCOL_MISMATCH")
    }

    @Test("Dispatcher rejects unsupported methods")
    func unsupportedMethodFails() throws {
        let dispatcher = BillFnBridgeDispatcher(
            configuration: BillFnBridgeConfiguration(baseURL: "https://billfn.example.test/billfn")
        )

        let response = dispatcher.handle(
            BillFnBridgeRequestEnvelope(id: "req_5", method: "billing.unknown")
        )

        #expect(!response.ok)
        #expect(response.error?.code == "BRIDGE_METHOD_UNSUPPORTED")
    }

    @Test("Bridge errors preserve JSON details")
    func bridgeErrorsPreserveJsonDetails() throws {
        let envelope = BillFnBridgeResponseEnvelope(
            id: "req_6",
            ok: false,
            error: BillFnBridgeError(code: "BRIDGE_UNAVAILABLE", message: "Unavailable", details: [
                "retryAfter": .integer(30),
                "transient": .bool(true),
                "context": .object(["phase": .string("postMessage")]),
            ])
        )
        let encoded = try JSONEncoder().encode(envelope)
        let decoded = try JSONDecoder().decode(BillFnBridgeResponseEnvelope.self, from: encoded)

        #expect(decoded.error?.details?["retryAfter"] == .integer(30))
        #expect(decoded.error?.details?["transient"] == .bool(true))
        #expect(decoded.error?.details?["context"] == .object(["phase": .string("postMessage")]))
    }

    @Test("Bridge errors decode when details are omitted")
    func bridgeErrorsAllowMissingDetails() throws {
        let data = Data(#"{"protocol":"billfn-bridge/v1","id":"req_7","ok":false,"error":{"code":"BRIDGE_UNAVAILABLE","message":"Unavailable"}}"#.utf8)
        let decoded = try JSONDecoder().decode(BillFnBridgeResponseEnvelope.self, from: data)

        #expect(decoded.error?.code == "BRIDGE_UNAVAILABLE")
        #expect(decoded.error?.details == nil)
    }
}
