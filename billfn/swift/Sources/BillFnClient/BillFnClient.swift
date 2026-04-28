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
        let trimmedPath = path.hasPrefix("/") ? String(path.dropFirst()) : path
        let parts = trimmedPath.split(separator: "?", maxSplits: 1, omittingEmptySubsequences: false)
        let pathPart = parts.first.map(String.init) ?? ""
        let queryPart = parts.count > 1 ? String(parts[1]) : nil

        guard var components = URLComponents(url: configuration.baseURL, resolvingAgainstBaseURL: false) else {
            throw BillFnClientError.invalidBaseURL
        }

        let basePath = components.path.hasSuffix("/") ? String(components.path.dropLast()) : components.path
        components.path = pathPart.isEmpty ? basePath : "\(basePath)/\(pathPart)"
        if let queryPart {
            components.percentEncodedQuery = queryPart
        }

        guard let url = components.url, url.scheme != nil else {
            throw BillFnClientError.invalidBaseURL
        }
        return url
    }

    public func makeRequest(path: String, method: String = "GET", body: Data? = nil, headers: [String: String]? = nil, accept: String? = nil) throws -> URLRequest {
        var request = URLRequest(url: try endpoint(path))
        request.httpMethod = method
        request.httpBody = body
        if body != nil {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        if let accept {
            request.setValue(accept, forHTTPHeaderField: "Accept")
        }
        headers?.forEach { key, value in
            request.setValue(value, forHTTPHeaderField: key)
        }
        return request
    }
}
