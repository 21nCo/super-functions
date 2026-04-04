import Foundation
#if canImport(UniformTypeIdentifiers)
import UniformTypeIdentifiers
#endif

public struct FileFnForegroundUploader: Sendable {
    public let client: FileFnClient
    public let preprocessors: [any FileFnUploadPreprocessor]

    public init(
        client: FileFnClient,
        preprocessors: [any FileFnUploadPreprocessor] = [FileFnHEICPreprocessor()]
    ) {
        self.client = client
        self.preprocessors = preprocessors
    }

    public func upload(_ request: FileFnForegroundUploadRequest) -> FileFnUploadTask {
        let fileId = request.fileId ?? fileFnGenerateRandomIdentifier(prefix: "file")
        let idempotencyKey = request.idempotencyKey ?? fileFnGenerateRandomIdentifier(prefix: "idem")
        let state = FileFnUploadTaskState()
        var continuationRef: AsyncThrowingStream<FileFnForegroundUploadEvent, Error>.Continuation?
        let stream = AsyncThrowingStream<FileFnForegroundUploadEvent, Error>(bufferingPolicy: .unbounded) { continuation in
            continuationRef = continuation
        }
        guard let continuation = continuationRef else {
            fatalError("Upload stream continuation was not initialized")
        }

        let operation = Task<FileFnCompletedUpload, Error> {
            try await performUpload(
                request: request,
                fileId: fileId,
                idempotencyKey: idempotencyKey,
                state: state,
                continuation: continuation,
                preprocessors: preprocessors
            )
        }

        return FileFnUploadTask(
            fileId: fileId,
            idempotencyKey: idempotencyKey,
            events: stream,
            operation: operation,
            state: state
        )
    }

