@testable import FileFnWebViewBridgeHost
import Foundation
import Testing

struct FileFnBridgeProtocolTests {
    @Test
    func bridgeProtocolConstantsMatchScaffoldContract() {
        #expect(FILEFN_BRIDGE_PROTOCOL == "filefn-bridge/v1")
        #expect(FILEFN_BRIDGE_METHODS.contains("handshake"))
        #expect(FILEFN_BRIDGE_METHODS.contains("upload.start"))
        #expect(FILEFN_BRIDGE_EVENT_NAMES.contains("bridge.ready"))
        #expect(FILEFN_BRIDGE_EVENT_NAMES.contains("upload.completed"))
    }

    @Test
    func bridgeRequestAndResponseRoundTrip() throws {
        let request = FileFnBridgeRequestEnvelope(
            id: "bridge_req_001",
            method: "handshake",
            payload: .object([
                "clientId": .string("ios-webview-shell"),
                "mode": .string("native-backed"),
            ])
        )

        let requestData = try JSONEncoder().encode(request)
        let decodedRequest = try JSONDecoder().decode(FileFnBridgeRequestEnvelope.self, from: requestData)
        #expect(decodedRequest == request)

        let response = FileFnBridgeResponseEnvelope.success(
            id: "bridge_req_001",
            result: .object([
                "bridgeVersion": .number(1),
                "uploadOwner": .string("native"),
            ])
        )
        let responseData = try JSONEncoder().encode(response)
        let decodedResponse = try JSONDecoder().decode(FileFnBridgeResponseEnvelope.self, from: responseData)
        #expect(decodedResponse == response)
    }
}
