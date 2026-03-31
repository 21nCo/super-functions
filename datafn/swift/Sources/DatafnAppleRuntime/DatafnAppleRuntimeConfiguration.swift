import DatafnSearchContracts
import Foundation

public enum DatafnNativeRemoteMode: String, Codable, Sendable, Equatable {
    case datafnServer = "datafn-server"
    case iCloud = "icloud"
}

public struct DatafnServerSyncConfiguration: Sendable {
    public let baseURL: URL
    public let websocketURL: URL?
    public let profileID: String
    public let auth: DatafnAuthConfiguration?

    public init(
        baseURL: URL,
        websocketURL: URL? = nil,
        profileID: String,
        auth: DatafnAuthConfiguration? = nil
    ) {
        self.baseURL = baseURL
        self.websocketURL = websocketURL
        self.profileID = profileID
        self.auth = auth
    }
}

public enum DatafnCloudKitDatabaseScope: String, Codable, Sendable, Equatable {
    case privateDatabase = "private"
}

public struct DatafnCloudKitConfiguration: Sendable, Equatable {
    public let containerIdentifier: String
    public let databaseScope: DatafnCloudKitDatabaseScope

    public init(
        containerIdentifier: String,
        databaseScope: DatafnCloudKitDatabaseScope = .privateDatabase
    ) {
        self.containerIdentifier = containerIdentifier
        self.databaseScope = databaseScope
    }
}

public enum DatafnSyncBackendConfiguration: Sendable {
    case datafnServer(DatafnServerSyncConfiguration)
    case iCloud(DatafnCloudKitConfiguration)

    public var remoteMode: DatafnNativeRemoteMode {
        switch self {
        case .datafnServer:
            return .datafnServer
        case .iCloud:
            return .iCloud
        }
    }

    public var serverProfileID: String? {
        switch self {
        case .datafnServer(let server):
            return server.profileID
        case .iCloud:
            return nil
        }
    }
}

public struct DatafnAppleRuntimeConfiguration: Sendable {
    public let schemaJSON: Data
    public let schemaHash: String
    public let namespace: String
    public let clientID: String
    public let storeRootURL: URL
    public let search: DatafnSearchBackendConfiguration?
    public let syncBackend: DatafnSyncBackendConfiguration

    public init(
        schemaJSON: Data,
        schemaHash: String,
        namespace: String,
        clientID: String,
        storeRootURL: URL,
        search: DatafnSearchBackendConfiguration? = nil,
        syncBackend: DatafnSyncBackendConfiguration
    ) {
        self.schemaJSON = schemaJSON
        self.schemaHash = schemaHash
        self.namespace = namespace
        self.clientID = clientID
        self.storeRootURL = storeRootURL
        self.search = search
        self.syncBackend = syncBackend
    }
}

enum DatafnAppleRuntimeConfigurationError: Error, Equatable {
    case emptySchemaHash
    case emptyNamespace
    case emptyClientID
    case nonFileStoreRootURL
    case nonFileSearchRootURL
    case emptyCloudKitContainerIdentifier
    case emptyServerProfileID
}

extension DatafnAppleRuntimeConfiguration {
    func validate() throws {
        if schemaHash.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            throw DatafnAppleRuntimeConfigurationError.emptySchemaHash
        }

        if namespace.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            throw DatafnAppleRuntimeConfigurationError.emptyNamespace
        }

        if clientID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            throw DatafnAppleRuntimeConfigurationError.emptyClientID
        }

        guard storeRootURL.isFileURL else {
            throw DatafnAppleRuntimeConfigurationError.nonFileStoreRootURL
        }

        if let searchRootURL = search?.searchRootURL, !searchRootURL.isFileURL {
            throw DatafnAppleRuntimeConfigurationError.nonFileSearchRootURL
        }

        switch syncBackend {
        case .datafnServer(let server):
            if server.profileID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                throw DatafnAppleRuntimeConfigurationError.emptyServerProfileID
            }
        case .iCloud(let cloudKit):
            if cloudKit.containerIdentifier.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                throw DatafnAppleRuntimeConfigurationError.emptyCloudKitContainerIdentifier
            }
        }
    }
}
