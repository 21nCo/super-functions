import Foundation

public struct FileFnBackgroundUploadConfiguration: Sendable {
    public let workingDirectory: URL
    public let stateStore: any FileFnUploadStateStore & Sendable
    public let secretStore: any FileFnSecretStore & Sendable

    public init(
        workingDirectory: URL? = nil,
        stateStore: (any FileFnUploadStateStore & Sendable)? = nil,
        secretStore: (any FileFnSecretStore & Sendable)? = nil
    ) {
        let resolvedWorkingDirectory = workingDirectory ?? Self.defaultWorkingDirectory()
        self.workingDirectory = resolvedWorkingDirectory
        self.stateStore = stateStore ?? FileFnFileSystemUploadStateStore(rootDirectory: resolvedWorkingDirectory)
        self.secretStore = secretStore ?? FileFnKeychainSecretStore(serviceName: "org.21n.filefn.swift")
    }

    static func defaultWorkingDirectory() -> URL {
        let applicationSupport = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
        let baseDirectory = applicationSupport ?? FileManager.default.temporaryDirectory
        return baseDirectory
            .appendingPathComponent("filefn", isDirectory: true)
            .appendingPathComponent("background-uploads", isDirectory: true)
    }
}
