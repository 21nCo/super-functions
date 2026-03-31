import Testing
import CoreData
@testable import DatafnAppleRuntime
@testable import DatafnCoreDataStore

@Suite("CloudKit backend exclusivity")
struct BackendExclusivityTests {
    @Test("TV-CLD-003: Same-store dual backend configuration is rejected")
    func sameStoreDualBackendConfigurationIsRejected() async throws {
        let storeRoot = makeStoreRootURL()
        _ = try await makeRuntime(
            namespace: "org-1:user-1",
            storeRootURL: storeRoot,
            syncBackend: DatafnSyncBackendConfiguration.datafnServer(
                DatafnServerSyncConfiguration(
                    baseURL: URL(string: "https://api.example.com/datafn")!,
                    profileID: "default"
                )
            )
        )

        do {
            _ = try await makeRuntime(
                namespace: "org-1:user-1",
                storeRootURL: storeRoot,
                syncBackend: DatafnSyncBackendConfiguration.iCloud(
                    DatafnCloudKitConfiguration(
                        containerIdentifier: "iCloud.com.example.app"
                    )
                )
            )
            Issue.record("Expected same-store backend conflict")
        } catch let error as BackendExclusivityError {
            #expect(error.issue == DatafnHealthIssue(
                code: "NATIVE_SYNC_CONFLICT",
                message: "A namespace store may only use one remote sync backend",
                details: [
                    "path": "sync.native.remoteMode",
                    "existingBackend": "datafn-server",
                    "requestedBackend": "icloud",
                ]
            ))
        } catch {
            Issue.record("Unexpected error: \(String(describing: error))")
        }
    }

    @Test("TV-CLD-003 negative: separate namespace stores do not conflict")
    func separateNamespaceStoresDoNotConflict() async throws {
        let storeRoot = makeStoreRootURL()
        _ = try await makeRuntime(
            namespace: "org-1:user-1",
            storeRootURL: storeRoot,
            syncBackend: DatafnSyncBackendConfiguration.datafnServer(
                DatafnServerSyncConfiguration(
                    baseURL: URL(string: "https://api.example.com/datafn")!,
                    profileID: "default"
                )
            )
        )

        let runtime = try await makeRuntime(
            namespace: "org-1:user-2",
            storeRootURL: storeRoot,
            syncBackend: DatafnSyncBackendConfiguration.iCloud(
                DatafnCloudKitConfiguration(
                    containerIdentifier: "iCloud.com.example.app"
                )
            )
        )
        let snapshot = await runtime.snapshotForTesting()

        #expect(snapshot.namespace == "org-1:user-2")
        #expect(snapshot.remoteMode == DatafnNativeRemoteMode.iCloud)
        #expect(snapshot.usesCloudKitPersistentContainer)
    }

    private func makeRuntime(
        namespace: String,
        storeRootURL: URL,
        syncBackend: DatafnSyncBackendConfiguration
    ) async throws -> DatafnAppleRuntime {
        try await DatafnAppleRuntime(
            configuration: DatafnAppleRuntimeConfiguration(
                schemaJSON: makeSchemaJSON(),
                schemaHash: "abc123",
                namespace: namespace,
                clientID: "device-1",
                storeRootURL: storeRootURL,
                syncBackend: syncBackend
            )
        )
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
            }
          ],
          "relations": []
        }
        """

        return Data(json.utf8)
    }

    private func makeStoreRootURL() -> URL {
        FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
    }
}
