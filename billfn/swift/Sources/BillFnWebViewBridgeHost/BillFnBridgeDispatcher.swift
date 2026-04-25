import BillFnClient
import BillFnStoreKit
import Foundation

public struct BillFnBridgeConfiguration: Sendable, Equatable {
    public let baseURL: String
    public let authOwner: String
    public let capabilities: [String]

    public init(baseURL: String, authOwner: String = "native", capabilities: [String] = ["billing", "entitlements", "usage", "checkout", "subscriptions", "purchases", "health", "events"]) {
        self.baseURL = baseURL
        self.authOwner = authOwner
        self.capabilities = capabilities
    }
}

public final class BillFnBridgeDispatcher: @unchecked Sendable {
    private let configuration: BillFnBridgeConfiguration

    public init(configuration: BillFnBridgeConfiguration) {
        self.configuration = configuration
    }

    public func handle(_ request: BillFnBridgeRequestEnvelope) -> BillFnBridgeResponseEnvelope {
        guard request.protocolVersion == BILLFN_BRIDGE_PROTOCOL else {
            return .failure(id: request.id, code: "BRIDGE_PROTOCOL_MISMATCH", message: "Bridge protocol version mismatch")
        }

        guard BILLFN_BRIDGE_METHODS.contains(request.method) else {
            return .failure(id: request.id, code: "BRIDGE_METHOD_UNSUPPORTED", message: "Unsupported bridge method")
        }

        switch request.method {
        case "handshake":
            return .success(id: request.id, result: [
                "bridgeVersion": .integer(1),
                "billingOwner": .string("native"),
                "authOwner": .string(configuration.authOwner),
                "baseURL": .string(configuration.baseURL),
                "capabilities": .array(configuration.capabilities.map(BillFnBridgeValue.string))
            ])
        case "subscription.manage":
            return .success(id: request.id, result: [
                "type": .string("manage-subscription"),
                "url": .string(BillFnStoreKit.manageSubscriptionsURL().absoluteString)
            ])
        case "health.check":
            return .success(id: request.id, result: ["status": .string("ok")])
        default:
            return .failure(id: request.id, code: "BRIDGE_METHOD_UNSUPPORTED", message: "Unsupported bridge method")
        }
    }

    public func readyEvent() -> BillFnBridgeEventEnvelope {
        BillFnBridgeEventEnvelope(event: "bridge.ready", payload: ["baseURL": .string(configuration.baseURL)])
    }
}
