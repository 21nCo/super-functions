import Foundation

struct FileFnRequestExecutor: Sendable {
    let configuration: FileFnClientConfiguration
    let normalizedBaseURL: URL

    struct DecodedResponse<Value: Sendable>: Sendable {
        let value: Value
        let warnings: [String]
        let requestId: String?
    }

    func buildRequest(
        method: String,
        path: String,
        query: [String: String?] = [:],
        body: (any Encodable)? = nil,
        requiresUploadSessionToken: Bool,
        hasIdempotencyKey: Bool = false,
        extraHeaders: [String: String] = [:]
    ) async throws -> URLRequest {
        let base = normalizedBaseURL.absoluteString
        let normalizedPath = path.hasPrefix("/") ? String(path.dropFirst()) : path
        guard var components = URLComponents(string: "\(base)/\(normalizedPath)") else {
            throw FileFnClientError.configurationInvalid(
                field: "baseURL",
                message: "Unable to construct request URL"
            )
        }

        let queryItems = query
            .filter { $0.value != nil }
            .sorted { $0.key < $1.key }
            .map { URLQueryItem(name: $0.key, value: $0.value) }
        if !queryItems.isEmpty {
            components.queryItems = queryItems
        }

        guard let url = components.url else {
            throw FileFnClientError.configurationInvalid(
                field: "baseURL",
                message: "Unable to resolve request URL"
            )
        }

        var request = URLRequest(url: url)
        request.httpMethod = method.uppercased()
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        for (key, value) in configuration.defaultHeaders {
            request.setValue(value, forHTTPHeaderField: key)
        }

        if let authProvider = configuration.authProvider {
            let authHeaders = try await authProvider.headers(
                for: FileFnAuthContext(
                    method: method.uppercased(),
                    path: path,
                    requiresUploadSessionToken: requiresUploadSessionToken
                )
            )
            for (key, value) in authHeaders {
                request.setValue(value, forHTTPHeaderField: key)
            }
        }

        if let requestID = configuration.requestIDProvider?()?.trimmingCharacters(in: .whitespacesAndNewlines),
           !requestID.isEmpty {
            request.setValue(requestID, forHTTPHeaderField: "x-request-id")
        }

        if configuration.sendClientVersionHeader {
            request.setValue("filefn-swift/0.0.1", forHTTPHeaderField: "x-filefn-client-version")
        }

        for (key, value) in extraHeaders.sorted(by: { $0.key < $1.key }) {
            request.setValue(value, forHTTPHeaderField: key)
        }

        if let body {
            do {
                request.httpBody = try configuration.jsonEncoder.encode(AnyEncodable(body))
            } catch {
                throw FileFnClientError.invalidResponse(
                    reason: "Failed to encode request body",
                    requestId: request.value(forHTTPHeaderField: "x-request-id")
                )
            }
        }

        return request
    }

    func execute<Value: Decodable & Sendable>(
        method: String,
        path: String,
        query: [String: String?] = [:],
        body: (any Encodable)? = nil,
        requiresUploadSessionToken: Bool = false,
        hasIdempotencyKey: Bool = false,
        extraHeaders: [String: String] = [:],
        capability: FileFnCapability? = nil,
        responseType: Value.Type = Value.self
    ) async throws -> DecodedResponse<Value> {
        var attempt = 0
        while true {
            attempt += 1
            let request = try await buildRequest(
                method: method,
                path: path,
                query: query,
                body: body,
                requiresUploadSessionToken: requiresUploadSessionToken,
                hasIdempotencyKey: hasIdempotencyKey,
                extraHeaders: extraHeaders
            )

            do {
                let (data, response) = try await configuration.urlSession.data(for: request)
                guard let httpResponse = response as? HTTPURLResponse else {
                    throw FileFnClientError.transport(
                        status: nil,
                        requestId: nil,
                        bodySnippet: "Response was not an HTTP response"
                    )
                }

                if (200 ..< 300).contains(httpResponse.statusCode) {
                    return try decodeSuccess(
                        data: data,
                        requestIdHint: httpResponse.value(forHTTPHeaderField: "x-request-id"),
                        responseType: responseType
                    )
                }

                let error = decodeFailure(
                    data: data,
                    response: httpResponse,
                    capability: capability
                )
                if try await shouldRetry(
                    error: error,
                    attempt: attempt,
                    method: method,
                    path: path,
                    hasIdempotencyKey: hasIdempotencyKey
                ) {
                    continue
                }
                throw error
            } catch is CancellationError {
                throw CancellationError()
            } catch let error as FileFnClientError {
                if try await shouldRetry(
                    error: error,
                    attempt: attempt,
                    method: method,
                    path: path,
                    hasIdempotencyKey: hasIdempotencyKey
                ) {
                    continue
                }
                throw error
            } catch {
                let transportError = FileFnClientError.transport(
                    status: nil,
                    requestId: nil,
                    bodySnippet: error.localizedDescription
                )
                if try await shouldRetry(
                    error: transportError,
                    attempt: attempt,
                    method: method,
                    path: path,
                    hasIdempotencyKey: hasIdempotencyKey
                ) {
                    continue
                }
                throw transportError
            }
        }
    }

