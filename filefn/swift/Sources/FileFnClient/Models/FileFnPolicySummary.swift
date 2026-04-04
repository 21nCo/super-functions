import Foundation

public struct FileFnPolicySummary: Codable, Sendable, Equatable {
    public let name: String
    public let maxSizeBytes: Int64?
    public let contentTypes: [String]?
    public let visibility: String?

    public init(
        name: String,
        maxSizeBytes: Int64? = nil,
        contentTypes: [String]? = nil,
        visibility: String? = nil
    ) {
        self.name = name
        self.maxSizeBytes = maxSizeBytes
        self.contentTypes = contentTypes
        self.visibility = visibility
    }
}
