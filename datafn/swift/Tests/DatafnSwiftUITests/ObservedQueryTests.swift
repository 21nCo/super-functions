import CoreData
import Observation
import Testing
@testable import DatafnAppleRuntime
@testable import DatafnCoreDataStore
@testable import DatafnSwiftUI

private final class LockedBox<Value>: @unchecked Sendable {
    private let lock = NSLock()
    private var storage: Value

    init(_ value: Value) {
        self.storage = value
    }

    func set(_ value: Value) {
        lock.lock()
        storage = value
        lock.unlock()
    }

    func get() -> Value {
        lock.lock()
        defer { lock.unlock() }
        return storage
    }
}

@Suite("SwiftUI observed query")
struct ObservedQueryTests {
    @Test("ObservedQuery loads initial records and refreshes after shared-store writes")
    func observedQueryLoadsInitialRecordsAndRefreshesAfterSharedStoreWrites() async throws {
        let runtime = try await makeServerRuntime(namespace: "org-1:user-1")
        let store = await runtime.storeForTesting()
        try store.upsertRecord(
            resource: "tasks",
            record: [
                "id": "task:1",
                "title": "Initial",
            ]
        )

        let source = await runtime.makeObservationSource()
        let query = await MainActor.run {
            DatafnObservedQuery<[DatafnJSONObject]>(
                resource: "tasks",
                source: source
            )
        }

        let initialValue = await MainActor.run { query.value }
        #expect(initialValue == [[
            "id": "task:1",
            "title": "Initial",
        ]])

        try store.upsertRecord(
            resource: "tasks",
            record: [
                "id": "task:2",
                "title": "Updated",
            ]
        )

        try await waitUntil {
            let value = await MainActor.run { query.value }
            return value.contains(where: { $0["id"] == "task:2" })
        }
    }

    @Test("ObservedMutationState follows shared mutation events from the native store")
    func observedMutationStateFollowsSharedMutationEventsFromTheNativeStore() async throws {
        let runtime = try await makeServerRuntime(namespace: "org-1:user-2")
        let store = await runtime.storeForTesting()
        let source = await runtime.makeObservationSource()
        let mutationState = await MainActor.run {
            DatafnObservedMutationState(source: source)
        }

        _ = try store.changelogAppend(entry: DatafnChangelogPendingEntry(
            clientId: "device-1",
            mutationId: "mut-1",
            mutation: [
                "resource": "tasks",
                "id": "task:1",
                "operation": "insert",
                "record": [
                    "id": "task:1",
                    "title": "Shared mutation",
                ],
            ],
            timestampMs: 1
        ))

        try await waitUntil {
            await MainActor.run { mutationState.lastMutationID == "mut-1" }
        }

        let lastMutationID = await MainActor.run { mutationState.lastMutationID }
        let lastClientID = await MainActor.run { mutationState.lastClientID }
        let lastSequence = await MainActor.run { mutationState.lastSequence }
        let lastError = await MainActor.run { mutationState.lastError }
        #expect(lastMutationID == "mut-1")
        #expect(lastClientID == "device-1")
        #expect(lastSequence == 1)
        #expect(lastError == nil)
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
                Issue.record("Timed out waiting for observed state update")
                return
            }
            try await Task.sleep(nanoseconds: 10_000_000)
        }
    }
}
