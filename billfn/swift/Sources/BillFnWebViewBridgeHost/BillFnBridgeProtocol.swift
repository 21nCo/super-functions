import Foundation

public let BILLFN_BRIDGE_PROTOCOL = "billfn-bridge/v1"

public let BILLFN_BRIDGE_METHODS: [String] = [
    "handshake",
    "billing.status",
    "entitlements.get",
    "usage.get",
    "checkout.create",
    "checkout.verify",
    "purchase.restore",
    "subscription.sync",
    "subscription.cancel",
    "subscription.change",
    "subscription.resume",
    "subscription.manage",
    "health.check",
]

public let BILLFN_BRIDGE_EVENT_NAMES: [String] = [
    "bridge.ready",
    "bridge.closed",
    "subscription.changed",
    "entitlements.changed",
    "health.changed",
]

public struct BillFnBridgeError: Codable, Sendable, Equatable, Error {
    public let code: String
    public let message: String
    public let details: [String: String]

    public init(code: String, message: String, details: [String: String] = [:]) {
        self.code = code
        self.message = message
        self.details = details
    }
}

public struct BillFnBridgeRequestEnvelope: Codable, Sendable, Equatable {
    public let protocolVersion: String
    public let id: String
    public let method: String
    public let payload: [String: String]?

    enum CodingKeys: String, CodingKey {
        case protocolVersion = "protocol"
        case id
        case method
        case payload
    }

    public init(protocolVersion: String = BILLFN_BRIDGE_PROTOCOL, id: String, method: String, payload: [String: String]? = nil) {
        self.protocolVersion = protocolVersion
        self.id = id
        self.method = method
        self.payload = payload
    }
}

public struct BillFnBridgeResponseEnvelope: Codable, Sendable, Equatable {
    public let protocolVersion: String
    public let id: String
    public let ok: Bool
    public let result: [String: String]?
    public let error: BillFnBridgeError?

    enum CodingKeys: String, CodingKey {
        case protocolVersion = "protocol"
        case id
        case ok
        case result
        case error
    }

    public init(protocolVersion: String = BILLFN_BRIDGE_PROTOCOL, id: String, ok: Bool, result: [String: String]? = nil, error: BillFnBridgeError? = nil) {
        self.protocolVersion = protocolVersion
        self.id = id
        self.ok = ok
        self.result = result
        self.error = error
    }

    public static func success(id: String, result: [String: String] = [:]) -> Self {
        Self(id: id, ok: true, result: result, error: nil)
    }

    public static func failure(id: String, code: String, message: String) -> Self {
        Self(id: id, ok: false, result: nil, error: BillFnBridgeError(code: code, message: message))
    }
}

public struct BillFnBridgeEventEnvelope: Codable, Sendable, Equatable {
    public let protocolVersion: String
    public let event: String
    public let payload: [String: String]

    enum CodingKeys: String, CodingKey {
        case protocolVersion = "protocol"
        case event
        case payload
    }

    public init(protocolVersion: String = BILLFN_BRIDGE_PROTOCOL, event: String, payload: [String: String] = [:]) {
        self.protocolVersion = protocolVersion
        self.event = event
        self.payload = payload
    }
}
