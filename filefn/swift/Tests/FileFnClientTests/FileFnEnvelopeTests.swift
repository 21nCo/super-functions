@testable import FileFnClient
import Foundation
import Testing

struct FileFnEnvelopeTests {
    private struct SamplePayload: Decodable, Sendable, Equatable {
        let fileId: String
        let name: String
    }

    @Test
    func missingWarningsDefaultToEmptyArray() throws {
        let data = """
        {
          "ok": true,
          "data": {
            "fileId": "file_001",
            "name": "avatar.png"
          },
          "requestId": "req_env_001"
        }
        """.data(using: .utf8)!

        let envelope = try JSONDecoder().decode(FileFnEnvelope<SamplePayload>.self, from: data)

        #expect(envelope.ok)
        #expect(envelope.warnings == [])
        #expect(envelope.requestId == "req_env_001")
        #expect(try envelope.validatedValue() == SamplePayload(fileId: "file_001", name: "avatar.png"))
    }

    @Test
    func missingDataProducesInvalidResponse() throws {
        let data = """
        {
          "ok": true,
          "requestId": "req_env_missing_data"
        }
        """.data(using: .utf8)!

        let envelope = try JSONDecoder().decode(FileFnEnvelope<SamplePayload>.self, from: data)

        do {
            _ = try envelope.validatedValue()
            Issue.record("Expected missing data to throw an invalidResponse error")
        } catch {
            #expect(
                error as? FileFnClientError ==
                .invalidResponse(
                    reason: "Successful envelope is missing data",
                    requestId: "req_env_missing_data"
                )
            )
        }
    }

    @Test
    func serverErrorEnvelopeDecodesStructuredPayload() throws {
        let data = """
        {
          "ok": false,
          "error": {
            "code": "FILEFN_NOT_FOUND",
            "message": "File not found",
            "details": {}
          },
          "requestId": "req_err_001"
        }
        """.data(using: .utf8)!

        let envelope = try JSONDecoder().decode(FileFnEnvelope<SamplePayload>.self, from: data)

        #expect(envelope.ok == false)
        #expect(envelope.error?.code == "FILEFN_NOT_FOUND")
        #expect(envelope.requestId == "req_err_001")
    }

    @Test
    func canonicalErrorsClassifyAsServerErrors() {
        let error = FileFnErrorClassifier.classifyFailure(
            status: 404,
            requestId: "req_err_001",
            payload: FileFnServerErrorPayload(
                code: "FILEFN_NOT_FOUND",
                message: "File not found"
            ),
            contentType: "application/json",
            bodySnippet: nil,
            capability: .quota
        )

        #expect(
            error ==
            .server(
                status: 404,
                payload: FileFnServerErrorPayload(
                    code: "FILEFN_NOT_FOUND",
                    message: "File not found"
                ),
                requestId: "req_err_001"
            )
        )
    }

    @Test
    func nonCanonicalOptionalCapabilityErrorsClassifyAsUnavailable() {
        let error = FileFnErrorClassifier.classifyFailure(
            status: 404,
            requestId: nil,
            payload: nil,
            contentType: "text/html",
            bodySnippet: "<html>not found</html>",
            capability: .quota
        )

        #expect(error == .capabilityUnavailable(.quota, status: 404, requestId: nil))
    }
}
