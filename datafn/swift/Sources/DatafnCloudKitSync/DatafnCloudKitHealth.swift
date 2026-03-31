import CloudKit
import DatafnCoreDataStore
import Foundation

public enum DatafnCloudKitHealthState: String, Sendable, Equatable {
    case available
    case accountUnavailable
    case privateDatabaseUnavailable
}

public struct DatafnCloudKitHealth: Sendable, Equatable {
    public let state: DatafnCloudKitHealthState
    public let issues: [DatafnHealthIssue]

    public init(
        state: DatafnCloudKitHealthState,
        issues: [DatafnHealthIssue]
    ) {
        self.state = state
        self.issues = issues
    }

    public static func available() -> Self {
        Self(state: .available, issues: [])
    }

    public static func accountUnavailable(
        accountStatus: String = "unknown"
    ) -> Self {
        Self(
            state: .accountUnavailable,
            issues: [
                DatafnHealthIssue(
                    code: "ICLOUD_UNAVAILABLE",
                    message: "iCloud account is unavailable",
                    details: [
                        "path": .string("sync.native.remoteMode"),
                        "accountStatus": .string(accountStatus),
                    ]
                )
            ]
        )
    }

    public static func privateDatabaseUnavailable() -> Self {
        Self(
            state: .privateDatabaseUnavailable,
            issues: [
                DatafnHealthIssue(
                    code: "ICLOUD_UNAVAILABLE",
                    message: "CloudKit private database unavailable",
                    details: ["path": .string("sync.native.remoteMode")]
                )
            ]
        )
    }
}

public struct DatafnCloudKitSyncError: Error, Equatable, Sendable {
    public let code: String
    public let message: String
    public let details: DatafnJSONObject?

    public init(
        code: String,
        message: String,
        details: DatafnJSONObject? = nil
    ) {
        self.code = code
        self.message = message
        self.details = details
    }

    init(issue: DatafnHealthIssue) {
        self.code = issue.code
        self.message = issue.message
        self.details = issue.details
    }
}

public struct DatafnCloudKitHealthMonitor: Sendable {
    public typealias Evaluator = @Sendable () async -> DatafnCloudKitHealth

    private let evaluator: Evaluator

    public init(evaluate: @escaping Evaluator) {
        self.evaluator = evaluate
    }

    public func evaluate() async -> DatafnCloudKitHealth {
        await evaluator()
    }

    public static func live(
        containerIdentifier: String,
        privateDatabaseAvailable: @escaping @Sendable () -> Bool = { true }
    ) -> Self {
        Self {
            guard privateDatabaseAvailable() else {
                return .privateDatabaseUnavailable()
            }

            let accountStatus = await accountStatus(
                forContainerIdentifier: containerIdentifier
            )
            guard accountStatus == .available else {
                return .accountUnavailable(
                    accountStatus: accountStatusLabel(accountStatus)
                )
            }

            return .available()
        }
    }

    private static func accountStatus(
        forContainerIdentifier containerIdentifier: String
    ) async -> CKAccountStatus {
        await withCheckedContinuation { continuation in
            CKContainer(identifier: containerIdentifier).accountStatus { status, error in
                guard error == nil else {
                    continuation.resume(returning: .couldNotDetermine)
                    return
                }
                continuation.resume(returning: status)
            }
        }
    }

    private static func accountStatusLabel(_ status: CKAccountStatus) -> String {
        switch status {
        case .available:
            return "available"
        case .noAccount:
            return "noAccount"
        case .restricted:
            return "restricted"
        case .couldNotDetermine:
            return "couldNotDetermine"
        case .temporarilyUnavailable:
            return "temporarilyUnavailable"
        @unknown default:
            return "unknown"
        }
    }
}
