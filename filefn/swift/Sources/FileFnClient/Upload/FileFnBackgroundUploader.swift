import Foundation

public actor FileFnBackgroundUploader {
    public let client: FileFnClient
    public let configuration: FileFnBackgroundUploadConfiguration
    public let preprocessors: [any FileFnUploadPreprocessor]

    private var activeUploads: [String: Task<FileFnCompletedUpload, Error>] = [:]
    private var terminalResults: [String: Result<FileFnCompletedUpload, Error>] = [:]

    public init(
        client: FileFnClient,
        configuration: FileFnBackgroundUploadConfiguration = FileFnBackgroundUploadConfiguration(),
        preprocessors: [any FileFnUploadPreprocessor] = [FileFnHEICPreprocessor()]
    ) {
        self.client = client
        self.configuration = configuration
        self.preprocessors = preprocessors
    }

    public func enqueue(_ request: FileFnForegroundUploadRequest) async throws -> FileFnBackgroundUploadSnapshot {
        let sourceURL = try requireBackgroundSourceURL(request.source)
        let uploadID = fileFnGenerateRandomIdentifier(prefix: "bg")
        let fileId = request.fileId ?? fileFnGenerateRandomIdentifier(prefix: "file")
        let idempotencyKey = request.idempotencyKey ?? fileFnGenerateRandomIdentifier(prefix: "idem")

        let preparedHandle = try await FileFnUploadPreparation.prepare(
            request: FileFnForegroundUploadRequest(
                source: .fileURL(sourceURL),
                policy: request.policy,
                fileName: request.fileName,
                mimeType: request.mimeType,
                metadata: request.metadata,
                fileId: request.fileId,
                idempotencyKey: request.idempotencyKey,
                preprocessors: request.preprocessors
            ),
            defaultPreprocessors: preprocessors
        )
        defer { preparedHandle.cleanup() }
        let preparedUpload = preparedHandle.upload

        await client.emitLog(
            FileFnLogEvent(
                level: .info,
                message: "Preparing background upload",
                uploadID: uploadID,
                metadata: [
                    "filePath": .string(preparedUpload.fileURL.path),
                    "fileName": .string(preparedUpload.fileName),
                ]
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

        let snapshot: FileFnBackgroundUploadSnapshot
        do {
            if let token = session.uploadSessionToken {
                try await configuration.secretStore.storeUploadSessionToken(token, uploadID: uploadID)
            }

            let chunkFiles = try createChunkFiles(
                sourceURL: preparedUpload.fileURL,
                uploadID: uploadID,
                fileSize: preparedUpload.fileSize,
                chunkSizeBytes: session.chunkSizeBytes
            )

            guard chunkFiles.count == session.totalParts else {
                throw FileFnClientError.invalidResponse(
                    reason: "Chunk plan did not match server-declared totalParts",
                    requestId: nil
                )
            }

            let now = fileFnISO8601Timestamp()
            snapshot = FileFnBackgroundUploadSnapshot(
                uploadID: uploadID,
                fileId: fileId,
                idempotencyKey: idempotencyKey,
                policy: request.policy,
                fileName: preparedUpload.fileName,
                mimeType: preparedUpload.mimeType,
                metadata: preparedUpload.metadata,
                uploadSessionId: session.uploadSessionId,
                totalParts: session.totalParts,
                chunkSizeBytes: session.chunkSizeBytes,
                fileSize: preparedUpload.fileSize,
                completedParts: [],
                chunkFileNames: chunkFiles,
                requiresUploadSessionToken: session.uploadSessionToken != nil,
                status: .running,
                createdAt: now,
                updatedAt: now
            )
            try await configuration.stateStore.saveSnapshot(snapshot)
        } catch {
            _ = try? await client.abortUpload(
                uploadSessionId: session.uploadSessionId,
                uploadSessionToken: session.uploadSessionToken
            )
            try? await cleanup(uploadID: uploadID)
            throw error
        }
        startUpload(snapshot: snapshot, reconcileWithServer: false)
        return snapshot
    }

    public func recover() async throws -> [FileFnBackgroundUploadSnapshot] {
        let stored = try await configuration.stateStore.loadSnapshots()
        let resumable = stored.filter { $0.status != .failed }
        var recovered: [FileFnBackgroundUploadSnapshot] = []

        for snapshot in resumable {
            if activeUploads[snapshot.uploadID] != nil {
                recovered.append(snapshot)
                continue
            }
            let validated = try await validateSnapshotForRecovery(snapshot)
            recovered.append(validated)
            startUpload(snapshot: validated, reconcileWithServer: true)
        }

        return recovered
    }

    public func waitForCompletion(uploadID: String) async throws -> FileFnCompletedUpload {
        if let terminal = terminalResults[uploadID] {
            return try terminal.get()
        }
        guard let task = activeUploads[uploadID] else {
            if let snapshot = try await configuration.stateStore.loadSnapshot(uploadID: uploadID),
               snapshot.status == .failed {
                throw FileFnClientError.backgroundStateCorrupt(
                    uploadID: uploadID,
                    reason: snapshot.lastError ?? "Background upload is in a failed state"
                )
            }
            throw FileFnClientError.backgroundStateCorrupt(
                uploadID: uploadID,
                reason: "No active or terminal background upload found"
            )
        }
        return try await task.value
    }

    public func cancel(uploadID: String) async throws {
        if let task = activeUploads[uploadID] {
            task.cancel()
            activeUploads.removeValue(forKey: uploadID)
            terminalResults[uploadID] = .failure(CancellationError())

            if let snapshot = try await configuration.stateStore.loadSnapshot(uploadID: uploadID) {
                let token = try? await loadToken(for: snapshot)
                Task {
                    _ = try? await client.abortUpload(
                        uploadSessionId: snapshot.uploadSessionId,
                        uploadSessionToken: token ?? nil
                    )
                }
                try await cleanup(uploadID: uploadID)
            }
            return
        }

        guard let snapshot = try await configuration.stateStore.loadSnapshot(uploadID: uploadID) else {
            return
        }
        let token = try await loadToken(for: snapshot)
        _ = try? await client.abortUpload(
            uploadSessionId: snapshot.uploadSessionId,
            uploadSessionToken: token
        )
        try await cleanup(uploadID: uploadID)
    }

    private func startUpload(snapshot: FileFnBackgroundUploadSnapshot, reconcileWithServer: Bool) {
        let client = self.client
        let configuration = self.configuration
        let task = Task<FileFnCompletedUpload, Error> {
            try await Self.runUpload(
                client: client,
                configuration: configuration,
                snapshot: snapshot,
                reconcileWithServer: reconcileWithServer
            )
        }
        activeUploads[snapshot.uploadID] = task

        Task {
            let result: Result<FileFnCompletedUpload, Error>
            do {
                result = .success(try await task.value)
            } catch {
                result = .failure(error)
            }
            self.finish(uploadID: snapshot.uploadID, result: result)
        }
    }

    private func finish(uploadID: String, result: Result<FileFnCompletedUpload, Error>) {
        activeUploads.removeValue(forKey: uploadID)
        terminalResults[uploadID] = result
    }

    private func validateSnapshotForRecovery(
        _ snapshot: FileFnBackgroundUploadSnapshot
    ) async throws -> FileFnBackgroundUploadSnapshot {
        let completed = Set(snapshot.completedParts)
        for partNumber in 1 ... snapshot.totalParts where !completed.contains(partNumber) {
            let chunkURL = chunkURL(uploadID: snapshot.uploadID, fileName: snapshot.chunkFileNames[partNumber] ?? "")
            guard FileManager.default.fileExists(atPath: chunkURL.path) else {
                let failed = snapshot.updating(status: .failed, lastError: "missing chunk file for part \(partNumber)")
                try await configuration.stateStore.saveSnapshot(failed)
                throw FileFnClientError.backgroundStateCorrupt(
                    uploadID: snapshot.uploadID,
                    reason: "missing chunk file for part \(partNumber)"
                )
            }
        }
        return snapshot
    }

    private func requireBackgroundSourceURL(_ source: FileFnUploadSource) throws -> URL {
        guard case .fileURL(let sourceURL) = source else {
            throw FileFnClientError.fileAccess(reason: "Background uploads require a disk-backed file URL source")
        }
        return sourceURL
    }

    private func createChunkFiles(
        sourceURL: URL,
        uploadID: String,
        fileSize: Int64,
        chunkSizeBytes: Int
    ) throws -> [Int: String] {
        let chunks = FileFnChunker(fileSize: fileSize, chunkSizeBytes: chunkSizeBytes).chunks()
        let uploadDirectory = workingUploadDirectory(uploadID: uploadID)
        let chunksDirectory = uploadDirectory.appendingPathComponent("chunks", isDirectory: true)
        try FileManager.default.createDirectory(at: chunksDirectory, withIntermediateDirectories: true)

        var chunkFiles: [Int: String] = [:]
        for chunk in chunks {
            let data = try FileFnChunker.readChunk(from: sourceURL, chunk: chunk)
            let fileName = "part-\(chunk.partNumber).bin"
            let fileURL = chunksDirectory.appendingPathComponent(fileName, isDirectory: false)
            try data.write(to: fileURL, options: .atomic)
            chunkFiles[chunk.partNumber] = fileName
        }
        return chunkFiles
    }

    private func loadToken(for snapshot: FileFnBackgroundUploadSnapshot) async throws -> String? {
        if snapshot.requiresUploadSessionToken {
            guard let token = try await configuration.secretStore.loadUploadSessionToken(uploadID: snapshot.uploadID) else {
                throw FileFnClientError.backgroundStateCorrupt(
                    uploadID: snapshot.uploadID,
                    reason: "missing upload session token"
                )
            }
            return token
        }
        return nil
    }

    private func cleanup(uploadID: String) async throws {
        try await configuration.secretStore.deleteUploadSessionToken(uploadID: uploadID)
        try await configuration.stateStore.deleteSnapshot(uploadID: uploadID)
        let workingDirectory = workingUploadDirectory(uploadID: uploadID)
        if FileManager.default.fileExists(atPath: workingDirectory.path) {
            try FileManager.default.removeItem(at: workingDirectory)
        }
    }

    private func workingUploadDirectory(uploadID: String) -> URL {
        configuration.workingDirectory
            .appendingPathComponent("uploads", isDirectory: true)
            .appendingPathComponent(uploadID, isDirectory: true)
    }

    private func chunkURL(uploadID: String, fileName: String) -> URL {
        workingUploadDirectory(uploadID: uploadID)
            .appendingPathComponent("chunks", isDirectory: true)
            .appendingPathComponent(fileName, isDirectory: false)
    }

    private static func runUpload(
        client: FileFnClient,
        configuration: FileFnBackgroundUploadConfiguration,
        snapshot originalSnapshot: FileFnBackgroundUploadSnapshot,
        reconcileWithServer: Bool
    ) async throws -> FileFnCompletedUpload {
        do {
            var snapshot = originalSnapshot
            let token = try await loadToken(configuration: configuration, snapshot: snapshot)

            if reconcileWithServer {
                let status = try await client.getUploadStatus(
                    uploadSessionId: snapshot.uploadSessionId,
                    uploadSessionToken: token
                )
                let reconciled = Set(snapshot.completedParts).union(status.recordedParts)
                snapshot = snapshot.updating(
                    completedParts: Array(reconciled).sorted(),
                    status: .running,
                    lastError: nil
                )
                try await configuration.stateStore.saveSnapshot(snapshot)
            }

            var completed = Set(snapshot.completedParts)
            for partNumber in 1 ... snapshot.totalParts where !completed.contains(partNumber) {
                try Task.checkCancellation()
                guard let chunkFileName = snapshot.chunkFileNames[partNumber] else {
                    throw FileFnClientError.backgroundStateCorrupt(
                        uploadID: snapshot.uploadID,
                        reason: "missing chunk metadata for part \(partNumber)"
                    )
                }
                let chunkURL = configuration.workingDirectory
                    .appendingPathComponent("uploads", isDirectory: true)
                    .appendingPathComponent(snapshot.uploadID, isDirectory: true)
                    .appendingPathComponent("chunks", isDirectory: true)
                    .appendingPathComponent(chunkFileName, isDirectory: false)
                guard FileManager.default.fileExists(atPath: chunkURL.path) else {
                    throw FileFnClientError.backgroundStateCorrupt(
                        uploadID: snapshot.uploadID,
                        reason: "missing chunk file for part \(partNumber)"
                    )
                }

                let fileSize = try chunkURL.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
                let signature = try await client.signPart(
                    uploadSessionId: snapshot.uploadSessionId,
                    partNumber: partNumber,
                    contentLength: fileSize,
                    uploadSessionToken: token
                )
                let body = try Data(contentsOf: chunkURL)
                let uploadedPart = try await client.uploadPart(
                    to: signature.url,
                    headers: signature.headers,
                    body: body,
                    uploadSessionToken: token
                )
                if !uploadedPart.recorded {
                    _ = try await client.completePart(
                        uploadSessionId: snapshot.uploadSessionId,
                        partNumber: partNumber,
                        etag: uploadedPart.etag,
                        size: body.count,
                        uploadSessionToken: token
                    )
                }

                completed.insert(partNumber)
                snapshot = snapshot.updating(
                    completedParts: Array(completed).sorted(),
                    status: .running,
                    lastError: nil
                )
                try await configuration.stateStore.saveSnapshot(snapshot)
            }

            let result = try await client.completeUpload(
                uploadSessionId: snapshot.uploadSessionId,
                uploadSessionToken: token
            )
            try await cleanup(configuration: configuration, uploadID: snapshot.uploadID)
            await client.emitLog(
                FileFnLogEvent(
                    level: .info,
                    message: "Background upload completed",
                    uploadID: snapshot.uploadID,
                    metadata: [
                        "fileId": .string(result.fileId),
                        "versionId": .string(result.versionId),
                    ]
                )
            )
            return result
        } catch is CancellationError {
            let token = try? await loadToken(configuration: configuration, snapshot: originalSnapshot)
            _ = try? await client.abortUpload(
                uploadSessionId: originalSnapshot.uploadSessionId,
                uploadSessionToken: token ?? nil
            )
            try await cleanup(configuration: configuration, uploadID: originalSnapshot.uploadID)
            throw CancellationError()
        } catch {
            let failed = originalSnapshot.updating(status: .failed, lastError: String(describing: error))
            try? await configuration.stateStore.saveSnapshot(failed)
            await client.emitLog(
                FileFnLogEvent(
                    level: .error,
                    message: "Background upload failed",
                    uploadID: originalSnapshot.uploadID,
                    metadata: [
                        "error": .string(String(describing: error)),
                    ]
                )
            )
            throw error
        }
    }

    private static func loadToken(
        configuration: FileFnBackgroundUploadConfiguration,
        snapshot: FileFnBackgroundUploadSnapshot
    ) async throws -> String? {
        if snapshot.requiresUploadSessionToken {
            guard let token = try await configuration.secretStore.loadUploadSessionToken(uploadID: snapshot.uploadID) else {
                throw FileFnClientError.backgroundStateCorrupt(
                    uploadID: snapshot.uploadID,
                    reason: "missing upload session token"
                )
            }
            return token
        }
        return nil
    }

    private static func cleanup(
        configuration: FileFnBackgroundUploadConfiguration,
        uploadID: String
    ) async throws {
        try await configuration.secretStore.deleteUploadSessionToken(uploadID: uploadID)
        try await configuration.stateStore.deleteSnapshot(uploadID: uploadID)

        let uploadDirectory = configuration.workingDirectory
            .appendingPathComponent("uploads", isDirectory: true)
            .appendingPathComponent(uploadID, isDirectory: true)
        if FileManager.default.fileExists(atPath: uploadDirectory.path) {
            try FileManager.default.removeItem(at: uploadDirectory)
        }
    }
}

func fileFnISO8601Timestamp() -> String {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime]
    return formatter.string(from: Date())
}
