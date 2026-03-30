import Testing
import CoreData
@testable import DatafnAppleRuntime
@testable import DatafnCloudKitSync
@testable import DatafnCoreDataStore
@testable import DatafnWebViewBridgeHost

private final class LockedBox<Value>: @unchecked Sendable {
    private let lock = NSLock()
    private var storage: Value

    init(_ value: Value) {
        self.storage = value
    }

    func append(_ value: Any) where Value == [Any] {
        lock.lock()
        storage.append(value)
        lock.unlock()
    }

    func get() -> Value {
        lock.lock()
        defer { lock.unlock() }
        return storage
    }
}

@Suite("CloudKit native-backed mode")
struct CloudKitModeTests {
    @Test("TV-CLD-001 / TV-OBS-001: CloudKit mode uses a private-database-backed store and emits healthy bridge status")
    func cloudKitModeUsesPrivateDatabaseBackedStoreAndHealthyBridgeStatus() async throws {
        let store = try makeCloudKitStore(namespace: "personal:user-1")
        let containerSnapshot = store.persistentContainerSnapshotForTesting()
        let engine = DatafnCloudKitSyncEngine(
            store: store,
            containerIdentifier: "iCloud.com.example.app",
            healthMonitor: DatafnCloudKitHealthMonitor {
                .available()
            }
        )
        let host = makeHost(
            namespace: "personal:user-1",
            store: store,
            engine: engine
        )
        let outbound = LockedBox<[Any]>([])
        host.setTestingSink { outbound.append($0) }

        let handshake = await host.handleMessageForTesting([
            "protocol": DATAFN_BRIDGE_PROTOCOL,
            "id": "req-handshake",
            "method": "handshake",
            "payload": [
                "schemaHash": "abc123",
                "namespace": "personal:user-1",
                "clientId": "device-1",
                "remoteMode": "icloud",
            ],
        ])
        let start = await host.handleMessageForTesting([
            "protocol": DATAFN_BRIDGE_PROTOCOL,
            "id": "req-start",
            "method": "sync.start",
        ])
        let upsert = await host.handleMessageForTesting([
            "protocol": DATAFN_BRIDGE_PROTOCOL,
            "id": "req-upsert",
            "method": "storage.upsertRecord",
            "payload": [
                "resource": "tasks",
                "record": [
                    "id": "task:1",
                    "title": "Across devices",
                ],
            ],
        ])
        let record = await host.handleMessageForTesting([
            "protocol": DATAFN_BRIDGE_PROTOCOL,
            "id": "req-record",
            "method": "storage.getRecord",
            "payload": [
                "resource": "tasks",
                "id": "task:1",
            ],
        ])
        let healthResponse = await host.handleMessageForTesting([
            "protocol": DATAFN_BRIDGE_PROTOCOL,
            "id": "req-health",
            "method": "health.check",
        ])
        let engineSnapshot = await engine.snapshotForTesting()

        #expect(containerSnapshot.kind == "cloudkit")
        #expect(containerSnapshot.cloudKitContainerIdentifier == "iCloud.com.example.app")
        #expect(containerSnapshot.cloudKitDatabaseScope == "private")
        #expect(handshake.ok)
        #expect(start.ok)
        #expect(upsert.ok)
        let handshakeResult = try #require(handshake.result?.objectValue)
        #expect(handshakeResult["remoteMode"] == "icloud")
        #expect(handshakeResult["cloudKitPrivateOnly"] == true)
        let recordResult = try #require(record.result?.objectValue)
        #expect(recordResult["id"] == "task:1")
        #expect(recordResult["title"] == "Across devices")
        #expect(engineSnapshot.started)
        let healthResult = try #require(healthResponse.result?.objectValue)
        #expect(healthResult["remoteMode"] == "icloud")
        #expect(healthResult["issues"] == [])
        let syncStatus = try #require(extractEvent(named: "sync.status", from: outbound.get()))
        #expect(syncStatus["backend"] == "icloud")
        #expect(syncStatus["healthState"] == "available")
    }

