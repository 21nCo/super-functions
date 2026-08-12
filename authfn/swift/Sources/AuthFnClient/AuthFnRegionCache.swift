import Foundation

public actor AuthFnRegionCache {
    public struct Entry: Codable, Equatable, Sendable {
        public var identifier: String
        public var regionId: String
        public var authority: String
        public var expiresAt: Date
    }

    private var entries: [String: Entry] = [:]

    public init() {}

    public func get(identifier: String) -> Entry? {
        let key = normalize(identifier)
        guard let entry = entries[key], entry.expiresAt > Date() else {
            entries[key] = nil
            return nil
        }
        return entry
    }

    public func set(identifier: String, regionId: String, authority: String, ttl: TimeInterval = 900) {
        let key = normalize(identifier)
        entries[key] = Entry(
            identifier: key,
            regionId: regionId,
            authority: authority,
            expiresAt: Date().addingTimeInterval(ttl)
        )
    }

    public func delete(identifier: String) {
        entries[normalize(identifier)] = nil
    }

    private func normalize(_ identifier: String) -> String {
        identifier.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    }
}
