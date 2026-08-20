import Testing
import CoreData
@testable import DatafnCoreDataStore
@testable import DatafnWebViewBridgeHost

private final class LockedBox<Value>: @unchecked Sendable {
    private let lock = NSLock()
    private var storage: Value

    init(_ value: Value) {
        storage = value
    }

    func set(_ value: Value) {
        lock.lock()
        storage = value
        lock.unlock()
    }

    func withValue<T>(_ transform: (inout Value) -> T) -> T {
        lock.lock()
        defer { lock.unlock() }
        return transform(&storage)
    }

    func get() -> Value {
        lock.lock()
        defer { lock.unlock() }
        return storage
    }
}

@Suite("Datafn WebView bridge host")
struct BridgeHostTests {
    @Test("TV-BRG-001: Bridge handshake succeeds with matching protocol and schema hash")
    func bridgeHandshakeSucceedsWithMatchingProtocolAndSchemaHash() async throws {
        let store = try makeStore(namespace: "org-1:user-1")
        let host = makeHost(
            store: store,
            remoteMode: "datafn-server",
            remoteProfile: "default"
        )
        let outbound = LockedBox<[Any]>([])
        host.setTestingSink { event in
            outbound.withValue { storage in
                storage.append(event)
            }
        }

        let response = await host.handleMessageForTesting([
            "protocol": DATAFN_BRIDGE_PROTOCOL,
            "id": "req-1",
            "method": "handshake",
            "payload": [
                "schemaHash": "abc123",
                "namespace": "org-1:user-1",
                "clientId": "device-1",
                "remoteMode": "datafn-server",
                "remoteProfile": "default",
            ],
        ])

        let result = try #require(response.result?.objectValue)
        #expect(response.ok)
        #expect(result["bridgeVersion"] == 1)
        #expect(result["schemaHash"] == "abc123")
        #expect(result["namespace"] == "org-1:user-1")
        #expect(result["storageBackend"] == "coredata")
        #expect(result["syncOwner"] == "native")
        #expect(result["remoteMode"] == "datafn-server")
        #expect(result["indexedDbDisabled"] == true)
        #expect(
            result["capabilities"]
                == ["storage", "storage.atomicMergeIfMissing", "remote", "sync", "events", "health"]
        )
        #expect(extractEventNames(from: outbound.get()) == ["bridge.ready"])
    }

    @Test("TV-BRG-002: Unsupported bridge method is rejected")
    func unsupportedBridgeMethodIsRejected() async throws {
        let host = makeHost(store: try makeStore(namespace: "org-1:user-1"))

        let response = await host.handleMessageForTesting([
            "protocol": DATAFN_BRIDGE_PROTOCOL,
            "id": "req-9",
            "method": "native.eval",
            "payload": [
                "code": "alert(1)",
            ],
        ])

        #expect(!response.ok)
        #expect(response.error == DatafnBridgeError(
            code: "BRIDGE_METHOD_UNSUPPORTED",
            message: "Unsupported bridge method",
            details: [
                "path": "method",
                "method": "native.eval",
            ]
        ))
    }

    @Test("TV-BRG-002N: Protocol mismatches are rejected with a stable error code")
    func protocolMismatchesAreRejectedWithStableErrorCode() async throws {
        let host = makeHost(store: try makeStore(namespace: "org-1:user-1"))

        let response = await host.handleMessageForTesting([
            "protocol": "wrong-protocol",
            "id": "req-10",
            "method": "handshake",
            "payload": [:],
        ])

        #expect(!response.ok)
        #expect(response.error == DatafnBridgeError(
            code: "BRIDGE_PROTOCOL_MISMATCH",
            message: "Bridge protocol version mismatch",
            details: ["path": "protocol"]
        ))
    }

    @Test("TV-BRG-003: Schema hash mismatch fails fast")
    func schemaHashMismatchFailsFast() async throws {
        let host = makeHost(
            store: try makeStore(namespace: "org-1:user-1"),
            remoteMode: "icloud"
        )

        let response = await host.handleMessageForTesting([
            "protocol": DATAFN_BRIDGE_PROTOCOL,
            "id": "req-2",
            "method": "handshake",
            "payload": [
                "schemaHash": "web-hash",
                "namespace": "org-1:user-1",
                "clientId": "device-1",
                "remoteMode": "icloud",
            ],
        ])

        #expect(!response.ok)
        #expect(response.error == DatafnBridgeError(
            code: "BRIDGE_PROTOCOL_MISMATCH",
            message: "Schema hash mismatch",
            details: ["path": "payload.schemaHash"]
        ))
    }

    @Test("Bridge routes remote and sync control requests through native-owned handlers")
    func bridgeRoutesRemoteAndSyncControlRequests() async throws {
        let store = try makeStore(namespace: "org-1:user-3")
        let remoteHandlers = DatafnBridgeRemoteHandlers(
            query: { _ in ["source": "native-remote-adapter"] },
            mutation: { _ in .null },
            transact: { _ in .null },
            seed: { _ in .null },
            clone: { _ in .null },
            pull: { _ in .null },
            push: { _ in .null },
            reconcile: { _ in .null }
        )
        let host = makeHost(
            store: store,
            remoteMode: "datafn-server",
            remoteHandlers: remoteHandlers
        )
        let outbound = LockedBox<[Any]>([])
        host.setTestingSink { event in
            outbound.withValue { storage in
                storage.append(event)
            }
        }

        let remoteResponse = await host.handleMessageForTesting([
            "protocol": DATAFN_BRIDGE_PROTOCOL,
            "id": "req-query",
            "method": "remote.query",
            "payload": [
                "resource": "tasks",
            ],
        ])
        let syncResponse = await host.handleMessageForTesting([
            "protocol": DATAFN_BRIDGE_PROTOCOL,
            "id": "req-sync",
            "method": "sync.start",
        ])

        #expect(remoteResponse.ok)
        #expect(remoteResponse.result == ["source": "native-remote-adapter"])
        #expect(syncResponse.ok)
        #expect(extractEventNames(from: outbound.get()).contains("sync.status"))
    }

    @Test("TV-EVT-001: Native storage changes propagate to JS and Swift-side observers")
    func nativeStorageChangesPropagateToJSAndSwiftSideObservers() async throws {
        let store = try makeStore(namespace: "org-1:user-4")
        let host = makeHost(store: store)
        let outbound = LockedBox<[Any]>([])
        let swiftObserverInvalidated = LockedBox(false)
        host.setTestingSink { event in
            outbound.withValue { storage in
                storage.append(event)
            }
        }
        let token = store.subscribe { event in
            if event.name == DatafnCoreDataStore.storageChangedEvent {
                swiftObserverInvalidated.set(true)
            }
        }
        defer { store.unsubscribe(token) }

        let response = await host.handleMessageForTesting([
            "protocol": DATAFN_BRIDGE_PROTOCOL,
            "id": "req-store",
            "method": "storage.upsertRecord",
            "payload": [
                "resource": "tasks",
                "record": [
                    "id": "task:1",
                    "title": "Shared store",
                ],
            ],
        ])

        #expect(response.ok)
        #expect(swiftObserverInvalidated.get())
        let storageChanged = try #require(extractEvent(named: "storage.changed", from: outbound.get()))
        #expect(storageChanged["resource"] == "tasks")
        #expect(storageChanged["ids"] == ["task:1"])
    }

    @Test("Native merge preserves the atomic missing-record payload")
    func nativeMergePreservesMissingRecordPayload() async throws {
        let store = try makeStore(namespace: "org-1:user-merge")
        let host = makeHost(store: store)

        let response = await host.handleMessageForTesting([
            "protocol": DATAFN_BRIDGE_PROTOCOL,
            "id": "req-merge",
            "method": "storage.mergeRecord",
            "payload": [
                "resource": "tasks",
                "id": "task:new",
                "partial": ["title": "Patch"],
                "options": [
                    "ifMissing": [
                        "id": "task:new",
                        "title": "Patch",
                        "status": "draft",
                        "createdBy": "user:1",
                    ],
                ],
            ],
        ])

        #expect(response.ok)
        let result = try #require(response.result?.objectValue)
        #expect(result["status"] == "draft")
        #expect(result["createdBy"] == "user:1")
        #expect(try store.getRecord(resource: "tasks", id: "task:new")?["status"] == "draft")
    }

    @Test("TV-SEC-001: Sensitive auth headers are redacted before events leave native code")
    func sensitiveAuthHeadersAreRedactedBeforeEventsLeaveNativeCode() {
        let emitter = DatafnBridgeEventEmitter()
        let received = LockedBox<DatafnBridgeEventEnvelope?>(nil)
        emitter.setSink { received.set($0) }

        emitter.emit(
            event: "sync.failed",
            payload: [
                "loggedHeaders": [
                    "Authorization": "Bearer secret-token",
                ],
            ]
        )

        let payload = try! #require(received.get()?.payload.objectValue)
        #expect(payload["loggedHeaders"] == [
            "Authorization": "[REDACTED]",
        ])
    }

    @Test("TV-OBS-001: Health report includes backend and redacted issue details")
    func healthReportIncludesBackendAndRedactedIssueDetails() async throws {
        let host = makeHost(
            store: try makeStore(namespace: "personal:user-1"),
            remoteMode: "icloud",
            healthReportProvider: {
                DatafnBridgeHealthReport(
                    mode: "native",
                    storageBackend: "coredata",
                    syncOwner: "native",
                    remoteMode: "icloud",
                    issues: []
                )
            }
        )

        let response = await host.handleMessageForTesting([
            "protocol": DATAFN_BRIDGE_PROTOCOL,
            "id": "req-health",
            "method": "health.check",
        ])

        #expect(response.ok)
        #expect(response.result == [
            "mode": "native",
            "storageBackend": "coredata",
            "syncOwner": "native",
            "remoteMode": "icloud",
            "issues": [],
        ])
    }

    private func makeHost(
        store: DatafnCoreDataStore,
        remoteMode: String = "datafn-server",
        remoteProfile: String? = nil,
        remoteHandlers: DatafnBridgeRemoteHandlers = .unsupported(),
        healthReportProvider: @escaping @Sendable () async -> DatafnBridgeHealthReport = {
            DatafnBridgeHealthReport(
                mode: "native",
                storageBackend: "coredata",
                syncOwner: "native",
                remoteMode: "datafn-server",
                issues: []
            )
        }
    ) -> DatafnWKWebViewBridgeHost {
        DatafnWKWebViewBridgeHost(
            handlerName: "datafn",
            bridgeConfiguration: DatafnBridgeConfiguration(
                schemaHash: "abc123",
                namespace: "org-1:user-1",
                remoteMode: remoteMode,
                remoteProfile: remoteProfile
            ),
            storage: store,
            remoteHandlers: remoteHandlers,
            healthReportProvider: healthReportProvider
        )
    }

    private func makeStore(namespace: String) throws -> DatafnCoreDataStore {
        let storeURL = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
            .appendingPathComponent("datafn.sqlite")

        return try DatafnCoreDataStore(
            configuration: DatafnCoreDataStoreConfiguration(
                schema: DatafnRuntimeSchema(
                    resources: [
                        .init(
                            name: "tasks",
                            version: 1,
                            fields: [.init(name: "title", type: "string")]
                        ),
                        .init(
                            name: "tags",
                            version: 1,
                            fields: [.init(name: "label", type: "string")]
                        ),
                    ],
                    relations: [
                        .init(
                            from: "tasks",
                            to: .single("tags"),
                            type: .manyMany,
                            name: "tags",
                            inverse: "tasks"
                        )
                    ]
                ),
                schemaHash: "abc123",
                namespace: namespace,
                clientID: "device-1",
                backendKind: "datafn-server",
                storeURL: storeURL
            )
        )
    }

    private func extractEventNames(from outbound: [Any]) -> [String] {
        outbound.compactMap { item in
            (item as? [String: Any])?["event"] as? String
        }
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
