import Foundation

public struct FileFnDownloadDescriptor: Codable, Sendable, Equatable {
    public let url: URL
    public let headers: [String: String]

    enum CodingKeys: String, CodingKey {
        case url
        case headers
    }

    public init(url: URL, headers: [String: String] = [:]) {
        self.url = url
        self.headers = headers
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        url = try container.decode(URL.self, forKey: .url)
        headers = try container.decodeIfPresent([String: String].self, forKey: .headers) ?? [:]
    }
}

extension FileFnDownloadDescriptor {
    func resolved(against baseURL: URL, requestId: String?) throws -> Self {
        Self(
            url: try fileFnResolveURL(url, against: baseURL, requestId: requestId),
            headers: headers
        )
    }
}
