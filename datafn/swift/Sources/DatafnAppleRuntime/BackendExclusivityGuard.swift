import DatafnCoreDataStore
import Foundation

public struct BackendExclusivityError: Error, Equatable, Sendable {
    public let existingBackendKind: String
    public let requestedBackendKind: String
    public let issue: DatafnHealthIssue

    init(existingBackendKind: String, requestedBackendKind: String) {
        self.existingBackendKind = existingBackendKind
        self.requestedBackendKind = requestedBackendKind
        self.issue = BackendExclusivityGuard.makeIssue(
            existingBackendKind: existingBackendKind,
            requestedBackendKind: requestedBackendKind
        )
    }
}

enum BackendExclusivityGuard {
    static func normalize(_ error: Error) -> Error {
        guard
            case let DatafnCoreDataStoreError.backendKindConflict(
                existingBackendKind,
                requestedBackendKind
            ) = error
        else {
            return error
        }

        return BackendExclusivityError(
            existingBackendKind: existingBackendKind,
            requestedBackendKind: requestedBackendKind
        )
    }

    static func makeIssue(
        existingBackendKind: String,
        requestedBackendKind: String
    ) -> DatafnHealthIssue {
        DatafnHealthIssue(
            code: "NATIVE_SYNC_CONFLICT",
            message: "A namespace store may only use one remote sync backend",
            details: [
                "path": .string("sync.native.remoteMode"),
                "existingBackend": .string(existingBackendKind),
                "requestedBackend": .string(requestedBackendKind),
            ]
        )
    }
}
