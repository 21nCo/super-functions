import Foundation

private struct FileFnPoliciesResponse: Decodable, Sendable {
    let policies: [FileFnPolicySummary]
}

private struct FileFnGrantsResponse: Decodable, Sendable {
    let permissions: [FileFnPermissionGrant]
}

private struct FileFnSharesResponse: Decodable, Sendable {
    let shares: [FileFnShareLinkSummary]
}

private struct FileFnProcessingEnvelope: Decodable, Sendable {
    let processing: FileFnProcessingStatus
}

private struct FileFnRevokedResponse: Decodable, Sendable {
    let revoked: Bool
}

private func fileFnCapabilityPathComponent(_ value: String) -> String {
    value.addingPercentEncoding(
        withAllowedCharacters: CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "-._~"))
    ) ?? value
}

extension FileFnClient {
    public func listPolicies() async throws -> [FileFnPolicySummary] {
        let response = try await executor.execute(
            method: "GET",
            path: "/policies",
            capability: .policies,
            responseType: FileFnPoliciesResponse.self
        )
        return response.value.policies
    }

    public func getStorageQuota() async throws -> FileFnStorageQuota {
        let response = try await executor.execute(
            method: "GET",
            path: "/quota/storage",
            capability: .quota,
            responseType: FileFnStorageQuota.self
        )
        return response.value
    }

    public func createGrant(fileId: String, request: FileFnCreateGrantRequest) async throws -> FileFnPermissionGrant {
        let response = try await executor.execute(
            method: "POST",
            path: "/\(fileFnCapabilityPathComponent(fileId))/permissions",
            body: request,
            capability: .grants,
            responseType: FileFnPermissionGrant.self
        )
        return response.value
    }

    public func listGrants(fileId: String) async throws -> [FileFnPermissionGrant] {
        let response = try await executor.execute(
            method: "GET",
            path: "/\(fileFnCapabilityPathComponent(fileId))/permissions",
            capability: .grants,
            responseType: FileFnGrantsResponse.self
        )
        return response.value.permissions
    }

    public func revokeGrant(fileId: String, permissionId: String) async throws {
        let response = try await executor.execute(
            method: "DELETE",
            path: "/\(fileFnCapabilityPathComponent(fileId))/permissions/\(fileFnCapabilityPathComponent(permissionId))",
            capability: .grants,
            responseType: FileFnRevokedResponse.self
        )
        guard response.value.revoked else {
            throw FileFnClientError.invalidResponse(
                reason: "Revoke response did not confirm revoked=true",
                requestId: response.requestId
            )
        }
    }

    public func createShareLink(fileId: String, request: FileFnCreateShareLinkRequest) async throws -> FileFnShareLink {
        let response = try await executor.execute(
            method: "POST",
            path: "/\(fileFnCapabilityPathComponent(fileId))/share-links",
            body: request,
            capability: .shares,
            responseType: FileFnShareLink.self
        )
        return response.value
    }

    public func listShareLinks(fileId: String) async throws -> [FileFnShareLinkSummary] {
        let response = try await executor.execute(
            method: "GET",
            path: "/\(fileFnCapabilityPathComponent(fileId))/share-links",
            capability: .shares,
            responseType: FileFnSharesResponse.self
        )
        return response.value.shares
    }

    public func revokeShareLink(fileId: String, token: String) async throws {
        let response = try await executor.execute(
            method: "DELETE",
            path: "/\(fileFnCapabilityPathComponent(fileId))/share-links/\(fileFnCapabilityPathComponent(token))",
            capability: .shares,
            responseType: FileFnRevokedResponse.self
        )
        guard response.value.revoked else {
            throw FileFnClientError.invalidResponse(
                reason: "Revoke response did not confirm revoked=true",
                requestId: response.requestId
            )
        }
    }

    public func resolveShareDownload(token: String) async throws -> FileFnShareDownloadDescriptor {
        let response = try await executor.execute(
            method: "GET",
            path: "/share-links/\(fileFnCapabilityPathComponent(token))/download",
            capability: .shares,
            responseType: FileFnShareDownloadDescriptor.self
        )
        return try response.value.resolved(against: normalizedBaseURL, requestId: response.requestId)
    }

    public func triggerProcessing(
        fileId: String,
        request: FileFnTriggerProcessingRequest
    ) async throws -> FileFnProcessingStatus {
        let response = try await executor.execute(
            method: "POST",
            path: "/\(fileFnCapabilityPathComponent(fileId))/process",
            body: request,
            capability: .processing,
            responseType: FileFnProcessingEnvelope.self
        )
        return response.value.processing
    }
}
