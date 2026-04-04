import Foundation

public struct FileFnStorageQuota: Codable, Sendable, Equatable {
    public let current: Int64
    public let limit: Int64

    public init(current: Int64, limit: Int64) {
        self.current = current
        self.limit = limit
    }
}
