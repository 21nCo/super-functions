import Foundation

public enum FileFnLogLevel: String, Sendable {
    case debug
    case info
    case warning
    case error
}

public struct FileFnLogEvent: Sendable, Equatable {
    public let level: FileFnLogLevel
    public let message: String
    public let requestId: String?
    public let uploadID: String?
    public let metadata: [String: FileFnJSONValue]

    public init(
        level: FileFnLogLevel,
        message: String,
        requestId: String? = nil,
        uploadID: String? = nil,
        metadata: [String: FileFnJSONValue] = [:]
    ) {
        self.level = level
        self.message = message
        self.requestId = requestId
        self.uploadID = uploadID
        self.metadata = metadata
    }

    public func redacted() -> FileFnLogEvent {
        FileFnLogEvent(
            level: level,
            message: message,
            requestId: requestId,
            uploadID: uploadID,
            metadata: fileFnRedactMetadata(metadata)
        )
    }
}

public protocol FileFnLogger: Sendable {
    func log(_ event: FileFnLogEvent)
}

private let fileFnRedactedKeys: Set<String> = [
    "authorization",
    "x-upload-session-token",
    "uploadsessiontoken",
]

func fileFnRedactMetadata(_ metadata: [String: FileFnJSONValue]) -> [String: FileFnJSONValue] {
    Dictionary(uniqueKeysWithValues: metadata.map { key, value in
        (key, fileFnRedactValue(key: key, value: value))
    })
}

private func fileFnRedactValue(key: String, value: FileFnJSONValue) -> FileFnJSONValue {
    let normalizedKey = key.replacingOccurrences(of: "_", with: "").lowercased()
    if fileFnRedactedKeys.contains(normalizedKey) {
        return .string("[REDACTED]")
    }

    switch value {
    case .string(let stringValue):
        return .string(fileFnRedactString(for: key, value: stringValue))
    case .array(let values):
        return .array(values.map { fileFnRedactValue(key: key, value: $0) })
    case .object(let object):
        return .object(fileFnRedactMetadata(object))
    default:
        return value
    }
}

private func fileFnRedactString(for key: String, value: String) -> String {
    let normalizedKey = key.lowercased()
    if fileFnRedactedKeys.contains(normalizedKey.replacingOccurrences(of: "_", with: "")) {
        return "[REDACTED]"
    }

    if let url = URL(string: value), url.scheme != nil {
        if url.scheme == "file" {
            let baseName = URL(fileURLWithPath: url.path).lastPathComponent
            return url.query != nil ? "\(baseName)?[REDACTED_QUERY]" : baseName
        }

        if url.query != nil {
            let separator = value.contains("?") ? "?" : ""
            return "\(value.components(separatedBy: "?").first ?? value)\(separator)[REDACTED_QUERY]"
        }
    }

    if value.hasPrefix("/") {
        return URL(fileURLWithPath: value).lastPathComponent
    }

    return value
}
