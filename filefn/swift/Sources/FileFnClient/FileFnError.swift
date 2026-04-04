import Foundation

public struct FileFnServerErrorPayload: Decodable, Sendable, Equatable {
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

    enum CodingKeys: String, CodingKey {
        case code
        case message
        case details
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        code = try container.decode(String.self, forKey: .code)
        message = try container.decode(String.self, forKey: .message)
        details = try container.decodeIfPresent([String: FileFnJSONValue].self, forKey: .details) ?? [:]
    }
}

public enum FileFnCapability: String, Sendable, Codable {
    case policies
    case quota
    case grants
    case shares
    case processing
}

public enum FileFnErrorClassifier {
    public static func classifyFailure(
        status: Int,
        requestId: String?,
        payload: FileFnServerErrorPayload?,
        contentType: String?,
        bodySnippet: String?,
        capability: FileFnCapability? = nil
    ) -> FileFnClientError {
        if let payload {
            return .server(status: status, payload: payload, requestId: requestId)
        }

        if let capability,
           [404, 405].contains(status),
           !(contentType?.lowercased().contains("application/json") ?? false) {
            return .capabilityUnavailable(capability, status: status, requestId: requestId)
        }

        return .transport(status: status, requestId: requestId, bodySnippet: bodySnippet)
    }
}

public enum FileFnClientError: Error, Sendable, Equatable {
    case configurationInvalid(field: String, message: String)
    case invalidResponse(reason: String, requestId: String?)
    case transport(status: Int?, requestId: String?, bodySnippet: String?)
    case server(status: Int, payload: FileFnServerErrorPayload, requestId: String?)
    case capabilityUnavailable(FileFnCapability, status: Int, requestId: String?)
    case fileAccess(reason: String)
    case preprocessingFailed(code: String, message: String)
    case backgroundStateCorrupt(uploadID: String, reason: String)
}
