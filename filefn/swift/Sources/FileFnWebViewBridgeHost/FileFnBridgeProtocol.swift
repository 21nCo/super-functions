import FileFnClient
import Foundation

public let FILEFN_BRIDGE_PROTOCOL = "filefn-bridge/v1"

public let FILEFN_BRIDGE_CAPABILITIES: [String] = [
    "files",
    "uploads",
    "render",
    "shares",
    "grants",
    "processing",
    "events",
    "health",
]

public let FILEFN_BRIDGE_METHODS: [String] = [
    "handshake",
    "file.list",
    "file.get",
    "file.delete",
    "version.list",
    "version.get",
    "download.resolve",
    "artifact.list",
    "artifact.download",
    "render.resolve",
    "policy.list",
    "quota.get",
    "grant.create",
    "grant.list",
    "grant.revoke",
    "share.create",
    "share.list",
    "share.revoke",
    "share.download.resolve",
    "processing.trigger",
    "upload.start",
    "upload.status",
    "upload.abort",
    "health.check",
]

public let FILEFN_BRIDGE_EVENT_NAMES: [String] = [
    "bridge.ready",
    "bridge.closed",
    "upload.progress",
    "upload.completed",
    "upload.failed",
    "upload.cancelled",
    "health.changed",
]

public let FILEFN_BRIDGE_ERROR_CODES: [String] = [
    "BRIDGE_PROTOCOL_MISMATCH",
    "BRIDGE_METHOD_UNSUPPORTED",
    "BRIDGE_UNAVAILABLE",
    "BRIDGE_HANDSHAKE_REQUIRED",
    "BRIDGE_INVALID_SOURCE",
    "NATIVE_ASSET_NOT_FOUND",
    "BRIDGE_UPLOAD_NOT_FOUND",
    "BRIDGE_INVALID_REQUEST",
    "FILEFN_CLIENT_ERROR",
    "FILEFN_CAPABILITY_UNAVAILABLE",
]

public struct FileFnBridgeError: Codable, Sendable, Equatable, Error {
    public let code: String
    public let message: String
    public let details: [String: FileFnJSONValue]

    public init(
        code: String,
        message: String,
        details: [String: FileFnJSONValue] = [:]
    ) {
        self.code = code
        self.message = message
        self.details = details
    }
}

public struct FileFnBridgeRequestEnvelope: Codable, Sendable, Equatable {
    public let protocolVersion: String
    public let id: String
    public let method: String
    public let payload: FileFnJSONValue?

    enum CodingKeys: String, CodingKey {
        case protocolVersion = "protocol"
        case id
        case method
        case payload
    }

    public init(
        protocolVersion: String = FILEFN_BRIDGE_PROTOCOL,
        id: String,
        method: String,
        payload: FileFnJSONValue? = nil
    ) {
        self.protocolVersion = protocolVersion
        self.id = id
        self.method = method
        self.payload = payload
    }
}

public struct FileFnBridgeResponseEnvelope: Codable, Sendable, Equatable {
    public let protocolVersion: String
    public let id: String
    public let ok: Bool
    public let result: FileFnJSONValue?
    public let error: FileFnBridgeError?

    enum CodingKeys: String, CodingKey {
        case protocolVersion = "protocol"
        case id
        case ok
        case result
        case error
    }

    public init(
        protocolVersion: String = FILEFN_BRIDGE_PROTOCOL,
        id: String,
        ok: Bool,
        result: FileFnJSONValue? = nil,
        error: FileFnBridgeError? = nil
    ) {
        self.protocolVersion = protocolVersion
        self.id = id
        self.ok = ok
        self.result = result
        self.error = error
    }

    public static func success(id: String, result: FileFnJSONValue = .null) -> Self {
        Self(id: id, ok: true, result: result, error: nil)
    }

    public static func failure(id: String, error: FileFnBridgeError) -> Self {
        Self(id: id, ok: false, result: nil, error: fileFnBridgeSanitize(error))
    }
}

public struct FileFnBridgeEventEnvelope: Codable, Sendable, Equatable {
    public let protocolVersion: String
    public let event: String
    public let payload: FileFnJSONValue

    enum CodingKeys: String, CodingKey {
        case protocolVersion = "protocol"
        case event
        case payload
    }

    public init(
        protocolVersion: String = FILEFN_BRIDGE_PROTOCOL,
        event: String,
        payload: FileFnJSONValue = .object([:])
    ) {
        self.protocolVersion = protocolVersion
        self.event = event
        self.payload = payload
    }
}

