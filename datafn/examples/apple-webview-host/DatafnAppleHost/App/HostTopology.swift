import Foundation

enum DatafnExampleTopology: String, CaseIterable, Identifiable {
    case browserOwned = "browser-owned"
    case nativeDatafnServer = "native-datafn-server"
    case nativeICloud = "native-icloud"

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .browserOwned:
            return "Browser-owned"
        case .nativeDatafnServer:
            return "Native-backed DataFn-server"
        case .nativeICloud:
            return "Native-backed CloudKit"
        }
    }

    var summary: String {
        switch self {
        case .browserOwned:
            return "Browser-owned mode keeps IndexedDB, JavaScript-owned sync, and browser SearchFn exactly as today."
        case .nativeDatafnServer:
            return "Native-backed DataFn-server mode disables IndexedDB fallback and moves storage, sync, and SearchFn ownership into Swift."
        case .nativeICloud:
            return "Native-backed CloudKit mode disables IndexedDB fallback and uses Core Data, local SearchFn indexing, and CloudKit private-database sync."
        }
    }

    var storageBackend: String {
        switch self {
        case .browserOwned:
            return "IndexedDB"
        case .nativeDatafnServer, .nativeICloud:
            return "Core Data"
        }
    }

    var syncOwner: String {
        switch self {
        case .browserOwned:
            return "javascript"
        case .nativeDatafnServer, .nativeICloud:
            return "native"
        }
    }

    var searchBackend: String {
        switch self {
        case .browserOwned:
            return "SearchFn IndexedDB (JavaScript-owned)"
        case .nativeDatafnServer:
            return "SearchFn SQLite (Swift-owned)"
        case .nativeICloud:
            return "SearchFn SQLite (Swift-owned, CloudKit-derived records)"
        }
    }

    var indexedDbDisabled: Bool {
        switch self {
        case .browserOwned:
            return false
        case .nativeDatafnServer, .nativeICloud:
            return true
        }
    }

    var remoteMode: String? {
        switch self {
        case .browserOwned:
            return nil
        case .nativeDatafnServer:
            return "datafn-server"
        case .nativeICloud:
            return "icloud"
        }
    }

    var remoteProfile: String? {
        switch self {
        case .nativeDatafnServer:
            return "default"
        case .browserOwned, .nativeICloud:
            return nil
        }
    }

    func makeEmbeddedTopology(options: DatafnExampleHostOptions) -> DatafnExampleEmbeddedTopology {
        DatafnExampleEmbeddedTopology(
            topology: rawValue,
            displayName: displayName,
            namespace: options.namespace,
            clientId: options.clientID,
            schemaHash: options.schemaHash,
            storage: indexedDbDisabled ? "native-backed" : "indexeddb",
            syncOwner: syncOwner,
            remoteMode: remoteMode,
            remoteProfile: remoteProfile,
            indexedDbDisabled: indexedDbDisabled,
            failIfUnavailable: true,
            cloudKitContainerIdentifier: self == .nativeICloud
                ? options.cloudKitContainerIdentifier
                : nil,
            webAppURL: options.webAppURL?.absoluteString
        )
    }

    func makeRuntimePlan(options: DatafnExampleHostOptions) -> DatafnExampleRuntimePlan? {
        switch self {
        case .browserOwned:
            return nil
        case .nativeDatafnServer:
            return DatafnExampleRuntimePlan(
                remoteMode: "datafn-server",
                schemaHash: options.schemaHash,
                namespace: options.namespace,
                clientID: options.clientID,
                remoteProfile: "default",
                datafnServerBaseURL: options.datafnServerBaseURL,
                datafnServerWebSocketURL: options.datafnServerWebSocketURL,
                cloudKitContainerIdentifier: nil,
                storeRootURL: options.storeRootURL.appendingPathComponent(
                    "native-datafn-server",
                    isDirectory: true
                )
            )
        case .nativeICloud:
            return DatafnExampleRuntimePlan(
                remoteMode: "icloud",
                schemaHash: options.schemaHash,
                namespace: options.namespace,
                clientID: options.clientID,
                remoteProfile: nil,
                datafnServerBaseURL: nil,
                datafnServerWebSocketURL: nil,
                cloudKitContainerIdentifier: options.cloudKitContainerIdentifier,
                storeRootURL: options.storeRootURL.appendingPathComponent(
                    "native-icloud",
                    isDirectory: true
                )
            )
        }
    }
}

struct DatafnExampleHostOptions: Equatable {
    let schemaHash: String
    let namespace: String
    let clientID: String
    let storeRootURL: URL
    let webAppURL: URL?
    let datafnServerBaseURL: URL
    let datafnServerWebSocketURL: URL
    let cloudKitContainerIdentifier: String
}

struct DatafnExampleEmbeddedTopology: Codable, Equatable {
    let topology: String
    let displayName: String
    let namespace: String
    let clientId: String
    let schemaHash: String
    let storage: String
    let syncOwner: String
    let remoteMode: String?
    let remoteProfile: String?
    let indexedDbDisabled: Bool
    let failIfUnavailable: Bool
    let cloudKitContainerIdentifier: String?
    let webAppURL: String?
}

struct DatafnExampleRuntimePlan: Codable, Equatable {
    let remoteMode: String
    let schemaHash: String
    let namespace: String
    let clientID: String
    let remoteProfile: String?
    let datafnServerBaseURL: URL?
    let datafnServerWebSocketURL: URL?
    let cloudKitContainerIdentifier: String?
    let storeRootURL: URL
}

enum DatafnExampleSchema {
    static let schemaHash = "todo-app-example-v1"
    static let namespace = "example:user-1"
    static let clientID = "apple-host-device"
    static let cloudKitContainerIdentifier = "iCloud.com.example.datafn.todo"
    static let json = Data(
        """
        {
          "resources": [
            {
              "name": "todos",
              "version": 1,
              "idPrefix": "todo",
              "fields": [
                { "name": "id", "type": "string", "required": true, "unique": true },
                { "name": "text", "type": "string", "required": true },
                { "name": "completed", "type": "boolean", "required": true, "default": false },
                { "name": "priority", "type": "number", "required": false, "default": 3 }
              ],
              "indices": { "search": ["text"] }
            },
            {
              "name": "categories",
              "version": 1,
              "idPrefix": "cat",
              "fields": [
                { "name": "id", "type": "string", "required": true, "unique": true },
                { "name": "name", "type": "string", "required": true },
                { "name": "color", "type": "string", "required": true, "default": "#646cff" }
              ],
              "indices": { "search": ["name"] }
            }
          ],
          "relations": [
            {
              "from": "todos",
              "to": "categories",
              "type": "many-many",
              "relation": "tags",
              "inverse": "todos"
            }
          ]
        }
        """.utf8
    )
}

enum DatafnExampleBridgeBootstrapScript {
    static func make(
        topology: DatafnExampleTopology,
        options: DatafnExampleHostOptions
    ) throws -> String {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]

        let payload = topology.makeEmbeddedTopology(options: options)
        let payloadJSON = String(decoding: try encoder.encode(payload), as: UTF8.self)
        let nativePayload = if let plan = topology.makeRuntimePlan(options: options) {
            String(decoding: try encoder.encode(plan), as: UTF8.self)
        } else {
            "undefined"
        }

        return """
        window.__DATAFN_EXAMPLE_TOPOLOGY__ = \(payloadJSON);
        window.__DATAFN_NATIVE_CONFIG__ = \(nativePayload);
        """
    }
}
