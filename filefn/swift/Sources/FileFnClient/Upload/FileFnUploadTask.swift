import Foundation

actor FileFnUploadTaskState {
    private var uploadSessionId: String?
    private var uploadSessionToken: String?

    func record(session: FileFnUploadSession) {
        uploadSessionId = session.uploadSessionId
        uploadSessionToken = session.uploadSessionToken
    }

    func snapshot() -> (uploadSessionId: String?, uploadSessionToken: String?) {
        (uploadSessionId, uploadSessionToken)
    }

    func clear() {
        uploadSessionId = nil
        uploadSessionToken = nil
    }
}

func fileFnGenerateRandomIdentifier(prefix: String) -> String {
    let value = UUID().uuidString.replacingOccurrences(of: "-", with: "").lowercased()
    return "\(prefix)_\(value)"
}

public final class FileFnUploadTask: @unchecked Sendable {
    public let fileId: String
    public let idempotencyKey: String
    public let events: AsyncThrowingStream<FileFnForegroundUploadEvent, Error>

    let state: FileFnUploadTaskState

    private let operation: Task<FileFnCompletedUpload, Error>

    init(
        fileId: String,
        idempotencyKey: String,
        events: AsyncThrowingStream<FileFnForegroundUploadEvent, Error>,
        operation: Task<FileFnCompletedUpload, Error>,
        state: FileFnUploadTaskState = FileFnUploadTaskState()
    ) {
        self.fileId = fileId
        self.idempotencyKey = idempotencyKey
        self.events = events
        self.operation = operation
        self.state = state
    }

    deinit {
        operation.cancel()
    }

    public func value() async throws -> FileFnCompletedUpload {
        try await operation.value
    }

    public func cancel() {
        operation.cancel()
    }
}