public struct FileFnBridgeHandshakePayload: Codable, Sendable, Equatable {
    public let clientId: String
    public let mode: String
    public let baseURL: String
}

public struct FileFnBridgeHandshakeResult: Codable, Sendable, Equatable {
    public let bridgeVersion: Int
    public let uploadOwner: String
    public let authOwner: String
    public let previewScheme: String
    public let capabilities: [String]
}

public struct FileFnBridgeUploadStartPayload: Codable, Sendable, Equatable {
    public let policy: String
    public let assetHandle: String?
    public let background: Bool
    public let fileId: String?
    public let idempotencyKey: String?
    public let metadata: [String: FileFnJSONValue]?

    public init(
        policy: String,
        assetHandle: String?,
        background: Bool = true,
        fileId: String? = nil,
        idempotencyKey: String? = nil,
        metadata: [String: FileFnJSONValue]? = nil
    ) {
        self.policy = policy
        self.assetHandle = assetHandle
        self.background = background
        self.fileId = fileId
        self.idempotencyKey = idempotencyKey
        self.metadata = metadata
    }

    enum CodingKeys: String, CodingKey {
        case policy
        case assetHandle
        case background
        case fileId
        case idempotencyKey
        case metadata
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        policy = try container.decode(String.self, forKey: .policy)
        assetHandle = try container.decodeIfPresent(String.self, forKey: .assetHandle)
        background = try container.decodeIfPresent(Bool.self, forKey: .background) ?? true
        fileId = try container.decodeIfPresent(String.self, forKey: .fileId)
        idempotencyKey = try container.decodeIfPresent(String.self, forKey: .idempotencyKey)
        metadata = try container.decodeIfPresent([String: FileFnJSONValue].self, forKey: .metadata)
    }
}

public struct FileFnBridgeUploadStartResult: Codable, Sendable, Equatable {
    public let uploadID: String
    public let fileId: String
}

public struct FileFnBridgeUploadStatusPayload: Codable, Sendable, Equatable {
    public let uploadID: String
}

public struct FileFnBridgeCompletedUpload: Codable, Sendable, Equatable {
    public let fileId: String
    public let versionId: String

    public init(fileId: String, versionId: String) {
        self.fileId = fileId
        self.versionId = versionId
    }

    public init(_ upload: FileFnCompletedUpload) {
        self.init(fileId: upload.fileId, versionId: upload.versionId)
    }
}

public struct FileFnBridgeUploadStatusResult: Codable, Sendable, Equatable {
    public let uploadID: String
    public let fileId: String
    public let state: String
    public let bytesSent: Int64
    public let bytesExpected: Int64
    public let background: Bool
    public let result: FileFnBridgeCompletedUpload?
    public let error: FileFnBridgeError?
}

public struct FileFnBridgeUploadAbortPayload: Codable, Sendable, Equatable {
    public let uploadID: String
}

public struct FileFnBridgeUploadAbortResult: Codable, Sendable, Equatable {
    public let uploadID: String
    public let aborted: Bool
}

public struct FileFnBridgePreviewDescriptor: Codable, Sendable, Equatable {
    public let previewURL: URL
}

public func isFileFnBridgeMethod(_ method: String) -> Bool {
    FILEFN_BRIDGE_METHODS.contains(method)
}

public func isFileFnBridgeEventName(_ event: String) -> Bool {
    FILEFN_BRIDGE_EVENT_NAMES.contains(event)
}

func fileFnBridgeDecodeRequestEnvelope(from rawMessage: Any) throws -> FileFnBridgeRequestEnvelope {
    guard JSONSerialization.isValidJSONObject(rawMessage) else {
        throw FileFnBridgeError(code: "BRIDGE_INVALID_REQUEST", message: "Bridge request is not valid JSON")
    }
    let data = try JSONSerialization.data(withJSONObject: rawMessage)
    return try JSONDecoder().decode(FileFnBridgeRequestEnvelope.self, from: data)
}

func fileFnBridgeDecodePayload<T: Decodable>(_ payload: FileFnJSONValue?, as type: T.Type) throws -> T {
    let value = payload ?? .object([:])
    let data = try JSONEncoder().encode(value)
    return try JSONDecoder().decode(type, from: data)
}

