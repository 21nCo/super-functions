import CoreData
import Observation
import Testing
@testable import DatafnAppleRuntime
@testable import DatafnCoreDataStore
@testable import DatafnSwiftUI
@testable import DatafnWebViewBridgeHost

private final class LockedFlag: @unchecked Sendable {
    private let lock = NSLock()
    private var value = false

    func setTrue() {
        lock.lock()
        value = true
        lock.unlock()
    }

    func get() -> Bool {
        lock.lock()
        defer { lock.unlock() }
        return value
    }
}

@Suite("SwiftUI shared-store propagation")
struct SharedStorePropagationTests {
    @Test("TV-SWUI-001 / TV-EVT-001: WebView writes invalidate SwiftUI observers over the shared store")
    func webViewWritesInvalidateSwiftUIObserversOverTheSharedStore() async throws {
        let runtime = try await makeServerRuntime(namespace: "org-1:user-3")
        let source = await runtime.makeObservationSource()
        let query = await MainActor.run {
            DatafnObservedQuery<[DatafnJSONObject]>(
                resource: "tasks",
                source: source
            )
        }
        let invalidated = LockedFlag()

        await MainActor.run {
            withObservationTracking {
                _ = query.value.count
            } onChange: {
                invalidated.setTrue()
            }
        }

        let host = await runtime.makeBridgeHost(handlerName: "datafn")
        let response = await host.handleMessageForTesting([
            "protocol": DATAFN_BRIDGE_PROTOCOL,
            "id": "req-swiftui-web",
            "method": "storage.upsertRecord",
            "payload": [
                "resource": "tasks",
                "record": [
                    "id": "task:9",
                    "title": "Shared store",
                ],
            ],
        ])

        #expect(response.ok)
        try await waitUntil {
            let value = await MainActor.run { query.value }
            return invalidated.get()
                && value.contains(where: { $0["id"] == "task:9" })
        }
    }

    @Test("Server-backed shared-store changes refresh SwiftUI observers")
    func serverBackedSharedStoreChangesRefreshSwiftUIObservers() async throws {
        let runtime = try await makeServerRuntime(namespace: "org-1:user-4")
        let source = await runtime.makeObservationSource()
        let store = await runtime.storeForTesting()
        let query = await MainActor.run {
            DatafnObservedQuery<[DatafnJSONObject]>(
                resource: "tasks",
                source: source
            )
        }

        try store.upsertRecord(
            resource: "tasks",
            record: [
                "id": "task:server",
                "title": "From server",
            ]
        )

        try await waitUntil {
            let value = await MainActor.run { query.value }
            return value.contains(where: { $0["id"] == "task:server" })
        }
    }

    @Test("CloudKit-backed shared-store changes refresh SwiftUI observers")
    func cloudKitBackedSharedStoreChangesRefreshSwiftUIObservers() async throws {
        let runtime = try await makeCloudKitRuntime(namespace: "org-1:user-5")
        let source = await runtime.makeObservationSource()
        let store = await runtime.storeForTesting()
        let query = await MainActor.run {
            DatafnObservedQuery<[DatafnJSONObject]>(
                resource: "tasks",
                source: source
            )
        }

        try store.upsertRecord(
            resource: "tasks",
            record: [
                "id": "task:cloud",
                "title": "From CloudKit",
            ]
        )

        try await waitUntil {
            let value = await MainActor.run { query.value }
            return value.contains(where: { $0["id"] == "task:cloud" })
        }
    }

    private func makeServerRuntime(namespace: String) async throws -> DatafnAppleRuntime {
        try await DatafnAppleRuntime(
            configuration: DatafnAppleRuntimeConfiguration(
                schemaJSON: makeSchemaJSON(),
                schemaHash: "abc123",
                namespace: namespace,
                clientID: "device-1",
                storeRootURL: FileManager.default.temporaryDirectory
                    .appendingPathComponent(UUID().uuidString, isDirectory: true),
                syncBackend: .datafnServer(
                    DatafnServerSyncConfiguration(
                        baseURL: URL(string: "https://api.example.com/datafn")!,
                        profileID: "default"
                    )
                )
            )
        )
    }

    private func makeCloudKitRuntime(namespace: String) async throws -> DatafnAppleRuntime {
        try await DatafnAppleRuntime(
            configuration: DatafnAppleRuntimeConfiguration(
                schemaJSON: makeSchemaJSON(),
                schemaHash: "abc123",
                namespace: namespace,
                clientID: "device-1",
                storeRootURL: FileManager.default.temporaryDirectory
                    .appendingPathComponent(UUID().uuidString, isDirectory: true),
                syncBackend: .iCloud(
                    DatafnCloudKitConfiguration(
                        containerIdentifier: "iCloud.com.example.app"
                    )
                )
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

    private func waitUntil(
        timeoutNanoseconds: UInt64 = 1_000_000_000,
        condition: @escaping @Sendable () async -> Bool
    ) async throws {
        let start = DispatchTime.now().uptimeNanoseconds
        while !(await condition()) {
            if DispatchTime.now().uptimeNanoseconds - start > timeoutNanoseconds {
                Issue.record("Timed out waiting for shared-store propagation")
                return
            }
            try await Task.sleep(nanoseconds: 10_000_000)
        }
    }
}
