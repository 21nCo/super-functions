import Foundation

private struct FileFnDeleteResponse: Decodable, Sendable {
    let deleted: Bool
}

private struct FileFnVersionsResponse: Decodable, Sendable {
    let versions: [FileFnVersionSummary]
}

private struct FileFnArtifactsResponse: Decodable, Sendable {
    let artifacts: [FileFnArtifactDescriptor]
}

private func fileFnPathComponent(_ value: String) -> String {
    value.addingPercentEncoding(
        withAllowedCharacters: CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "-._~"))
    ) ?? value
}

extension FileFnClient {
    public func listFiles(cursor: String? = nil, limit: Int? = nil) async throws -> FileFnFilePage {
        let response = try await executor.execute(
            method: "GET",
            path: "/",
            query: [
                "cursor": cursor,
                "limit": limit.map(String.init),
            ],
            responseType: FileFnFilePage.self
        )
        return response.value
    }

    public func getFile(fileId: String) async throws -> FileFnFileDetail {
        let response = try await executor.execute(
            method: "GET",
            path: "/\(fileFnPathComponent(fileId))",
            responseType: FileFnFileDetail.self
        )
        return response.value
    }

    public func deleteFile(fileId: String) async throws {
        let response = try await executor.execute(
            method: "DELETE",
            path: "/\(fileFnPathComponent(fileId))",
            responseType: FileFnDeleteResponse.self
        )

        guard response.value.deleted else {
            throw FileFnClientError.invalidResponse(
                reason: "Delete response did not confirm deleted=true",
                requestId: response.requestId
            )
        }
    }

    public func listVersions(fileId: String) async throws -> [FileFnVersionSummary] {
        let response = try await executor.execute(
            method: "GET",
            path: "/\(fileFnPathComponent(fileId))/versions",
            responseType: FileFnVersionsResponse.self
        )
        return response.value.versions
    }

    public func getVersion(fileId: String, versionId: String) async throws -> FileFnVersionDetail {
        let response = try await executor.execute(
            method: "GET",
            path: "/\(fileFnPathComponent(fileId))/versions/\(fileFnPathComponent(versionId))",
            responseType: FileFnVersionDetail.self
        )
        return response.value
    }

    public func downloadURL(fileId: String, versionId: String? = nil) async throws -> FileFnDownloadDescriptor {
        let path: String
        if let versionId {
            path = "/\(fileFnPathComponent(fileId))/versions/\(fileFnPathComponent(versionId))/download"
        } else {
            path = "/\(fileFnPathComponent(fileId))/download"
        }

        let response = try await executor.execute(
            method: "GET",
            path: path,
            responseType: FileFnDownloadDescriptor.self
        )
        return try response.value.resolved(against: normalizedBaseURL, requestId: response.requestId)
    }

    public func listArtifacts(fileId: String) async throws -> [FileFnArtifactDescriptor] {
        let response = try await executor.execute(
            method: "GET",
            path: "/\(fileFnPathComponent(fileId))/artifacts",
            capability: .processing,
            responseType: FileFnArtifactsResponse.self
        )
        return response.value.artifacts
    }

    public func downloadArtifact(fileId: String, artifactId: String) async throws -> FileFnDownloadDescriptor {
        let response = try await executor.execute(
            method: "GET",
            path: "/\(fileFnPathComponent(fileId))/artifacts/\(fileFnPathComponent(artifactId))/download",
            capability: .processing,
            responseType: FileFnDownloadDescriptor.self
        )
        return try response.value.resolved(against: normalizedBaseURL, requestId: response.requestId)
    }

    public func resolveRenderable(
        fileId: String,
        intent: FileFnRenderIntent,
        versionId: String? = nil
    ) async throws -> FileFnRenderDescriptor {
        let response = try await executor.execute(
            method: "GET",
            path: "/\(fileFnPathComponent(fileId))/render",
            query: [
                "intent": intent.rawValue,
                "versionId": versionId,
            ],
            responseType: FileFnRenderDescriptor.self
        )
        return try response.value.resolved(against: normalizedBaseURL, requestId: response.requestId)
    }
}