func fileFnBridgeEncodeResult<T: Encodable>(_ value: T) throws -> FileFnJSONValue {
    let data = try JSONEncoder().encode(value)
    return try JSONDecoder().decode(FileFnJSONValue.self, from: data)
}

func fileFnBridgeFoundationObject<T: Encodable>(from value: T) throws -> Any {
    let data = try JSONEncoder().encode(value)
    return try JSONSerialization.jsonObject(with: data)
}

func fileFnBridgeReceiveInvocation(for jsonObject: Any) throws -> String {
    let data = try JSONSerialization.data(withJSONObject: jsonObject)
    guard let json = String(data: data, encoding: .utf8) else {
        throw FileFnBridgeError(
            code: "BRIDGE_INVALID_REQUEST",
            message: "Failed to encode bridge response"
        )
    }
    return "window.__filefnBridgeReceive__(\(json));"
}

func fileFnBridgeFailure(
    id: String,
    code: String,
    message: String,
    details: [String: FileFnJSONValue] = [:]
) -> FileFnBridgeResponseEnvelope {
    .failure(
        id: id,
        error: FileFnBridgeError(code: code, message: message, details: details)
    )
}

func fileFnBridgeSanitize(_ value: FileFnJSONValue) -> FileFnJSONValue {
    switch value {
    case .string(let stringValue):
        return .string(fileFnBridgeSanitizeString(stringValue))
    case .number, .bool, .null:
        return value
    case .array(let values):
        return .array(values.map(fileFnBridgeSanitize))
    case .object(let object):
        var sanitized: [String: FileFnJSONValue] = [:]
        for (key, nestedValue) in object {
            sanitized[key] = fileFnBridgeSanitizeEntry(key: key, value: nestedValue)
        }
        return .object(sanitized)
    }
}

func fileFnBridgeSanitize(_ error: FileFnBridgeError) -> FileFnBridgeError {
    FileFnBridgeError(
        code: error.code,
        message: fileFnBridgeSanitizeErrorMessage(error.message),
        details: Dictionary(uniqueKeysWithValues: error.details.map { key, value in
            (key, fileFnBridgeSanitizeEntry(key: key, value: value))
        })
    )
}

private func fileFnBridgeSanitizeEntry(key: String, value: FileFnJSONValue) -> FileFnJSONValue {
    let normalizedKey = key
        .replacingOccurrences(of: "_", with: "")
        .replacingOccurrences(of: "-", with: "")
        .lowercased()
    if fileFnBridgeIsSecretKey(normalizedKey) {
        return .string("[REDACTED]")
    }

    switch value {
    case .string(let stringValue):
        return .string(fileFnBridgeSanitizeString(stringValue))
    case .number, .bool, .null:
        return value
    case .array(let values):
        return .array(values.map { fileFnBridgeSanitizeEntry(key: key, value: $0) })
    case .object(let object):
        var sanitized: [String: FileFnJSONValue] = [:]
        for (nestedKey, nestedValue) in object {
            sanitized[nestedKey] = fileFnBridgeSanitizeEntry(key: nestedKey, value: nestedValue)
        }
        return .object(sanitized)
    }
}

private func fileFnBridgeIsSecretKey(_ normalizedKey: String) -> Bool {
    normalizedKey.hasSuffix("authorization") || normalizedKey.contains("uploadsessiontoken")
}

private func fileFnBridgeSanitizeString(_ value: String) -> String {
    if let url = URL(string: value), url.scheme != nil {
        if url.scheme == "file" {
            let baseName = URL(fileURLWithPath: url.path).lastPathComponent
            return url.query != nil ? "\(baseName)?[REDACTED_QUERY]" : baseName
        }
        if url.query != nil {
            let prefix = value.components(separatedBy: "?").first ?? value
            return "\(prefix)?[REDACTED_QUERY]"
        }
        return value
    }

    if value.hasPrefix("/") {
        return URL(fileURLWithPath: value).lastPathComponent
    }

    return value
}

private func fileFnBridgeSanitizeErrorMessage(_ value: String) -> String {
    let sanitized = fileFnBridgeSanitizeString(value)
    if sanitized != value {
        return sanitized
    }

    let lowercased = value.lowercased()
    if lowercased.contains("file://")
        || lowercased.contains("/private/")
        || lowercased.contains("x-amz-signature=")
        || lowercased.contains("upload-session-token")
        || lowercased.contains("uploadsessiontoken")
        || lowercased.contains("authorization")
    {
        return "Sensitive bridge error redacted"
    }

    return value
}
