import Testing
import CoreData
@testable import DatafnAppleRuntime
@testable import DatafnCoreDataStore
@testable import DatafnServerSync
@testable import DatafnWebViewBridgeHost

private final class AuthLockedBox<Value>: @unchecked Sendable {
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

private final class RecordingWebSocketConnection: DatafnServerWebSocketConnection, @unchecked Sendable {
    let sentMessages = AuthLockedBox<[String]>([])
    let resumed = AuthLockedBox(false)
    let cancelled = AuthLockedBox(false)

    func resume() {
        resumed.set(true)
    }

    func cancel() {
        cancelled.set(true)
    }

    func receiveString() async throws -> String {
        try await Task.sleep(nanoseconds: 60_000_000_000)
        return ""
    }

    func sendString(_ text: String) async throws {
        sentMessages.withValue { $0.append(text) }
    }
}

@Suite("Datafn server auth parity")
struct AuthParityTests {
    @Test("TV-AUTH-001: Native server-backed mode applies auth configuration without exposing secrets in bridge events")
    func nativeServerBackedModeAppliesAuthConfigurationWithoutExposingSecretsInBridgeEvents() async throws {
        let schema = makeSchema()
        let store = try makeStore(namespace: "org-1:user-3", schema: schema)
        let httpHeaders = AuthLockedBox<[String: String]?>(nil)
        let webSocketHeaders = AuthLockedBox<[String: String]?>(nil)
        let outbound = AuthLockedBox<[Any]>([])
        let webSocket = RecordingWebSocketConnection()

        try store.setHydrationState(resource: "tasks", state: .hydrating)
        try store.setHydrationState(resource: "tasks", state: .ready)

        let auth = DatafnAuthConfiguration(
            staticHeaders: ["X-Static": "native"],
            websocketHeaders: ["X-WebSocket": "bridge"],
            bearerTokenProvider: { "secret-token" },
            requestInterceptor: { request, context in
                var intercepted = request
                intercepted.setValue(
                    context.transport == .http ? "http" : "websocket",
                    forHTTPHeaderField: "X-Intercepted"
                )
                return intercepted
            }
        )

        let executor = DatafnServerRemoteExecutor(
            configuration: DatafnServerRemoteExecutorConfiguration(
                baseURL: URL(string: "https://api.example.com/datafn")!,
                websocketURL: URL(string: "wss://api.example.com/datafn/ws")!,
                profileID: "default",
                requestAuthorizer: auth.makeRequestAuthorizer(profileID: "default")
            ),
            httpSender: { request in
                httpHeaders.set(request.allHTTPHeaderFields ?? [:])
                return try makeHTTPResponse(
                    for: request,
                    statusCode: 200,
                    json: [
                        "ok": true,
                        "result": [
                            "ok": true,
                            "records": [:],
                            "deleted": [:],
                            "cursors": ["tasks": "1"],
                            "hasMore": false,
                        ],
                    ]
                )
            },
            webSocketFactory: { request in
                webSocketHeaders.set(request.allHTTPHeaderFields ?? [:])
                return webSocket
            }
        )

        let engine = DatafnServerSyncEngine(
            store: store,
            schema: schema,
            clientID: "device-1",
            remoteExecutor: executor
        )

        let host = DatafnWKWebViewBridgeHost(
            handlerName: "datafn",
            bridgeConfiguration: DatafnBridgeConfiguration(
                schemaHash: "abc123",
                namespace: "org-1:user-3",
                remoteMode: "datafn-server",
                remoteProfile: "default"
            ),
            storage: store,
            remoteHandlers: .unsupported(),
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
                    remoteMode: "datafn-server",
                    issues: []
                )
            }
        )
        host.setTestingSink { event in
            outbound.withValue { $0.append(event) }
        }

        _ = await host.handleMessageForTesting([
            "protocol": DATAFN_BRIDGE_PROTOCOL,
            "id": "req-auth-handshake",
            "method": "handshake",
            "payload": [
                "schemaHash": "abc123",
                "namespace": "org-1:user-3",
                "clientId": "device-1",
                "remoteMode": "datafn-server",
                "remoteProfile": "default",
            ],
        ])
        let startResponse = await host.handleMessageForTesting([
            "protocol": DATAFN_BRIDGE_PROTOCOL,
            "id": "req-auth-start",
            "method": "sync.start",
        ])
        let stopResponse = await host.handleMessageForTesting([
            "protocol": DATAFN_BRIDGE_PROTOCOL,
            "id": "req-auth-stop",
            "method": "sync.stop",
        ])

        #expect(startResponse.ok)
        #expect(stopResponse.ok)
        #expect(httpHeaders.get()?["Authorization"] == "Bearer secret-token")
        #expect(httpHeaders.get()?["X-Static"] == "native")
        #expect(httpHeaders.get()?["X-Intercepted"] == "http")
        #expect(webSocketHeaders.get()?["Authorization"] == "Bearer secret-token")
        #expect(webSocketHeaders.get()?["X-Static"] == "native")
        #expect(webSocketHeaders.get()?["X-WebSocket"] == "bridge")
        #expect(webSocketHeaders.get()?["X-Intercepted"] == "websocket")
        #expect(webSocket.resumed.get())
        #expect(webSocket.cancelled.get())
        #expect(webSocket.sentMessages.get().first?.contains("\"type\":\"hello\"") == true)

        let outboundText = String(describing: outbound.get())
        #expect(!outboundText.contains("secret-token"))
    }

    @Test("TV-AUTH-001 negative: unauthorized remote profiles surface as FORBIDDEN")
    func unauthorizedRemoteProfilesSurfaceAsForbidden() async throws {
        let auth = DatafnAuthConfiguration.bearerToken("secret-token")
        let executor = DatafnServerRemoteExecutor(
            configuration: DatafnServerRemoteExecutorConfiguration(
                baseURL: URL(string: "https://api.example.com/datafn")!,
                profileID: "default",
                requestAuthorizer: auth.makeRequestAuthorizer(profileID: "default")
            ),
            httpSender: { request in
                try makeHTTPResponse(
                    for: request,
                    statusCode: 403,
                    json: ["message": "denied"]
                )
            }
        )

        let envelope = try await executor.query([
            "resource": "auditLogs",
        ])
        let body = try #require(envelope.objectValue)
        let error = try #require(body["error"]?.objectValue)

        #expect(body["ok"] == false)
        #expect(error["code"] == "FORBIDDEN")
        #expect(error["message"] == "Remote profile is unauthorized")
        #expect(error["details"]?.objectValue?["path"] == "sync.native.remoteProfile")
    }

    private func makeSchema() -> DatafnRuntimeSchema {
        DatafnRuntimeSchema(
            resources: [
                .init(
                    name: "tasks",
                    version: 1,
                    fields: [.init(name: "title", type: "string")]
                ),
            ]
        )
    }

    private func makeStore(
        namespace: String,
        schema: DatafnRuntimeSchema
    ) throws -> DatafnCoreDataStore {
        try DatafnCoreDataStore(
            configuration: DatafnCoreDataStoreConfiguration(
                schema: schema,
                schemaHash: "abc123",
                namespace: namespace,
                clientID: "device-1",
                backendKind: "datafn-server",
                storeURL: FileManager.default.temporaryDirectory
                    .appendingPathComponent(UUID().uuidString)
                    .appendingPathComponent("datafn.sqlite"),
                inMemory: true
            )
        )
    }
}
