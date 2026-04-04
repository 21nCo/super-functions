import FileFnClient
import Foundation

private struct FileFnBridgeListFilesPayload: Codable, Sendable { let cursor: String?; let limit: Int? }
private struct FileFnBridgeFilePayload: Codable, Sendable { let fileId: String }
private struct FileFnBridgeVersionPayload: Codable, Sendable { let fileId: String; let versionId: String }
private struct FileFnBridgeDownloadPayload: Codable, Sendable { let fileId: String; let versionId: String? }
private struct FileFnBridgeArtifactPayload: Codable, Sendable { let fileId: String; let artifactId: String }
private struct FileFnBridgeRenderPayload: Codable, Sendable { let fileId: String; let intent: FileFnRenderIntent; let versionId: String? }
private struct FileFnBridgeGrantCreatePayload: Codable, Sendable { let fileId: String; let request: FileFnCreateGrantRequest }
private struct FileFnBridgeGrantRevokePayload: Codable, Sendable { let fileId: String; let permissionId: String }
private struct FileFnBridgeShareCreatePayload: Codable, Sendable { let fileId: String; let request: FileFnCreateShareLinkRequest }
private struct FileFnBridgeShareRevokePayload: Codable, Sendable { let fileId: String; let token: String }
private struct FileFnBridgeShareDownloadPayload: Codable, Sendable { let token: String }
private struct FileFnBridgeProcessingPayload: Codable, Sendable { let fileId: String; let request: FileFnTriggerProcessingRequest }

private struct FileFnBridgeUploadEntry: Sendable, Equatable {
    let uploadID: String
    let fileId: String
    let background: Bool
    var state: String
    var bytesSent: Int64
    var bytesExpected: Int64
    var result: FileFnCompletedUpload?
    var error: FileFnBridgeError?
}