    @Test("TV-CLD-001 negative / TV-OBS-001 negative: iCloud account unavailability is exposed through sync and health")
    func accountUnavailabilityIsExposedThroughSyncAndHealth() async throws {
        let store = try makeCloudKitStore(namespace: "personal:user-2")
        let engine = DatafnCloudKitSyncEngine(
            store: store,
            containerIdentifier: "iCloud.com.example.app",
            healthMonitor: DatafnCloudKitHealthMonitor {
                .accountUnavailable(accountStatus: "noAccount")
            }
        )
        let host = makeHost(
            namespace: "personal:user-2",
            store: store,
            engine: engine
        )

        let start = await host.handleMessageForTesting([
            "protocol": DATAFN_BRIDGE_PROTOCOL,
            "id": "req-start-unavailable",
            "method": "sync.start",
        ])
        let healthResponse = await host.handleMessageForTesting([
            "protocol": DATAFN_BRIDGE_PROTOCOL,
            "id": "req-health-unavailable",
            "method": "health.check",
        ])

        #expect(!start.ok)
        #expect(start.error == DatafnBridgeError(
            code: "ICLOUD_UNAVAILABLE",
            message: "iCloud account is unavailable",
            details: [
                "path": "sync.native.remoteMode",
                "accountStatus": "noAccount",
            ]
        ))
        let healthResult = try #require(healthResponse.result?.objectValue)
        let issues = try #require(healthResult["issues"]?.arrayValue)
        let issue = try #require(issues.first?.objectValue)
        #expect(issue["code"] == "ICLOUD_UNAVAILABLE")
        #expect(issue["message"] == "iCloud account is unavailable")
    }

    @Test("TV-CLD-002 negative: private database availability failures are surfaced truthfully")
    func privateDatabaseAvailabilityFailuresAreSurfacedTruthfully() async throws {
        let store = try makeCloudKitStore(namespace: "personal:user-3")
        let engine = DatafnCloudKitSyncEngine(
            store: store,
            containerIdentifier: "iCloud.com.example.app",
            healthMonitor: DatafnCloudKitHealthMonitor {
                .privateDatabaseUnavailable()
            }
        )
        let host = makeHost(
            namespace: "personal:user-3",
            store: store,
            engine: engine
        )

        let start = await host.handleMessageForTesting([
            "protocol": DATAFN_BRIDGE_PROTOCOL,
            "id": "req-start-private-db",
            "method": "sync.start",
        ])

        #expect(!start.ok)
        #expect(start.error == DatafnBridgeError(
            code: "ICLOUD_UNAVAILABLE",
            message: "CloudKit private database unavailable",
            details: ["path": "sync.native.remoteMode"]
        ))
    }

    private func makeHost(
        namespace: String,
        store: DatafnCoreDataStore,
        engine: DatafnCloudKitSyncEngine
    ) -> DatafnWKWebViewBridgeHost {
        DatafnWKWebViewBridgeHost(
            handlerName: "datafn",
            bridgeConfiguration: DatafnBridgeConfiguration(
                schemaHash: "abc123",
                namespace: namespace,
                remoteMode: "icloud"
            ),
            storage: store,
            remoteHandlers: .unsupported(
                message: "CloudKit mode does not expose DataFn server remote operations"
            ),
            syncHandlers: DatafnBridgeSyncHandlers(
                start: { try await engine.start() },
                stop: { await engine.stop() },
                pullNow: { try await engine.pullNow() },
                cloneNow: { try await engine.cloneNow() },
                reconcileNow: { try await engine.reconcileNow() },
                schedulePush: { try await engine.schedulePush() }
            ),
            healthReportProvider: {
                DatafnBridgeHealthReport(
                    mode: "native",
                    storageBackend: "coredata",
                    syncOwner: "native",
                    remoteMode: "icloud",
                    issues: await engine.healthIssues()
                )
            }
        )
    }

    private func makeCloudKitStore(namespace: String) throws -> DatafnCoreDataStore {
        let schema = DatafnRuntimeSchema(
            resources: [
                .init(
                    name: "tasks",
                    version: 1,
                    fields: [.init(name: "title", type: "string")]
                ),
            ]
        )
        let storeURL = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
            .appendingPathComponent("datafn.sqlite")
        let model = try CoreDataModelBuilder().buildModel(
            from: schema,
            options: .cloudKit
        )

        return try DatafnCoreDataStore(
            configuration: DatafnCoreDataStoreConfiguration(
                schema: schema,
                schemaHash: "abc123",
                namespace: namespace,
                clientID: "device-1",
                backendKind: "icloud",
                storeURL: storeURL,
                cloudKit: DatafnCoreDataStoreCloudKitConfiguration(
                    containerIdentifier: "iCloud.com.example.app",
                    databaseScope: .privateDatabase
                )
            ),
            managedObjectModel: model
        )
    }

    private func extractEvent(
        named eventName: String,
        from outbound: [Any]
    ) -> DatafnJSONObject? {
        outbound
            .compactMap { $0 as? [String: Any] }
            .first(where: { ($0["event"] as? String) == eventName })
            .flatMap { ($0["payload"] as? [String: Any]) }
            .flatMap { try? $0.mapValues(DatafnJSONValue.init(any:)) }
    }
}
