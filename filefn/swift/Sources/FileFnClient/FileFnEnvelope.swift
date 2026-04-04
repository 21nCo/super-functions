import Foundation

public struct FileFnEnvelope<Value: Decodable & Sendable>: Decodable, Sendable {
    public let ok: Bool
    public let data: Value?
    public let error: FileFnServerErrorPayload?
    public let warnings: [String]
    public let requestId: String?

    enum CodingKeys: String, CodingKey {
        case ok
        case data
        case error
        case warnings
        case requestId
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        ok = try container.decode(Bool.self, forKey: .ok)
        data = try container.decodeIfPresent(Value.self, forKey: .data)
        error = try container.decodeIfPresent(FileFnServerErrorPayload.self, forKey: .error)
        warnings = try container.decodeIfPresent([String].self, forKey: .warnings) ?? []
        requestId = try container.decodeIfPresent(String.self, forKey: .requestId)
    }

    public func validatedValue() throws -> Value {
        if ok {
            guard let data else {
                throw FileFnClientError.invalidResponse(
                    reason: "Successful envelope is missing data",
                    requestId: requestId
                )
            }
            return data
        }

        if error == nil {
            throw FileFnClientError.invalidResponse(
                reason: "Error envelope is missing error payload",
                requestId: requestId
            )
        }

        throw FileFnClientError.invalidResponse(
            reason: "Cannot extract success value from an error envelope",
            requestId: requestId
        )
    }
}
