import Foundation

private struct FileFnSignPartRequest: Encodable, Sendable {
    let contentLength: Int
}

private struct FileFnCompletePartRequest: Encodable, Sendable {
    let etag: String
    let size: Int
}

private struct FileFnProxyUploadPartEnvelope: Decodable, Sendable {
    let etag: String
    let size: Int
    let recorded: Bool
}

private func fileFnUploadPathComponent(_ value: String) -> String {
    value.addingPercentEncoding(
        withAllowedCharacters: CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "-._~"))
    ) ?? value
}

extension FileFnClient {
    public func createUploadSession(
        request: FileFnCreateUploadSessionRequest,
        idempotencyKey: String? = nil
    ) async throws -> FileFnUploadSession {
        let response = try await executor.execute(
            method: "POST",
            path: "/upload/init",
            body: request,
            hasIdempotencyKey: idempotencyKey != nil,
            extraHeaders: idempotencyKey.map { ["x-idempotency-key": $0] } ?? [:],
            responseType: FileFnUploadSession.self
        )
        return response.value
    }

    public func getUploadStatus(
        uploadSessionId: String,
        uploadSessionToken: String? = nil
    ) async throws -> FileFnUploadStatus {
        let response = try await executor.execute(
            method: "GET",
            path: "/upload/\(fileFnUploadPathComponent(uploadSessionId))/status",
            requiresUploadSessionToken: true,
            extraHeaders: uploadSessionToken.map { ["x-upload-session-token": $0] } ?? [:],
            responseType: FileFnUploadStatus.self
        )
        return response.value
    }

    public func signPart(
        uploadSessionId: String,
        partNumber: Int,
        contentLength: Int,
        uploadSessionToken: String? = nil
    ) async throws -> FileFnUploadPartSignature {
        let response = try await executor.execute(
            method: "POST",
            path: "/upload/\(fileFnUploadPathComponent(uploadSessionId))/parts/\(partNumber)/sign",
            body: FileFnSignPartRequest(contentLength: contentLength),
            requiresUploadSessionToken: true,
            extraHeaders: uploadSessionToken.map { ["x-upload-session-token": $0] } ?? [:],
            responseType: FileFnUploadPartSignature.self
        )
        return try response.value.resolved(against: normalizedBaseURL, requestId: response.requestId)
    }

    func uploadPart(
        to url: URL,
        headers: [String: String],
        body: Data,
        uploadSessionToken: String? = nil
    ) async throws -> FileFnUploadedPart {
        var request = URLRequest(url: url)
        request.httpMethod = "PUT"
        request.httpBody = body
        request.setValue(String(body.count), forHTTPHeaderField: "content-length")
        for (key, value) in headers.sorted(by: { $0.key < $1.key }) {
            request.setValue(value, forHTTPHeaderField: key)
        }
        if let uploadSessionToken {
            request.setValue(uploadSessionToken, forHTTPHeaderField: "x-upload-session-token")
        }

        do {
            let (data, response) = try await configuration.urlSession.data(for: request)
            guard let httpResponse = response as? HTTPURLResponse else {
                throw FileFnClientError.transport(
                    status: nil,
                    requestId: nil,
                    bodySnippet: "Response was not an HTTP response"
                )
            }

            let contentType = httpResponse.value(forHTTPHeaderField: "content-type")
            let requestIdHint = httpResponse.value(forHTTPHeaderField: "x-request-id")

            if (200 ..< 300).contains(httpResponse.statusCode) {
                if contentType?.lowercased().contains("application/json") == true {
                    let envelope = try configuration.jsonDecoder.decode(
                        FileFnEnvelope<FileFnProxyUploadPartEnvelope>.self,
                        from: data
                    )
                    let value = try envelope.validatedValue()
                    return FileFnUploadedPart(
                        etag: value.etag,
                        size: value.size,
                        recorded: value.recorded
                    )
                }

                guard let etag = httpResponse.value(forHTTPHeaderField: "etag"),
                      !etag.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
                    throw FileFnClientError.invalidResponse(
                        reason: "Signed upload response did not include an ETag header",
                        requestId: requestIdHint
                    )
                }

                return FileFnUploadedPart(etag: etag, size: body.count, recorded: false)
            }

            if let envelope = try? configuration.jsonDecoder.decode(
                FileFnEnvelope<FileFnJSONValue>.self,
                from: data
            ),
               let payload = envelope.error {
                throw FileFnClientError.server(
                    status: httpResponse.statusCode,
                    payload: payload,
                    requestId: envelope.requestId ?? requestIdHint
                )
            }

            throw FileFnErrorClassifier.classifyFailure(
                status: httpResponse.statusCode,
                requestId: requestIdHint,
                payload: nil,
                contentType: contentType,
                bodySnippet: String(data: data.prefix(256), encoding: .utf8),
                capability: nil
            )
        } catch is CancellationError {
            throw CancellationError()
        } catch let error as FileFnClientError {
            throw error
        } catch {
            throw FileFnClientError.transport(
                status: nil,
                requestId: nil,
                bodySnippet: error.localizedDescription
            )
        }
    }

    public func completePart(
        uploadSessionId: String,
        partNumber: Int,
        etag: String,
        size: Int,
        uploadSessionToken: String? = nil
    ) async throws -> FileFnRecordedUploadPart {
        let response = try await executor.execute(
            method: "POST",
            path: "/upload/\(fileFnUploadPathComponent(uploadSessionId))/parts/\(partNumber)/complete",
            body: FileFnCompletePartRequest(etag: etag, size: size),
            requiresUploadSessionToken: true,
            extraHeaders: uploadSessionToken.map { ["x-upload-session-token": $0] } ?? [:],
            responseType: FileFnRecordedUploadPart.self
        )
        return response.value
    }

    public func completeUpload(
        uploadSessionId: String,
        uploadSessionToken: String? = nil
    ) async throws -> FileFnCompletedUpload {
        let response = try await executor.execute(
            method: "POST",
            path: "/upload/\(fileFnUploadPathComponent(uploadSessionId))/complete",
            requiresUploadSessionToken: true,
            extraHeaders: uploadSessionToken.map { ["x-upload-session-token": $0] } ?? [:],
            responseType: FileFnCompletedUpload.self
        )
        return response.value
    }

    public func abortUpload(
        uploadSessionId: String,
        uploadSessionToken: String? = nil
    ) async throws -> FileFnAbortedUpload {
        let response = try await executor.execute(
            method: "POST",
            path: "/upload/\(fileFnUploadPathComponent(uploadSessionId))/abort",
            requiresUploadSessionToken: true,
            extraHeaders: uploadSessionToken.map { ["x-upload-session-token": $0] } ?? [:],
            responseType: FileFnAbortedUpload.self
        )
        return response.value
    }
}