    private func shouldRetry(
        error: FileFnClientError,
        attempt: Int,
        method: String,
        path: String,
        hasIdempotencyKey: Bool
    ) async throws -> Bool {
        let policy = configuration.retryPolicy
        guard attempt < max(policy.maxAttempts, 1) else {
            return false
        }
        guard policy.shouldRetry(method: method, path: path, hasIdempotencyKey: hasIdempotencyKey) else {
            return false
        }

        let shouldRetryStatus: Bool
        switch error {
        case .server(let status, _, _):
            shouldRetryStatus = policy.retryableStatusCodes.contains(status)
        case .capabilityUnavailable(_, let status, _):
            shouldRetryStatus = policy.retryableStatusCodes.contains(status)
        case .transport(let status, _, _):
            shouldRetryStatus = status.map(policy.retryableStatusCodes.contains(_:)) ?? true
        default:
            shouldRetryStatus = false
        }

        guard shouldRetryStatus else {
            return false
        }

        let delay = retryDelayMilliseconds(forAttempt: attempt, policy: policy)
        if delay > 0 {
            try await Task.sleep(nanoseconds: UInt64(delay) * 1_000_000)
        }
        return true
    }

    private func retryDelayMilliseconds(forAttempt attempt: Int, policy: FileFnRetryPolicy) -> Int {
        let exponent = max(attempt - 1, 0)
        let multiplier = 1 << min(exponent, 16)
        let rawDelay = max(policy.baseDelayMilliseconds, 0) * multiplier
        return min(rawDelay, max(policy.maxDelayMilliseconds, 0))
    }

    private func decodeSuccess<Value: Decodable & Sendable>(
        data: Data,
        requestIdHint: String?,
        responseType: Value.Type
    ) throws -> DecodedResponse<Value> {
        do {
            let envelope = try configuration.jsonDecoder.decode(FileFnEnvelope<Value>.self, from: data)
            let value = try envelope.validatedValue()
            return DecodedResponse(
                value: value,
                warnings: envelope.warnings,
                requestId: envelope.requestId ?? requestIdHint
            )
        } catch let error as FileFnClientError {
            throw error
        } catch {
            throw FileFnClientError.invalidResponse(
                reason: "Response did not match the canonical FileFn success envelope",
                requestId: requestIdHint
            )
        }
    }

    private func decodeFailure(
        data: Data,
        response: HTTPURLResponse,
        capability: FileFnCapability?
    ) -> FileFnClientError {
        let requestIdHint = response.value(forHTTPHeaderField: "x-request-id")
        let contentType = response.value(forHTTPHeaderField: "content-type")
        let bodySnippet = fileFnBodySnippet(from: data)

        if let envelope = try? configuration.jsonDecoder.decode(FileFnEnvelope<FileFnJSONValue>.self, from: data),
           let payload = envelope.error {
            return .server(
                status: response.statusCode,
                payload: payload,
                requestId: envelope.requestId ?? requestIdHint
            )
        }

        return FileFnErrorClassifier.classifyFailure(
            status: response.statusCode,
            requestId: requestIdHint,
            payload: nil,
            contentType: contentType,
            bodySnippet: bodySnippet,
            capability: capability
        )
    }
}

func fileFnResolveURL(_ url: URL, against baseURL: URL, requestId: String?) throws -> URL {
    if url.scheme != nil {
        return url
    }

    let raw = url.relativeString
    let separator = raw.hasPrefix("/") ? "" : "/"
    guard let resolved = URL(string: baseURL.absoluteString + separator + raw) else {
        throw FileFnClientError.invalidResponse(
            reason: "Unable to resolve relative URL '\(raw)' against baseURL",
            requestId: requestId
        )
    }
    return resolved
}

private func fileFnBodySnippet(from data: Data) -> String? {
    guard !data.isEmpty else {
        return nil
    }

    let prefix = data.prefix(256)
    return String(data: prefix, encoding: .utf8) ?? nil
}

private struct AnyEncodable: Encodable {
    private let encodeImpl: (Encoder) throws -> Void

    init(_ value: any Encodable) {
        self.encodeImpl = { encoder in
            try value.encode(to: encoder)
        }
    }

    func encode(to encoder: Encoder) throws {
        try encodeImpl(encoder)
    }
}