public actor FileFnBridgeDispatcher {
    public let configuration: FileFnWebViewBridgeConfiguration
    public let client: FileFnClient?
    public let assetRegistry: FileFnNativeAssetRegistry
    public let eventEmitter: FileFnBridgeEventEmitter
    public let foregroundUploader: FileFnForegroundUploader?
    public let backgroundUploader: FileFnBackgroundUploader?

    private var handshakeCompleted = false
    private var uploads: [String: FileFnBridgeUploadEntry] = [:]
    private var foregroundTasks: [String: FileFnUploadTask] = [:]
    private var foregroundEventTasks: [String: Task<Void, Never>] = [:]

    public init(
        configuration: FileFnWebViewBridgeConfiguration,
        client: FileFnClient?,
        assetRegistry: FileFnNativeAssetRegistry,
        eventEmitter: FileFnBridgeEventEmitter,
        foregroundUploader: FileFnForegroundUploader? = nil,
        backgroundUploader: FileFnBackgroundUploader? = nil
    ) {
        self.configuration = configuration
        self.client = client
        self.assetRegistry = assetRegistry
        self.eventEmitter = eventEmitter
        self.foregroundUploader = foregroundUploader ?? client.map { FileFnForegroundUploader(client: $0) }
        self.backgroundUploader = backgroundUploader ?? client.map { FileFnBackgroundUploader(client: $0) }
    }

    public func dispatch(rawMessage: Any) async -> FileFnBridgeResponseEnvelope {
        let request: FileFnBridgeRequestEnvelope
        do {
            request = try fileFnBridgeDecodeRequestEnvelope(from: rawMessage)
        } catch let error as FileFnBridgeError {
            return fileFnBridgeFailure(id: "unknown", code: error.code, message: error.message, details: error.details)
        } catch {
            return fileFnBridgeFailure(id: "unknown", code: "BRIDGE_INVALID_REQUEST", message: "Unable to decode bridge request")
        }

        guard request.protocolVersion == FILEFN_BRIDGE_PROTOCOL else {
            return fileFnBridgeFailure(
                id: request.id,
                code: "BRIDGE_PROTOCOL_MISMATCH",
                message: "Bridge protocol version mismatch",
                details: ["path": .string("protocol")]
            )
        }

        guard isFileFnBridgeMethod(request.method) else {
            return fileFnBridgeFailure(
                id: request.id,
                code: "BRIDGE_METHOD_UNSUPPORTED",
                message: "Unsupported bridge method",
                details: ["method": .string(request.method)]
            )
        }

        if request.method != "handshake", !handshakeCompleted {
            return fileFnBridgeFailure(
                id: request.id,
                code: "BRIDGE_HANDSHAKE_REQUIRED",
                message: "handshake must complete before native-backed requests"
            )
        }

        do {
            return try await dispatchValidated(request)
        } catch let error as FileFnBridgeError {
            return .failure(id: request.id, error: error)
        } catch let error as FileFnClientError {
            return .failure(id: request.id, error: fileFnBridgeMap(error))
        } catch {
            return fileFnBridgeFailure(
                id: request.id,
                code: "FILEFN_CLIENT_ERROR",
                message: String(describing: error)
            )
        }
    }

    public func resetHandshake() {
        handshakeCompleted = false
    }

    private func dispatchValidated(_ request: FileFnBridgeRequestEnvelope) async throws -> FileFnBridgeResponseEnvelope {
        switch request.method {
        case "handshake":
            return try await handleHandshake(request)
        case "file.list":
            let payload = try fileFnBridgeDecodePayload(request.payload, as: FileFnBridgeListFilesPayload.self)
            return try await success(request.id, try await requireClient().listFiles(cursor: payload.cursor, limit: payload.limit))
        case "file.get":
            let payload = try fileFnBridgeDecodePayload(request.payload, as: FileFnBridgeFilePayload.self)
            return try await success(request.id, try await requireClient().getFile(fileId: payload.fileId))
        case "file.delete":
            let payload = try fileFnBridgeDecodePayload(request.payload, as: FileFnBridgeFilePayload.self)
            try await requireClient().deleteFile(fileId: payload.fileId)
            return .success(id: request.id, result: .object(["deleted": .bool(true)]))
        case "version.list":
            let payload = try fileFnBridgeDecodePayload(request.payload, as: FileFnBridgeFilePayload.self)
            return try await success(request.id, try await requireClient().listVersions(fileId: payload.fileId))
        case "version.get":
            let payload = try fileFnBridgeDecodePayload(request.payload, as: FileFnBridgeVersionPayload.self)
            return try await success(request.id, try await requireClient().getVersion(fileId: payload.fileId, versionId: payload.versionId))
        case "download.resolve":
            let payload = try fileFnBridgeDecodePayload(request.payload, as: FileFnBridgeDownloadPayload.self)
            return try await success(request.id, try await requireClient().downloadURL(fileId: payload.fileId, versionId: payload.versionId))
        case "artifact.list":
            let payload = try fileFnBridgeDecodePayload(request.payload, as: FileFnBridgeFilePayload.self)
            return try await success(request.id, try await requireClient().listArtifacts(fileId: payload.fileId))
        case "artifact.download":
            let payload = try fileFnBridgeDecodePayload(request.payload, as: FileFnBridgeArtifactPayload.self)
            return try await success(request.id, try await requireClient().downloadArtifact(fileId: payload.fileId, artifactId: payload.artifactId))
        case "render.resolve":
            let payload = try fileFnBridgeDecodePayload(request.payload, as: FileFnBridgeRenderPayload.self)
            return try await success(
                request.id,
                try await requireClient().resolveRenderable(fileId: payload.fileId, intent: payload.intent, versionId: payload.versionId)
            )
        case "policy.list":
            return try await success(request.id, try await requireClient().listPolicies())
        case "quota.get":
            return try await success(request.id, try await requireClient().getStorageQuota())
        case "grant.create":
            let payload = try fileFnBridgeDecodePayload(request.payload, as: FileFnBridgeGrantCreatePayload.self)
            return try await success(request.id, try await requireClient().createGrant(fileId: payload.fileId, request: payload.request))
        case "grant.list":
            let payload = try fileFnBridgeDecodePayload(request.payload, as: FileFnBridgeFilePayload.self)
            return try await success(request.id, try await requireClient().listGrants(fileId: payload.fileId))
        case "grant.revoke":
            let payload = try fileFnBridgeDecodePayload(request.payload, as: FileFnBridgeGrantRevokePayload.self)
            try await requireClient().revokeGrant(fileId: payload.fileId, permissionId: payload.permissionId)
            return .success(id: request.id, result: .object(["revoked": .bool(true)]))
        case "share.create":
            let payload = try fileFnBridgeDecodePayload(request.payload, as: FileFnBridgeShareCreatePayload.self)
            return try await success(request.id, try await requireClient().createShareLink(fileId: payload.fileId, request: payload.request))
        case "share.list":
            let payload = try fileFnBridgeDecodePayload(request.payload, as: FileFnBridgeFilePayload.self)
            return try await success(request.id, try await requireClient().listShareLinks(fileId: payload.fileId))
        case "share.revoke":
            let payload = try fileFnBridgeDecodePayload(request.payload, as: FileFnBridgeShareRevokePayload.self)
            try await requireClient().revokeShareLink(fileId: payload.fileId, token: payload.token)
            return .success(id: request.id, result: .object(["revoked": .bool(true)]))
        case "share.download.resolve":
            let payload = try fileFnBridgeDecodePayload(request.payload, as: FileFnBridgeShareDownloadPayload.self)
            return try await success(request.id, try await requireClient().resolveShareDownload(token: payload.token))
        case "processing.trigger":
            let payload = try fileFnBridgeDecodePayload(request.payload, as: FileFnBridgeProcessingPayload.self)
            return try await success(request.id, try await requireClient().triggerProcessing(fileId: payload.fileId, request: payload.request))
        case "upload.start":
            let payload = try fileFnBridgeDecodePayload(request.payload, as: FileFnBridgeUploadStartPayload.self)
            return try await handleUploadStart(request.id, payload: payload)
        case "upload.status":
            let payload = try fileFnBridgeDecodePayload(request.payload, as: FileFnBridgeUploadStatusPayload.self)
            return try await success(request.id, try requireUpload(uploadID: payload.uploadID).statusResult())
        case "upload.abort":
            let payload = try fileFnBridgeDecodePayload(request.payload, as: FileFnBridgeUploadAbortPayload.self)
            return try await handleUploadAbort(request.id, uploadID: payload.uploadID)
        case "health.check":
            return .success(
                id: request.id,
                result: .object([
                    "status": .string("ready"),
                    "bridgeVersion": .number(Double(configuration.bridgeVersion)),
                    "capabilities": .array(FILEFN_BRIDGE_CAPABILITIES.map(FileFnJSONValue.string)),
                ])
            )
        default:
            return fileFnBridgeFailure(
                id: request.id,
                code: "BRIDGE_METHOD_UNSUPPORTED",
                message: "Unsupported bridge method",
                details: ["method": .string(request.method)]
            )
        }
    }

    private func handleHandshake(_ request: FileFnBridgeRequestEnvelope) async throws -> FileFnBridgeResponseEnvelope {
        let payload = try fileFnBridgeDecodePayload(request.payload, as: FileFnBridgeHandshakePayload.self)
        guard payload.mode == "native-backed" else {
            return fileFnBridgeFailure(
                id: request.id,
                code: "BRIDGE_PROTOCOL_MISMATCH",
                message: "Native-backed mode mismatch",
                details: ["expectedMode": .string("native-backed")]
            )
        }

        handshakeCompleted = true
        let result = FileFnBridgeHandshakeResult(
            bridgeVersion: configuration.bridgeVersion,
            uploadOwner: "native",
            authOwner: "native",
            previewScheme: configuration.previewScheme,
            capabilities: FILEFN_BRIDGE_CAPABILITIES
        )
        eventEmitter.emit(
            event: "bridge.ready",
            payload: try fileFnBridgeEncodeResult(result)
        )
        return try await success(request.id, result)
    }

    private func handleUploadStart(
        _ requestID: String,
        payload: FileFnBridgeUploadStartPayload
    ) async throws -> FileFnBridgeResponseEnvelope {
        guard let assetHandle = payload.assetHandle else {
            return fileFnBridgeFailure(
                id: requestID,
                code: "BRIDGE_INVALID_SOURCE",
                message: "Native-backed uploads require assetHandle"
            )
        }

        let descriptor = try await assetRegistry.descriptor(for: assetHandle)
        let fileURL = try await assetRegistry.fileURL(for: assetHandle)
        let uploadRequest = FileFnForegroundUploadRequest(
            source: .fileURL(fileURL),
            policy: payload.policy,
            fileName: descriptor.fileName,
            mimeType: descriptor.mimeType,
            metadata: payload.metadata,
            fileId: payload.fileId,
            idempotencyKey: payload.idempotencyKey
        )

        if payload.background {
            guard let backgroundUploader else {
                throw FileFnBridgeError(code: "BRIDGE_UNAVAILABLE", message: "Background uploader is unavailable")
            }

            let snapshot = try await backgroundUploader.enqueue(uploadRequest)
            let entry = FileFnBridgeUploadEntry(
                uploadID: snapshot.uploadID,
                fileId: snapshot.fileId,
                background: true,
                state: "running",
                bytesSent: 0,
                bytesExpected: snapshot.fileSize,
                result: nil,
                error: nil
            )
            uploads[snapshot.uploadID] = entry
            eventEmitter.emit(
                event: "upload.progress",
                payload: .object([
                    "uploadID": .string(snapshot.uploadID),
                    "fileId": .string(snapshot.fileId),
                    "bytesSent": .number(0),
                    "bytesExpected": .number(Double(snapshot.fileSize)),
                ])
            )

            Task { [weak self] in
                guard let self else { return }
                do {
                    let result = try await backgroundUploader.waitForCompletion(uploadID: snapshot.uploadID)
                    await self.completeUpload(uploadID: snapshot.uploadID, result: result)
                } catch is CancellationError {
                    await self.cancelUpload(uploadID: snapshot.uploadID)
                } catch {
                    await self.failUpload(uploadID: snapshot.uploadID, error: self.mapBridgeError(error))
                }
            }

            return try await success(
                requestID,
                FileFnBridgeUploadStartResult(uploadID: snapshot.uploadID, fileId: snapshot.fileId)
            )
        }

        guard let foregroundUploader else {
            throw FileFnBridgeError(code: "BRIDGE_UNAVAILABLE", message: "Foreground uploader is unavailable")
        }

        let bridgeUploadID = fileFnBridgeGenerateIdentifier(prefix: "upload")
        let task = foregroundUploader.upload(uploadRequest)
        uploads[bridgeUploadID] = FileFnBridgeUploadEntry(
            uploadID: bridgeUploadID,
            fileId: task.fileId,
            background: false,
            state: "running",
            bytesSent: 0,
            bytesExpected: 0,
            result: nil,
            error: nil
        )
        foregroundTasks[bridgeUploadID] = task
        foregroundEventTasks[bridgeUploadID] = Task { [weak self] in
            guard let self else { return }
            do {
                for try await event in task.events {
                    await self.forwardForegroundEvent(uploadID: bridgeUploadID, event: event)
                }
                let result = try await task.value()
                await self.completeUpload(uploadID: bridgeUploadID, result: result)
            } catch is CancellationError {
                await self.cancelUpload(uploadID: bridgeUploadID)
            } catch {
                await self.failUpload(uploadID: bridgeUploadID, error: self.mapBridgeError(error))
            }
        }

        return try await success(
            requestID,
            FileFnBridgeUploadStartResult(uploadID: bridgeUploadID, fileId: task.fileId)
        )
    }

    private func forwardForegroundEvent(uploadID: String, event: FileFnForegroundUploadEvent) {
        guard var entry = uploads[uploadID] else {
            return
        }

        entry.bytesSent = event.progress.bytesUploaded
        entry.bytesExpected = event.progress.totalBytes
        entry.state = event.kind == .completed ? "completed" : "running"
        uploads[uploadID] = entry

        if event.kind == .partProgress || event.kind == .partCompleted || event.kind == .completed {
            eventEmitter.emit(
                event: "upload.progress",
                payload: .object([
                    "uploadID": .string(uploadID),
                    "fileId": .string(entry.fileId),
                    "bytesSent": .number(Double(event.progress.bytesUploaded)),
                    "bytesExpected": .number(Double(event.progress.totalBytes)),
                ])
            )
        }
    }

    private func handleUploadAbort(_ requestID: String, uploadID: String) async throws -> FileFnBridgeResponseEnvelope {
        guard let entry = uploads[uploadID] else {
            return fileFnBridgeFailure(
                id: requestID,
                code: "BRIDGE_UPLOAD_NOT_FOUND",
                message: "Bridge upload ID was not found",
                details: ["uploadID": .string(uploadID)]
            )
        }

        if entry.state == "completed" || entry.state == "failed" {
            return try await success(requestID, FileFnBridgeUploadAbortResult(uploadID: uploadID, aborted: false))
        }
        if entry.state == "cancelled" {
            return try await success(requestID, FileFnBridgeUploadAbortResult(uploadID: uploadID, aborted: true))
        }

        if entry.background {
            try await backgroundUploader?.cancel(uploadID: uploadID)
        } else {
            foregroundTasks[uploadID]?.cancel()
        }
        cancelUpload(uploadID: uploadID)
        return try await success(requestID, FileFnBridgeUploadAbortResult(uploadID: uploadID, aborted: true))
    }

    private func completeUpload(uploadID: String, result: FileFnCompletedUpload) {
        guard var entry = uploads[uploadID] else {
            return
        }
        entry.state = "completed"
        if entry.bytesExpected > 0 {
            entry.bytesSent = max(entry.bytesSent, entry.bytesExpected)
        }
        entry.result = result
        uploads[uploadID] = entry
        foregroundTasks.removeValue(forKey: uploadID)
        foregroundEventTasks.removeValue(forKey: uploadID)?.cancel()
        eventEmitter.emit(
            event: "upload.completed",
            payload: .object([
                "uploadID": .string(uploadID),
                "result": (try? fileFnBridgeEncodeResult(FileFnBridgeCompletedUpload(result))) ?? .null,
            ])
        )
    }

    private func failUpload(uploadID: String, error: FileFnBridgeError) {
        guard var entry = uploads[uploadID] else {
            return
        }
        entry.state = "failed"
        entry.error = error
        uploads[uploadID] = entry
        foregroundTasks.removeValue(forKey: uploadID)
        foregroundEventTasks.removeValue(forKey: uploadID)?.cancel()
        eventEmitter.emit(
            event: "upload.failed",
            payload: .object([
                "uploadID": .string(uploadID),
                "error": .object([
                    "code": .string(error.code),
                    "message": .string(error.message),
                    "details": .object(error.details),
                ]),
            ])
        )
    }

    private func cancelUpload(uploadID: String) {
        guard var entry = uploads[uploadID] else {
            foregroundTasks.removeValue(forKey: uploadID)
            foregroundEventTasks.removeValue(forKey: uploadID)?.cancel()
            return
        }

        let terminalStates = Set(["cancelled", "completed", "failed"])
        guard !terminalStates.contains(entry.state) else {
            foregroundTasks.removeValue(forKey: uploadID)
            foregroundEventTasks.removeValue(forKey: uploadID)?.cancel()
            return
        }

        entry.state = "cancelled"
        uploads[uploadID] = entry
        foregroundTasks.removeValue(forKey: uploadID)
        foregroundEventTasks.removeValue(forKey: uploadID)?.cancel()
        eventEmitter.emit(
            event: "upload.cancelled",
            payload: .object(["uploadID": .string(uploadID)])
        )
    }

    private func requireClient() throws -> FileFnClient {
        guard let client else {
            throw FileFnBridgeError(code: "BRIDGE_UNAVAILABLE", message: "FileFn client is unavailable")
        }
        return client
    }

    private func requireUpload(uploadID: String) throws -> FileFnBridgeUploadEntry {
        guard let entry = uploads[uploadID] else {
            throw FileFnBridgeError(
                code: "BRIDGE_UPLOAD_NOT_FOUND",
                message: "Bridge upload ID was not found",
                details: ["uploadID": .string(uploadID)]
            )
        }
        return entry
    }

    private func success<T: Encodable>(_ id: String, _ value: T) async throws -> FileFnBridgeResponseEnvelope {
        let payload = try fileFnBridgeEncodeResult(value)
        return .success(id: id, result: fileFnBridgeSanitize(payload))
    }

    private func fileFnBridgeMap(_ error: FileFnClientError) -> FileFnBridgeError {
        switch error {
        case .server(let status, let payload, let requestId):
            var details = payload.details
            details["status"] = .number(Double(status))
            if let requestId {
                details["requestId"] = .string(requestId)
            }
            return FileFnBridgeError(code: payload.code, message: payload.message, details: details)
        case .capabilityUnavailable(let capability, let status, let requestId):
            var details: [String: FileFnJSONValue] = [
                "capability": .string(capability.rawValue),
                "status": .number(Double(status)),
            ]
            if let requestId {
                details["requestId"] = .string(requestId)
            }
            return FileFnBridgeError(code: "FILEFN_CAPABILITY_UNAVAILABLE", message: "Capability route family is unavailable", details: details)
        case .configurationInvalid(let field, let message):
            return FileFnBridgeError(code: "FILEFN_CLIENT_ERROR", message: message, details: ["field": .string(field)])
        case .invalidResponse(let reason, let requestId):
            var details: [String: FileFnJSONValue] = [:]
            if let requestId {
                details["requestId"] = .string(requestId)
            }
            return FileFnBridgeError(code: "FILEFN_CLIENT_ERROR", message: reason, details: details)
        case .transport(let status, let requestId, let bodySnippet):
            var details: [String: FileFnJSONValue] = [:]
            if let status {
                details["status"] = .number(Double(status))
            }
            if let requestId {
                details["requestId"] = .string(requestId)
            }
            if let bodySnippet {
                details["bodySnippet"] = .string(bodySnippet)
            }
            return FileFnBridgeError(code: "FILEFN_CLIENT_ERROR", message: "Transport failure", details: details)
        case .fileAccess(let reason):
            return FileFnBridgeError(code: "FILEFN_CLIENT_ERROR", message: reason)
        case .preprocessingFailed(let code, let message):
            return FileFnBridgeError(code: code, message: message)
        case .backgroundStateCorrupt(let uploadID, let reason):
            return FileFnBridgeError(code: "FILEFN_CLIENT_ERROR", message: reason, details: ["uploadID": .string(uploadID)])
        }
    }

    private func mapBridgeError(_ error: Error) -> FileFnBridgeError {
        if let bridgeError = error as? FileFnBridgeError {
            return bridgeError
        }
        if let clientError = error as? FileFnClientError {
            return fileFnBridgeMap(clientError)
        }
        if error is CancellationError {
            return FileFnBridgeError(code: "FILEFN_CLIENT_ERROR", message: "Upload cancelled")
        }
        return FileFnBridgeError(code: "FILEFN_CLIENT_ERROR", message: String(describing: error))
    }
}

private extension FileFnBridgeUploadEntry {
    func statusResult() -> FileFnBridgeUploadStatusResult {
        FileFnBridgeUploadStatusResult(
            uploadID: uploadID,
            fileId: fileId,
            state: state,
            bytesSent: bytesSent,
            bytesExpected: bytesExpected,
            background: background,
            result: result.map(FileFnBridgeCompletedUpload.init),
            error: error
        )
    }
}

private func fileFnBridgeGenerateIdentifier(prefix: String) -> String {
    let suffix = UUID().uuidString.replacingOccurrences(of: "-", with: "").lowercased()
    return "\(prefix)_\(suffix)"
}
