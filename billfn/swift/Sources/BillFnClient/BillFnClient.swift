import Foundation

public struct BillFnClientConfiguration: Sendable, Equatable {
    public var baseURL: URL
    public var session: URLSession

    public init(baseURL: URL, session: URLSession = .shared) {
        self.baseURL = baseURL
        self.session = session
    }
}

public struct BillFnOperationAction: Codable, Sendable, Equatable {
    public let type: String
    public let url: String?
    public let metadata: [String: String]?

    public init(type: String, url: String? = nil, metadata: [String: String]? = nil) {
        self.type = type
        self.url = url
        self.metadata = metadata
    }
}

public enum BillFnClientError: Error, Equatable {
    case invalidBaseURL
    case invalidResponse
}

public final class BillFnClient: @unchecked Sendable {
    public let configuration: BillFnClientConfiguration

    public init(configuration: BillFnClientConfiguration) {
        self.configuration = configuration
    }

    public func endpoint(_ path: String) throws -> URL {
        guard let url = URL(string: path, relativeTo: configuration.baseURL) else {
            throw BillFnClientError.invalidBaseURL
        }
        return url
    }

    public func makeRequest(path: String, method: String = "GET") throws -> URLRequest {
        var request = URLRequest(url: try endpoint(path))
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        return request
    }
}
