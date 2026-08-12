import BillFnWebViewBridgeHost
import Foundation

let dispatcher = BillFnBridgeDispatcher(
    configuration: BillFnBridgeConfiguration(
        baseURL: "https://billfn.example.test/billfn"
    )
)

let handshake = dispatcher.handle(
    BillFnBridgeRequestEnvelope(
        id: "req_1",
        method: "handshake",
        payload: [
            "clientId": "embedded-web",
            "mode": "native-backed",
            "baseURL": "https://billfn.example.test/billfn"
        ]
    )
)

print("Bridge handshake:", handshake)