    private func performUpload(
        request: FileFnForegroundUploadRequest,
        fileId: String,
        idempotencyKey: String,
        state: FileFnUploadTaskState,
        continuation: AsyncThrowingStream<FileFnForegroundUploadEvent, Error>.Continuation,
        preprocessors: [any FileFnUploadPreprocessor]
    ) async throws -> FileFnCompletedUpload {
        var didFinishStream = false
        func finish(throwing error: Error? = nil) async {
            guard !didFinishStream else {
                return
            }
            didFinishStream = true
            if let error {
                continuation.finish(throwing: error)
            } else {
                continuation.finish()
            }
            await state.clear()
        }

        do {
            let preparedHandle = try await FileFnUploadPreparation.prepare(
                request: request,
                defaultPreprocessors: preprocessors
            )
            defer { preparedHandle.cleanup() }
            let preparedUpload = preparedHandle.upload

            continuation.yield(
                FileFnForegroundUploadEvent(
                    kind: .queued,
                    fileId: fileId,
                    progress: FileFnForegroundUploadProgress(
                        bytesUploaded: 0,
                        totalBytes: preparedUpload.fileSize,
                        partsCompleted: 0,
                        totalParts: 0
                    )
                )
            )

            let session = try await client.createUploadSession(
                request: FileFnCreateUploadSessionRequest(
                    policy: request.policy,
                    fileName: preparedUpload.fileName,
                    size: preparedUpload.fileSize,
                    mimeType: preparedUpload.mimeType,
                    fileId: fileId,
                    metadata: preparedUpload.metadata
                ),
                idempotencyKey: idempotencyKey
            )
            await state.record(session: session)

            continuation.yield(
                FileFnForegroundUploadEvent(
                    kind: .sessionCreated,
                    fileId: fileId,
                    uploadSessionId: session.uploadSessionId,
                    uploadMode: session.uploadMode,
                    progress: FileFnForegroundUploadProgress(
                        bytesUploaded: 0,
                        totalBytes: preparedUpload.fileSize,
                        partsCompleted: 0,
                        totalParts: session.totalParts
                    )
                )
            )

            let chunks = FileFnChunker(
                fileSize: preparedUpload.fileSize,
                chunkSizeBytes: session.chunkSizeBytes
            ).chunks()

            guard chunks.count == session.totalParts else {
                throw FileFnClientError.invalidResponse(
                    reason: "Chunk plan did not match server-declared totalParts",
                    requestId: nil
                )
            }

            var bytesUploaded: Int64 = 0
            var partsCompleted = 0
            let token = session.uploadSessionToken

            for chunk in chunks {
                try Task.checkCancellation()

                let partData = try FileFnChunker.readChunk(from: preparedUpload.fileURL, chunk: chunk)
                let signature = try await client.signPart(
                    uploadSessionId: session.uploadSessionId,
                    partNumber: chunk.partNumber,
                    contentLength: chunk.size,
                    uploadSessionToken: token
                )
                let uploadedPart = try await client.uploadPart(
                    to: signature.url,
                    headers: signature.headers,
                    body: partData,
                    uploadSessionToken: token
                )

                if !uploadedPart.recorded {
                    let completion = try await client.completePart(
                        uploadSessionId: session.uploadSessionId,
                        partNumber: chunk.partNumber,
                        etag: uploadedPart.etag,
                        size: chunk.size,
                        uploadSessionToken: token
                    )
                    guard completion.recorded else {
                        throw FileFnClientError.invalidResponse(
                            reason: "Part completion response did not confirm recorded=true",
                            requestId: nil
                        )
                    }
                }

                bytesUploaded += Int64(chunk.size)
                partsCompleted += 1

                let progress = FileFnForegroundUploadProgress(
                    bytesUploaded: bytesUploaded,
                    totalBytes: preparedUpload.fileSize,
                    partsCompleted: partsCompleted,
                    totalParts: session.totalParts
                )

                continuation.yield(
                    FileFnForegroundUploadEvent(
                        kind: .partProgress,
                        fileId: fileId,
                        uploadSessionId: session.uploadSessionId,
                        uploadMode: session.uploadMode,
                        partNumber: chunk.partNumber,
                        progress: progress
                    )
                )
                continuation.yield(
                    FileFnForegroundUploadEvent(
                        kind: .partCompleted,
                        fileId: fileId,
                        uploadSessionId: session.uploadSessionId,
                        uploadMode: session.uploadMode,
                        partNumber: chunk.partNumber,
                        progress: progress
                    )
                )
            }

            let result = try await client.completeUpload(
                uploadSessionId: session.uploadSessionId,
                uploadSessionToken: token
            )
            continuation.yield(
                FileFnForegroundUploadEvent(
                    kind: .completed,
                    fileId: fileId,
                    uploadSessionId: session.uploadSessionId,
                    uploadMode: session.uploadMode,
                    progress: FileFnForegroundUploadProgress(
                        bytesUploaded: preparedUpload.fileSize,
                        totalBytes: preparedUpload.fileSize,
                        partsCompleted: session.totalParts,
                        totalParts: session.totalParts
                    ),
                    result: result
                )
            )
            await finish()
            return result
        } catch is CancellationError {
            let snapshot = await state.snapshot()
            if let uploadSessionId = snapshot.uploadSessionId {
                _ = try? await client.abortUpload(
                    uploadSessionId: uploadSessionId,
                    uploadSessionToken: snapshot.uploadSessionToken
                )
            }
            await finish(throwing: CancellationError())
            throw CancellationError()
        } catch {
            await finish(throwing: error)
            throw error
        }
    }
}

func fileFnInferMimeType(requestedMimeType: String?, fileName: String) -> String {
    if let requestedMimeType,
       !requestedMimeType.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
        return requestedMimeType
    }

    #if canImport(UniformTypeIdentifiers)
    let fileExtension = URL(fileURLWithPath: fileName).pathExtension
    if !fileExtension.isEmpty,
       let type = UTType(filenameExtension: fileExtension),
       let mimeType = type.preferredMIMEType {
        return mimeType
    }
    #endif

    return "application/octet-stream"
}
