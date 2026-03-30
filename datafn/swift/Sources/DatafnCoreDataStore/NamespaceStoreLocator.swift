import CryptoKit
import Foundation

public struct NamespaceStoreLocation: Sendable, Equatable {
    public let namespace: String
    public let directoryURL: URL
    public let storeURL: URL
    public let supportDirectoryURL: URL
    public let changeTrackingDomain: String

    public init(
        namespace: String,
        directoryURL: URL,
        storeURL: URL,
        supportDirectoryURL: URL,
        changeTrackingDomain: String
    ) {
        self.namespace = namespace
        self.directoryURL = directoryURL
        self.storeURL = storeURL
        self.supportDirectoryURL = supportDirectoryURL
        self.changeTrackingDomain = changeTrackingDomain
    }
}

enum NamespaceStoreLocatorError: Error, Equatable {
    case emptyNamespace
}

public struct NamespaceStoreLocator {
    public init() {}

    public func locate(namespace: String, under rootURL: URL) throws -> NamespaceStoreLocation {
        let trimmedNamespace = namespace.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedNamespace.isEmpty else {
            throw NamespaceStoreLocatorError.emptyNamespace
        }

        let namespaceDigest = digest(for: trimmedNamespace)
        let slug = readableSlug(for: trimmedNamespace)
        let directoryName = "\(slug)-\(String(namespaceDigest.prefix(16)))"
        let directoryURL = rootURL.appendingPathComponent(directoryName, isDirectory: true)
        let supportDirectoryURL = directoryURL.appendingPathComponent("Support", isDirectory: true)
        let storeURL = directoryURL.appendingPathComponent("datafn.sqlite", isDirectory: false)

        return NamespaceStoreLocation(
            namespace: trimmedNamespace,
            directoryURL: directoryURL,
            storeURL: storeURL,
            supportDirectoryURL: supportDirectoryURL,
            changeTrackingDomain: "datafn.\(namespaceDigest)"
        )
    }

    private func readableSlug(for namespace: String) -> String {
        let characters = namespace.unicodeScalars.map { scalar -> Character in
            if CharacterSet.alphanumerics.contains(scalar) {
                return Character(String(scalar).lowercased())
            }

            return "-"
        }

        let collapsed = String(characters)
            .replacingOccurrences(of: "-+", with: "-", options: .regularExpression)
            .trimmingCharacters(in: CharacterSet(charactersIn: "-"))

        if collapsed.isEmpty {
            return "namespace"
        }

        return String(collapsed.prefix(32))
    }

    private func digest(for namespace: String) -> String {
        let hash = SHA256.hash(data: Data(namespace.utf8))
        return hash.map { String(format: "%02x", $0) }.joined()
    }
}
