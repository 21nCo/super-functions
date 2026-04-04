@testable import FileFnClient
import Foundation
import Testing

struct FileFnRenderRouteTests {
    @Test
    func downloadAndArtifactDescriptorsResolveRelativeURLsAgainstBaseURL() async throws {
        let host = "render-routes-download.example.test"
        defer { FileFnMockURLProtocol.unregister(host: host) }

        let client = try makeFileFnTestClient(host: host) { request in
            switch (request.httpMethod, request.url?.path) {
            case ("GET", "/filefn/file_pdf_001/download"):
                return makeJSONResponse(
                    request: request,
                    status: 200,
                    body: """
                    {
                      "ok": true,
                      "data": {
                        "url": "/proxy/files/file_pdf_001/download?expires=123&sig=abc",
                        "headers": {
                          "x-download-auth": "download-token"
                        }
                      },
                      "requestId": "req_download_001"
                    }
                    """
                )
            case ("GET", "/filefn/file_pdf_001/artifacts/art_pdf_large_001/download"):
                return makeJSONResponse(
                    request: request,
                    status: 200,
                    body: """
                    {
                      "ok": true,
                      "data": {
                        "url": "/proxy/files/file_pdf_001/artifacts/art_pdf_large_001/download?expires=999&sig=artifact",
                        "headers": {
                          "x-artifact-auth": "artifact-token"
                        }
                      },
                      "requestId": "req_artifact_download_001"
                    }
                    """
                )
            case ("GET", "/filefn/file_pdf_001/artifacts"):
                return makeJSONResponse(
                    request: request,
                    status: 200,
                    body: """
                    {
                      "ok": true,
                      "data": {
                        "artifacts": [
                          {
                            "artifactId": "art_pdf_large_001",
                            "fileId": "file_pdf_001",
                            "versionId": "ver_pdf_001",
                            "kind": "pdf-preview-page-1-large",
                            "mimeType": "image/png",
                            "size": 1024,
                            "createdAt": "2026-03-22T00:00:00.000Z"
                          }
                        ]
                      },
                      "requestId": "req_artifacts_001"
                    }
                    """
                )
            default:
                Issue.record("Unexpected request: \(request.httpMethod ?? "nil") \(request.url?.absoluteString ?? "nil")")
                return makeJSONResponse(request: request, status: 500, body: #"{"ok":false,"error":{"code":"TEST_UNEXPECTED","message":"Unexpected request"}} "#)
            }
        }

        let download = try await client.downloadURL(fileId: "file_pdf_001")
        #expect(download.url.absoluteString == "https://\(host)/filefn/proxy/files/file_pdf_001/download?expires=123&sig=abc")
        #expect(download.headers["x-download-auth"] == "download-token")

        let artifacts = try await client.listArtifacts(fileId: "file_pdf_001")
        #expect(artifacts.count == 1)
        #expect(artifacts[0].artifactId == "art_pdf_large_001")

        let artifactDownload = try await client.downloadArtifact(fileId: "file_pdf_001", artifactId: "art_pdf_large_001")
        #expect(artifactDownload.url.absoluteString == "https://\(host)/filefn/proxy/files/file_pdf_001/artifacts/art_pdf_large_001/download?expires=999&sig=artifact")
        #expect(artifactDownload.headers["x-artifact-auth"] == "artifact-token")
    }

    @Test
    func resolveRenderablePreservesPlaceholderWarnings() async throws {
        let host = "render-routes-placeholder.example.test"
        defer { FileFnMockURLProtocol.unregister(host: host) }

        let client = try makeFileFnTestClient(host: host) { request in
            let components = URLComponents(url: try #require(request.url), resolvingAgainstBaseURL: false)
            #expect(components?.path == "/filefn/file_pdf_001/render")
            #expect(components?.queryItems?.first(where: { $0.name == "intent" })?.value == "preview")
            #expect(components?.queryItems?.first(where: { $0.name == "versionId" })?.value == "ver_pdf_001")

            return makeJSONResponse(
                request: request,
                status: 200,
                body: """
                {
                  "ok": true,
                  "data": {
                    "fileId": "file_pdf_001",
                    "versionId": "ver_pdf_001",
                    "intent": "preview",
                    "state": "processing",
                    "mimeType": "application/pdf",
                    "name": "spec.pdf",
                    "size": 2048,
                    "source": {
                      "mode": "placeholder",
                      "placeholderKind": "pdf-processing"
                    },
                    "warnings": ["PDF preview artifact is not available yet."]
                  },
                  "requestId": "req_render_001"
                }
                """
            )
        }

        let render = try await client.resolveRenderable(
            fileId: "file_pdf_001",
            intent: .preview,
            versionId: "ver_pdf_001"
        )

        #expect(render.state == .processing)
        #expect(render.source.mode == "placeholder")
        #expect(render.source.placeholderKind == .pdfProcessing)
        #expect(render.warnings == ["PDF preview artifact is not available yet."])
    }

    @Test
    func resolveRenderableResolvesRelativeArtifactURLs() async throws {
        let host = "render-routes-artifact.example.test"
        defer { FileFnMockURLProtocol.unregister(host: host) }

        let client = try makeFileFnTestClient(host: host) { request in
            makeJSONResponse(
                request: request,
                status: 200,
                body: """
                {
                  "ok": true,
                  "data": {
                    "fileId": "file_pdf_001",
                    "versionId": "ver_pdf_001",
                    "intent": "preview",
                    "state": "ready",
                    "mimeType": "image/png",
                    "name": "spec.pdf",
                    "size": 1024,
                    "source": {
                      "mode": "artifact",
                      "artifactId": "art_pdf_large_001",
                      "artifactKind": "pdf-preview-page-1-large",
                      "url": "/proxy/files/file_pdf_001/artifacts/art_pdf_large_001/download",
                      "headers": {
                        "x-render-auth": "render-token"
                      }
                    }
                  },
                  "requestId": "req_render_artifact_001"
                }
                """
            )
        }

        let render = try await client.resolveRenderable(fileId: "file_pdf_001", intent: .preview)
        #expect(render.source.url?.absoluteString == "https://\(host)/filefn/proxy/files/file_pdf_001/artifacts/art_pdf_large_001/download")
        #expect(render.source.headers?["x-render-auth"] == "render-token")
    }

    @Test
    func processingRouteMissingSurfacesAsCapabilityUnavailable() async throws {
        let host = "render-routes-capability.example.test"
        defer { FileFnMockURLProtocol.unregister(host: host) }

        let client = try makeFileFnTestClient(host: host) { request in
            let response = HTTPURLResponse(
                url: try #require(request.url),
                statusCode: 404,
                httpVersion: nil,
                headerFields: ["content-type": "text/html"]
            )!
            return (response, Data("<html>not found</html>".utf8))
        }

        await #expect(throws: FileFnClientError.capabilityUnavailable(.processing, status: 404, requestId: nil)) {
            _ = try await client.listArtifacts(fileId: "file_pdf_001")
        }
    }
}
