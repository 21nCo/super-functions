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
    public let details: [String: BillFnBridgeValue]?

    public init(code: String, message: String, details: [String: BillFnBridgeValue]? = nil) {
        self.code = code
        self.message = message
        self.details = details
    }
}

public struct BillFnBridgeRequestEnvelope: Codable, Sendable, Equatable {
    public let protocolVersion: String
    public let id: String
    public let method: String
    public let payload: [String: BillFnBridgeValue]?

    enum CodingKeys: String, CodingKey {
        case protocolVersion = "protocol"
        case id
        case method
        case payload
    }

    public init(protocolVersion: String = BILLFN_BRIDGE_PROTOCOL, id: String, method: String, payload: [String: BillFnBridgeValue]? = nil) {
        self.protocolVersion = protocolVersion
        self.id = id
        self.method = method
        self.payload = payload
    }
}

public enum BillFnBridgeValue: Codable, Sendable, Equatable {
    case string(String)
    case integer(Int)
    case double(Double)
    case bool(Bool)
    case array([BillFnBridgeValue])
    case object([String: BillFnBridgeValue])
    case null

    public init(from decoder: any Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() {
            self = .null
        } else if let bool = try? container.decode(Bool.self) {
            self = .bool(bool)
        } else if let integer = try? container.decode(Int.self) {
            self = .integer(integer)
        } else if let double = try? container.decode(Double.self) {
            self = .double(double)
        } else if let string = try? container.decode(String.self) {
            self = .string(string)
        } else if let array = try? container.decode([BillFnBridgeValue].self) {
            self = .array(array)
        } else if let object = try? container.decode([String: BillFnBridgeValue].self) {
            self = .object(object)
        } else {
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Unsupported bridge JSON value")
        }
    }

    public func encode(to encoder: any Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .string(let value):
            try container.encode(value)
        case .integer(let value):
            try container.encode(value)
        case .double(let value):
            try container.encode(value)
        case .bool(let value):
            try container.encode(value)
        case .array(let value):
            try container.encode(value)
        case .object(let value):
            try container.encode(value)
        case .null:
            try container.encodeNil()
        }
    }
}

public struct BillFnBridgeResponseEnvelope: Codable, Sendable, Equatable {
    public let protocolVersion: String
    public let id: String
    public let ok: Bool
    public let result: [String: BillFnBridgeValue]?
    public let error: BillFnBridgeError?

    enum CodingKeys: String, CodingKey {
        case protocolVersion = "protocol"
        case id
        case ok
        case result
        case error
    }

    public init(protocolVersion: String = BILLFN_BRIDGE_PROTOCOL, id: String, ok: Bool, result: [String: BillFnBridgeValue]? = nil, error: BillFnBridgeError? = nil) {
        self.protocolVersion = protocolVersion
        self.id = id
        self.ok = ok
        self.result = result
        self.error = error
    }

    public static func success(id: String, result: [String: BillFnBridgeValue] = [:]) -> Self {
        Self(id: id, ok: true, result: result, error: nil)
    }

    public static func failure(id: String, code: String, message: String) -> Self {
        Self(id: id, ok: false, result: nil, error: BillFnBridgeError(code: code, message: message))
    }
}

public struct BillFnBridgeEventEnvelope: Codable, Sendable, Equatable {
    public let protocolVersion: String
    public let event: String
    public let payload: [String: BillFnBridgeValue]

    enum CodingKeys: String, CodingKey {
        case protocolVersion = "protocol"
        case event
        case payload
    }

    public init(protocolVersion: String = BILLFN_BRIDGE_PROTOCOL, event: String, payload: [String: BillFnBridgeValue] = [:]) {
        self.protocolVersion = protocolVersion
        self.event = event
        self.payload = payload
    }
}
