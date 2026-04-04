import Foundation

public enum FileFnRenderIntent: String, Codable, Sendable {
    case thumbnail
    case preview
    case full
    case download
}

public enum FileFnRenderState: String, Codable, Sendable {
    case ready
    case processing
    case pendingLocal = "pending-local"
    case unsupported
}

public enum FileFnRenderPlaceholderKind: String, Codable, Sendable {
    case genericFile = "generic-file"
    case pdfProcessing = "pdf-processing"
    case unsupportedPreview = "unsupported-preview"
}

public struct FileFnRenderDescriptor: Codable, Sendable, Equatable {
    public struct Source: Codable, Sendable, Equatable {
        public let mode: String
        public let artifactId: String?
        public let artifactKind: String?
        public let url: URL?
        public let headers: [String: String]?
        public let placeholderKind: FileFnRenderPlaceholderKind?

        enum CodingKeys: String, CodingKey {
            case mode
            case artifactId
            case artifactKind
            case url
            case headers
            case placeholderKind
        }

        public init(
            mode: String,
            artifactId: String? = nil,
            artifactKind: String? = nil,
            url: URL? = nil,
            headers: [String: String]? = nil,
            placeholderKind: FileFnRenderPlaceholderKind? = nil
        ) {
            self.mode = mode
            self.artifactId = artifactId
            self.artifactKind = artifactKind
            self.url = url
            self.headers = headers
            self.placeholderKind = placeholderKind
        }

        public init(from decoder: Decoder) throws {
            let container = try decoder.container(keyedBy: CodingKeys.self)
            mode = try container.decode(String.self, forKey: .mode)
            artifactId = try container.decodeIfPresent(String.self, forKey: .artifactId)
            artifactKind = try container.decodeIfPresent(String.self, forKey: .artifactKind)
            url = try container.decodeIfPresent(URL.self, forKey: .url)
            headers = try container.decodeIfPresent([String: String].self, forKey: .headers)
            placeholderKind = try container.decodeIfPresent(FileFnRenderPlaceholderKind.self, forKey: .placeholderKind)
        }
    }

    public let fileId: String
    public let versionId: String
    public let intent: FileFnRenderIntent
    public let state: FileFnRenderState
    public let mimeType: String
    public let name: String
    public let size: Int64
    public let source: Source
    public let warnings: [String]

    enum CodingKeys: String, CodingKey {
        case fileId
        case versionId
        case intent
        case state
        case mimeType
        case name
        case size
        case source
        case warnings
    }

    public init(
        fileId: String,
        versionId: String,
        intent: FileFnRenderIntent,
        state: FileFnRenderState,
        mimeType: String,
        name: String,
        size: Int64,
        source: Source,
        warnings: [String] = []
    ) {
        self.fileId = fileId
        self.versionId = versionId
        self.intent = intent
        self.state = state
        self.mimeType = mimeType
        self.name = name
        self.size = size
        self.source = source
        self.warnings = warnings
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        fileId = try container.decode(String.self, forKey: .fileId)
        versionId = try container.decode(String.self, forKey: .versionId)
        intent = try container.decode(FileFnRenderIntent.self, forKey: .intent)
        state = try container.decode(FileFnRenderState.self, forKey: .state)
        mimeType = try container.decode(String.self, forKey: .mimeType)
        name = try container.decode(String.self, forKey: .name)
        size = try container.decode(Int64.self, forKey: .size)
        source = try container.decode(Source.self, forKey: .source)
        warnings = try container.decodeIfPresent([String].self, forKey: .warnings) ?? []
    }
}

extension FileFnRenderDescriptor.Source {
    func resolved(against baseURL: URL, requestId: String?) throws -> Self {
        Self(
            mode: mode,
            artifactId: artifactId,
            artifactKind: artifactKind,
            url: try url.map { try fileFnResolveURL($0, against: baseURL, requestId: requestId) },
            headers: headers,
            placeholderKind: placeholderKind
        )
    }
}

extension FileFnRenderDescriptor {
    func resolved(against baseURL: URL, requestId: String?) throws -> Self {
        Self(
            fileId: fileId,
            versionId: versionId,
            intent: intent,
            state: state,
            mimeType: mimeType,
            name: name,
            size: size,
            source: try source.resolved(against: baseURL, requestId: requestId),
            warnings: warnings
        )
    }
}
