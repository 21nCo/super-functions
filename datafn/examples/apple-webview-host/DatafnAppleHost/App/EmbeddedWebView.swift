import DatafnWebViewBridgeHost
import SwiftUI
import WebKit

struct EmbeddedWebView: UIViewRepresentable {
    let url: URL?
    let bootstrapScript: String
    let bridgeHost: DatafnWKWebViewBridgeHost?

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        let userContentController = configuration.userContentController
        userContentController.addUserScript(
            WKUserScript(
                source: bootstrapScript,
                injectionTime: .atDocumentStart,
                forMainFrameOnly: true
            )
        )
        bridgeHost?.attach(to: userContentController)

        let webView = WKWebView(frame: .zero, configuration: configuration)

        if let url {
            webView.load(URLRequest(url: url))
        } else if let htmlURL = Bundle.main.url(forResource: "topology-demo", withExtension: "html") {
            webView.loadFileURL(
                htmlURL,
                allowingReadAccessTo: htmlURL.deletingLastPathComponent()
            )
        }

        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {}
}
