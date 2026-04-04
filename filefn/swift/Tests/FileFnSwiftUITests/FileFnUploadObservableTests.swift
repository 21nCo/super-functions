@testable import FileFnClient
@testable import FileFnSwiftUI
import Foundation
import Testing

struct FileFnUploadObservableTests {
    @Test
    @MainActor
    func observableTracksAggregateProgressToCompletion() async throws {
        var continuationRef: AsyncThrowingStream<FileFnForegroundUploadEvent, Error>.Continuation?
        let stream = AsyncThrowingStream<FileFnForegroundUploadEvent, Error> { continuation in
            continuationRef = continuation
        }
        let continuation = try #require(continuationRef)

        let operation = Task<FileFnCompletedUpload, Error> {
            continuation.yield(
                FileFnForegroundUploadEvent(
                    kind: .queued,
                    fileId: "file_obs_001",
                    progress: FileFnForegroundUploadProgress(bytesUploaded: 0, totalBytes: 100, partsCompleted: 0, totalParts: 1)
                )
            )
            continuation.yield(
                FileFnForegroundUploadEvent(
                    kind: .sessionCreated,
                    fileId: "file_obs_001",
                    uploadSessionId: "upl_obs_001",
                    uploadMode: .proxy,
                    progress: FileFnForegroundUploadProgress(bytesUploaded: 0, totalBytes: 100, partsCompleted: 0, totalParts: 1)
                )
            )
            continuation.yield(
                FileFnForegroundUploadEvent(
                    kind: .partProgress,
                    fileId: "file_obs_001",
                    uploadSessionId: "upl_obs_001",
                    uploadMode: .proxy,
                    partNumber: 1,
                    progress: FileFnForegroundUploadProgress(bytesUploaded: 50, totalBytes: 100, partsCompleted: 0, totalParts: 1)
                )
            )
            let result = FileFnCompletedUpload(fileId: "file_obs_001", versionId: "ver_obs_001")
            continuation.yield(
                FileFnForegroundUploadEvent(
                    kind: .completed,
                    fileId: "file_obs_001",
                    uploadSessionId: "upl_obs_001",
                    uploadMode: .proxy,
                    progress: FileFnForegroundUploadProgress(bytesUploaded: 100, totalBytes: 100, partsCompleted: 1, totalParts: 1),
                    result: result
                )
            )
            continuation.finish()
            return result
        }

        let task = FileFnUploadTask(
            fileId: "file_obs_001",
            idempotencyKey: "idem_obs_001",
            events: stream,
            operation: operation
        )

        let observable = FileFnUploadObservable(task: task)
        try await waitForMainActorCondition { observable.status == "completed" }

        #expect(observable.aggregateBytesSent == 100)
        #expect(observable.aggregateBytesExpected == 100)
        #expect(observable.latestError == nil)
    }

    @Test
    @MainActor
    func observableCapturesTerminalClientErrors() async throws {
        var continuationRef: AsyncThrowingStream<FileFnForegroundUploadEvent, Error>.Continuation?
        let stream = AsyncThrowingStream<FileFnForegroundUploadEvent, Error> { continuation in
            continuationRef = continuation
        }
        let continuation = try #require(continuationRef)

        let operation = Task<FileFnCompletedUpload, Error> {
            continuation.yield(
                FileFnForegroundUploadEvent(
                    kind: .queued,
                    fileId: "file_obs_002",
                    progress: FileFnForegroundUploadProgress(bytesUploaded: 0, totalBytes: 10, partsCompleted: 0, totalParts: 1)
                )
            )
            let error = FileFnClientError.preprocessingFailed(
                code: "FILEFN_HEIC_CONVERSION_FAILED",
                message: "mock failure"
            )
            continuation.finish(throwing: error)
            throw error
        }

        let task = FileFnUploadTask(
            fileId: "file_obs_002",
            idempotencyKey: "idem_obs_002",
            events: stream,
            operation: operation
        )

        let observable = FileFnUploadObservable(task: task)
        try await waitForMainActorCondition { observable.status == "failed" }

        #expect(observable.aggregateBytesSent == 0)
        #expect(observable.aggregateBytesExpected == 10)
        #expect(observable.latestError == .preprocessingFailed(code: "FILEFN_HEIC_CONVERSION_FAILED", message: "mock failure"))
    }
}

@MainActor
private func waitForMainActorCondition(
    timeoutNanoseconds: UInt64 = 1_000_000_000,
    intervalNanoseconds: UInt64 = 20_000_000,
    condition: @escaping @MainActor () -> Bool
) async throws {
    let deadline = DispatchTime.now().uptimeNanoseconds + timeoutNanoseconds
    while !condition() {
        if DispatchTime.now().uptimeNanoseconds > deadline {
            Issue.record("Timed out waiting for observable state")
            return
        }
        try await Task.sleep(nanoseconds: intervalNanoseconds)
    }
}
