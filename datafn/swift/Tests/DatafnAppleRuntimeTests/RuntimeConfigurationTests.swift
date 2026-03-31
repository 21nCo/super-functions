import CoreData
import DatafnCoreDataStore
import Testing
@testable import DatafnAppleRuntime

@Suite("DatafnAppleRuntime configuration")
struct RuntimeConfigurationTests {
    @Test("Runtime initializes from schema JSON and DataFn-server configuration")
    func runtimeInitializesFromSchemaJSONAndDatafnServerConfiguration() async throws {
        let configuration = DatafnAppleRuntimeConfiguration(
            schemaJSON: makeSchemaJSON(),
            schemaHash: "abc123",
            namespace: "org-1:user-1",
            clientID: "device-1",
            storeRootURL: makeStoreRootURL(),
            syncBackend: .datafnServer(
                DatafnServerSyncConfiguration(
                    baseURL: URL(string: "https://api.example.com/datafn")!,
                    websocketURL: URL(string: "wss://api.example.com/datafn")!,
                    profileID: "default"
                )
            )
        )

        let runtime = try await DatafnAppleRuntime(configuration: configuration)
        let snapshot = await runtime.snapshotForTesting()
        let health = await runtime.healthCheck()

        #expect(snapshot.schemaHash == "abc123")
        #expect(snapshot.namespace == "org-1:user-1")
        #expect(snapshot.clientID == "device-1")
        #expect(snapshot.remoteMode == .datafnServer)
        #expect(snapshot.resourceNames == ["tags", "tasks"])
        #expect(snapshot.entityNames.contains("df_record_tasks"))
        #expect(snapshot.storeURL.lastPathComponent == "datafn.sqlite")
        #expect(health.remoteMode == "datafn-server")
        #expect(health.issues.isEmpty)
        #expect(health.ok)
    }

    @Test("Runtime initializes from schema JSON and CloudKit configuration")
    func runtimeInitializesFromSchemaJSONAndCloudKitConfiguration() async throws {
        let configuration = DatafnAppleRuntimeConfiguration(
            schemaJSON: makeSchemaJSON(),
            schemaHash: "icloud-hash",
            namespace: "personal:user-1",
            clientID: "device-icloud",
            storeRootURL: makeStoreRootURL(),
            syncBackend: .iCloud(
                DatafnCloudKitConfiguration(
                    containerIdentifier: "iCloud.com.example.app"
                )
            )
        )

        let runtime = try await DatafnAppleRuntime(configuration: configuration)
        let snapshot = await runtime.snapshotForTesting()
        let health = await runtime.healthCheck()

        #expect(snapshot.remoteMode == .iCloud)
        #expect(snapshot.schemaHash == "icloud-hash")
        #expect(health.remoteMode == "icloud")
        #expect(health.storageBackend == "coredata")
        #expect(health.syncOwner == "native")
        #expect(health.ok)
    }

    @Test("Runtime rejects invalid schema JSON")
    func runtimeRejectsInvalidSchemaJSON() async throws {
        let configuration = DatafnAppleRuntimeConfiguration(
            schemaJSON: Data("{}".utf8),
            schemaHash: "bad",
            namespace: "org-1:user-1",
            clientID: "device-1",
            storeRootURL: makeStoreRootURL(),
            syncBackend: .datafnServer(
                DatafnServerSyncConfiguration(
                    baseURL: URL(string: "https://api.example.com/datafn")!,
                    profileID: "default"
                )
            )
        )

        do {
            _ = try await DatafnAppleRuntime(configuration: configuration)
            Issue.record("Expected invalid schema JSON to throw")
        } catch {
            #expect(error is DatafnRuntimeSchemaError || error is DatafnAppleRuntimeError)
        }
    }

    private func makeSchemaJSON() -> Data {
        let json = """
        {
          "resources": [
            {
              "name": "tasks",
              "version": 1,
              "fields": [
                { "name": "title", "type": "string", "required": false }
              ]
            },
            {
              "name": "tags",
              "version": 1,
              "fields": [
                { "name": "label", "type": "string", "required": false }
              ]
            }
          ],
          "relations": [
            {
              "from": "tasks",
              "to": "tags",
              "type": "many-many",
              "relation": "tags",
              "inverse": "tasks"
            }
          ]
        }
        """

        return Data(json.utf8)
    }

    private func makeStoreRootURL() -> URL {
        FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
    }
}
