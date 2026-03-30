import DatafnCoreDataStore
import Foundation

public struct DatafnCloudKitSyncSnapshot: Sendable, Equatable {
    public let containerIdentifier: String
    public let databaseScope: String
    public let started: Bool
    public let healthState: DatafnCloudKitHealthState
}

public actor DatafnCloudKitSyncEngine {
    private let store: DatafnCoreDataStore
    private let containerIdentifier: String
    private let databaseScope: String
    private let healthMonitor: DatafnCloudKitHealthMonitor

    private var started = false
    private var lastHealth = DatafnCloudKitHealth.available()

    public init(
        store: DatafnCoreDataStore,
        containerIdentifier: String,
        databaseScope: String = "private",
        healthMonitor: DatafnCloudKitHealthMonitor? = nil
    ) {
        self.store = store
        self.containerIdentifier = containerIdentifier
        self.databaseScope = databaseScope
        self.healthMonitor = healthMonitor
            ?? .live(containerIdentifier: containerIdentifier)
    }

    public func start() async throws {
        let health = await refreshHealth()
        if let issue = health.issues.first {
            publishFailure(issue)
            publishStatus(
                state: "blocked",
                action: "start",
                healthState: health.state
            )
            throw DatafnCloudKitSyncError(issue: issue)
        }

        started = true
        publishStatus(state: "running", healthState: health.state)
    }

    public func stop() async {
        started = false
        publishStatus(state: "stopped", healthState: lastHealth.state)
    }

    public func pullNow() async throws {
        try await performHealthCheckedAction("pullNow")
    }

    public func cloneNow() async throws {
        try await performHealthCheckedAction("cloneNow")
    }

    public func reconcileNow() async throws {
        try await performHealthCheckedAction("reconcileNow")
    }

    public func schedulePush() async throws {
        try await performHealthCheckedAction("schedulePush")
    }

    public func health() async -> DatafnCloudKitHealth {
        await refreshHealth()
    }

    public func healthIssues() async -> [DatafnHealthIssue] {
        await refreshHealth().issues
    }

    public func snapshotForTesting() -> DatafnCloudKitSyncSnapshot {
        DatafnCloudKitSyncSnapshot(
            containerIdentifier: containerIdentifier,
            databaseScope: databaseScope,
            started: started,
            healthState: lastHealth.state
        )
    }

    private func performHealthCheckedAction(_ action: String) async throws {
        let health = await refreshHealth()
        if let issue = health.issues.first {
            publishFailure(issue)
            publishStatus(
                state: started ? "degraded" : "blocked",
                action: action,
                healthState: health.state
            )
            throw DatafnCloudKitSyncError(issue: issue)
        }

        publishStatus(
            state: started ? "running" : "idle",
            action: action,
            healthState: health.state
        )
    }

    @discardableResult
    private func refreshHealth() async -> DatafnCloudKitHealth {
        let health = await healthMonitor.evaluate()
        if health != lastHealth {
            lastHealth = health
            store.publishHealthChanged([
                "backend": .string("icloud"),
                "healthState": .string(health.state.rawValue),
                "issues": .array(health.issues.map { .object($0.jsonObject) }),
            ])
        }
        return health
    }

    private func publishStatus(
        state: String,
        action: String? = nil,
        healthState: DatafnCloudKitHealthState
    ) {
        var payload: DatafnJSONObject = [
            "state": .string(state),
            "backend": .string("icloud"),
            "healthState": .string(healthState.rawValue),
            "databaseScope": .string(databaseScope),
        ]
        if let action {
            payload["action"] = .string(action)
        }
        store.publishSyncStatus(payload)
    }

    private func publishFailure(_ issue: DatafnHealthIssue) {
        var payload = issue.jsonObject
        payload["backend"] = .string("icloud")
        payload["databaseScope"] = .string(databaseScope)
        store.publishSyncFailure(payload)
    }
}
