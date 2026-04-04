import Combine
import FileFnClient
import Foundation

@MainActor
public final class FileFnUploadObservable: ObservableObject {
    @Published public private(set) var status: String
    @Published public private(set) var aggregateBytesSent: Int64
    @Published public private(set) var aggregateBytesExpected: Int64
    @Published public private(set) var latestError: FileFnClientError?

    private let task: FileFnUploadTask
    private var observerTask: Task<Void, Never>?

    public init(task: FileFnUploadTask) {
        self.task = task
        status = "idle"
        aggregateBytesSent = 0
        aggregateBytesExpected = 0
        latestError = nil

        observerTask = Task { @MainActor [weak self] in
            await self?.observe()
        }
    }

    deinit {
        observerTask?.cancel()
    }

    private func observe() async {
        do {
            for try await event in task.events {
                aggregateBytesSent = event.progress.bytesUploaded
                aggregateBytesExpected = event.progress.totalBytes
                latestError = nil

                switch event.kind {
                case .queued:
                    status = "queued"
                case .sessionCreated, .partProgress, .partCompleted:
                    status = "running"
                case .completed:
                    status = "completed"
                }
            }

            _ = try await task.value()
            if status != "completed" {
                status = "completed"
            }
        } catch is CancellationError {
            status = "cancelled"
        } catch let error as FileFnClientError {
            latestError = error
            status = "failed"
        } catch {
            latestError = .preprocessingFailed(
                code: "FILEFN_UPLOAD_OBSERVATION_FAILED",
                message: error.localizedDescription
            )
            status = "failed"
        }
    }
}
