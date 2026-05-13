import AuthFnClient
import Foundation
import WebKit

@MainActor
public final class AuthFnWebViewBridgeHost: NSObject, WKScriptMessageHandler {
    public enum MessageName: String {
        case nativeHandoffRequested = "authfn.nativeHandoffRequested"
        case webHandoffRequested = "authfn.webHandoffRequested"
        case signOut = "authfn.signOut"
    }

    private weak var webView: WKWebView?
    private weak var userContentController: WKUserContentController?
    private let client: AuthFnClient
    private let handoffCoordinator: AuthFnHandoffCoordinator

    public init(webView: WKWebView, client: AuthFnClient) {
        self.webView = webView
        self.client = client
        self.handoffCoordinator = AuthFnHandoffCoordinator(client: client)
        super.init()
    }

    public func install(on userContentController: WKUserContentController) {
        uninstall()
        self.userContentController = userContentController
        userContentController.add(self, name: MessageName.nativeHandoffRequested.rawValue)
        userContentController.add(self, name: MessageName.webHandoffRequested.rawValue)
        userContentController.add(self, name: MessageName.signOut.rawValue)
    }

    public func uninstall() {
        userContentController?.removeScriptMessageHandler(forName: MessageName.nativeHandoffRequested.rawValue)
        userContentController?.removeScriptMessageHandler(forName: MessageName.webHandoffRequested.rawValue)
        userContentController?.removeScriptMessageHandler(forName: MessageName.signOut.rawValue)
        userContentController = nil
    }

    public func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let name = MessageName(rawValue: message.name) else {
            return
        }
        guard message.frameInfo.isMainFrame else {
            return
        }

        Task { @MainActor in
            switch name {
            case .nativeHandoffRequested:
                if let handoff = extractHandoff(from: message.body) {
                    do {
                        _ = try await handoffCoordinator.exchangeWebCreatedNativeCode(handoff.code, regionId: handoff.regionId)
                        notifyWebAuthStateChanged()
                    } catch {
                        logBridgeError("native handoff exchange failed", error)
                    }
                }
            case .webHandoffRequested:
                do {
                    let url = try await handoffCoordinator.nativeToWebConsumeURL()
                    webView?.load(URLRequest(url: url))
                } catch {
                    logBridgeError("web handoff start failed", error)
                }
            case .signOut:
                do {
                    try await client.signOut()
                    await clearCookies()
                    notifyWebAuthStateChanged()
                } catch {
                    logBridgeError("sign out failed", error)
                }
            }
        }
    }

    public func installWebCookie(with consumeURL: URL) {
        webView?.load(URLRequest(url: consumeURL))
    }

    public func parseOAuthCallbackURL(_ url: URL) throws -> AuthFnOAuthCallback {
        try AuthFnOAuthCoordinator().parseCallbackURL(url)
    }

    private func extractHandoff(from body: Any) -> (code: String, regionId: String?)? {
        if let code = body as? String {
            return (code, nil)
        }
        if let object = body as? [String: Any], let code = object["code"] as? String {
            return (code, object["regionId"] as? String)
        }
        return nil
    }

    private func notifyWebAuthStateChanged() {
        webView?.evaluateJavaScript("window.dispatchEvent(new CustomEvent('authfn:native-auth-state-changed'))") { _, error in
            if let error {
                self.logBridgeError("web auth state notification failed", error)
            }
        }
    }

    private func clearCookies() async {
        let store = webView?.configuration.websiteDataStore.httpCookieStore ?? WKWebsiteDataStore.default().httpCookieStore
        let cookies = await store.allCookies()
        let currentHost = webView?.url?.host
        for cookie in cookies {
            guard isAuthFnCookie(cookie, currentHost: currentHost) else {
                continue
            }
            await store.deleteCookie(cookie)
        }
    }

    private func isAuthFnCookie(_ cookie: HTTPCookie, currentHost: String?) -> Bool {
        let prefix = client.cookiePrefix
        let authCookieNames: Set<String> = [
            "\(prefix).session",
            "\(prefix).csrf",
            "__Secure-\(prefix).session",
            "__Secure-\(prefix).csrf",
        ]
        guard authCookieNames.contains(cookie.name) else {
            return false
        }
        guard let currentHost else {
            return false
        }

        let cookieDomain = cookie.domain.trimmingCharacters(in: CharacterSet(charactersIn: ".")).lowercased()
        let host = currentHost.lowercased()
        return host == cookieDomain || host.hasSuffix(".\(cookieDomain)")
    }

    private func logBridgeError(_ message: String, _ error: Error) {
        print("[AuthFnWebViewBridgeHost] \(message): \(error)")
    }
}

private extension WKHTTPCookieStore {
    func allCookies() async -> [HTTPCookie] {
        await withCheckedContinuation { continuation in
            getAllCookies { cookies in
                continuation.resume(returning: cookies)
            }
        }
    }
}
