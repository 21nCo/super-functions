import Foundation

public struct FileFnCreateShareLinkRequest: Codable, Sendable, Equatable {
    public var versionId: String?
    public var expiresAt: String?
    public var requiresAuth: Bool?
    public var maxDownloads: Int?

    public init(
        versionId: String? = nil,
        expiresAt: String? = nil,
        requiresAuth: Bool? = nil,
        maxDownloads: Int? = nil
    ) {
        self.versionId = versionId
        self.expiresAt = expiresAt
        self.requiresAuth = requiresAuth
        self.maxDownloads = maxDownloads
    }
}

public struct FileFnShareLink: Codable, Sendable, Equatable {
    public let token: String
    public let expiresAt: String?

    public init(token: String, expiresAt: String?) {
        self.token = token
        self.expiresAt = expiresAt
    }
}

public struct FileFnShareLinkSummary: Codable, Sendable, Equatable {
    public let tokenHashPrefix: String
    public let fileId: String
    public let versionId: String?
    public let expiresAt: String?
    public let requiresAuth: Bool
    public let maxDownloads: Int?
    public let downloads: Int
    public let createdAt: String
    public let revokedAt: String?

    public init(
        tokenHashPrefix: String,
        fileId: String,
        versionId: String?,
        expiresAt: String?,
        requiresAuth: Bool,
        maxDownloads: Int?,
        downloads: Int,
        createdAt: String,
        revokedAt: String?
    ) {
        self.tokenHashPrefix = tokenHashPrefix
        self.fileId = fileId
        self.versionId = versionId
        self.expiresAt = expiresAt
        self.requiresAuth = requiresAuth
        self.maxDownloads = maxDownloads
        self.downloads = downloads
        self.createdAt = createdAt
        self.revokedAt = revokedAt
    }
}

public struct FileFnShareDownloadDescriptor: Codable, Sendable, Equatable {
    public let url: URL
    public let headers: [String: String]
    public let fileName: String
    public let mimeType: String

    enum CodingKeys: String, CodingKey {
        case url
        case headers
        case fileName
        case mimeType
    }

    public init(
        url: URL,
        headers: [String: String] = [:],
        fileName: String,
        mimeType: String
    ) {
        self.url = url
        self.headers = headers
        self.fileName = fileName
        self.mimeType = mimeType
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        url = try container.decode(URL.self, forKey: .url)
        headers = try container.decodeIfPresent([String: String].self, forKey: .headers) ?? [:]
        fileName = try container.decode(String.self, forKey: .fileName)
        mimeType = try container.decode(String.self, forKey: .mimeType)
    }
}

extension FileFnShareDownloadDescriptor {
    func resolved(against baseURL: URL, requestId: String?) throws -> Self {
        Self(
            url: try fileFnResolveURL(url, against: baseURL, requestId: requestId),
            headers: headers,
            fileName: fileName,
            mimeType: mimeType
        )
    }
}
