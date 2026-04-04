import FileFnClient
import Foundation
import WebKit

public struct FileFnWebViewBridgeConfiguration: Sendable, Equatable {
    public let handlerName: String
    public let previewScheme: String
    public let bridgeVersion: Int

    public init(
        handlerName: String = "filefn",
        previewScheme: String = "filefn-bridge",
        bridgeVersion: Int = 1
    ) {
        self.handlerName = handlerName
        self.previewScheme = previewScheme
        self.bridgeVersion = bridgeVersion
    }
}

public final class FileFnWKWebViewBridgeHost: NSObject, WKScriptMessageHandler, @unchecked Sendable {
    public let configuration: FileFnWebViewBridgeConfiguration
    public let dispatcher: FileFnBridgeDispatcher
    public let eventEmitter: FileFnBridgeEventEmitter
    public let assetRegistry: FileFnNativeAssetRegistry
    public let previewSchemeHandler: FileFnBridgePreviewSchemeHandler

    private let deliveryLock = NSLock()
    private weak var currentWebView: WKWebView?
    private var messagePipeline: Task<Void, Never>?
    nonisolated(unsafe) private var testingSink: ((Any) -> Void)?

    public init(
        configuration: FileFnWebViewBridgeConfiguration = FileFnWebViewBridgeConfiguration(),
        client: FileFnClient? = nil,
        assetRegistry: FileFnNativeAssetRegistry? = nil,
        foregroundUploader: FileFnForegroundUploader? = nil,
        backgroundUploader: FileFnBackgroundUploader? = nil
    ) {
        self.configuration = configuration
        let registry = assetRegistry ?? FileFnNativeAssetRegistry(previewScheme: configuration.previewScheme)
        self.assetRegistry = registry
        self.eventEmitter = FileFnBridgeEventEmitter()
        self.dispatcher = FileFnBridgeDispatcher(
            configuration: configuration,
            client: client,
            assetRegistry: registry,
            eventEmitter: eventEmitter,
            foregroundUploader: foregroundUploader,
            backgroundUploader: backgroundUploader
        )
        self.previewSchemeHandler = FileFnBridgePreviewSchemeHandler(assetRegistry: registry)
        super.init()

        eventEmitter.setSink { [weak self] event in
            Task { @MainActor [weak self] in
                self?.deliver(event)
            }
        }
    }

    public func attach(to userContentController: WKUserContentController) {
        userContentController.add(self, name: configuration.handlerName)
        enqueueMessageWork { [self] in
            await self.dispatcher.resetHandshake()
        }
    }

    public func detach(from userContentController: WKUserContentController) {
        eventEmitter.emit(
            event: "bridge.closed",
            payload: .object(["handlerName": .string(configuration.handlerName)])
        )
        userContentController.removeScriptMessageHandler(forName: configuration.handlerName)
        deliveryLock.lock()
        currentWebView = nil
        deliveryLock.unlock()
        enqueueMessageWork { [self] in
            await self.dispatcher.resetHandshake()
        }
    }

    public func userContentController(
        _: WKUserContentController,
        didReceive message: WKScriptMessage
    ) {
        guard message.name == configuration.handlerName else {
            return
        }

        deliveryLock.lock()
        let previousWebView = currentWebView
        currentWebView = message.webView
        deliveryLock.unlock()

        let shouldResetHandshake = previousWebView !== message.webView

        enqueueMessageWork { [weak self] in
            guard let self else { return }
            if shouldResetHandshake {
                await self.dispatcher.resetHandshake()
            }
            let response = await self.dispatcher.dispatch(rawMessage: message.body)
            await MainActor.run {
                self.deliver(response, preferredWebView: message.webView)
            }
        }
    }

    private func enqueueMessageWork(_ operation: @escaping @Sendable () async -> Void) {
        deliveryLock.lock()
        let previousTask = messagePipeline
        let nextTask = Task { [weak self] in
            _ = await previousTask?.result
            guard self != nil else { return }
            await operation()
        }
        messagePipeline = nextTask
        deliveryLock.unlock()
    }

    nonisolated func handleMessageForTesting(_ rawMessage: Any) async -> FileFnBridgeResponseEnvelope {
        await dispatcher.dispatch(rawMessage: rawMessage)
    }

    nonisolated func setTestingSink(_ sink: ((Any) -> Void)?) {
        deliveryLock.lock()
        testingSink = sink
        deliveryLock.unlock()
    }

    @MainActor
    private func deliver(_ response: FileFnBridgeResponseEnvelope, preferredWebView: WKWebView? = nil) {
        do {
            let outbound = try fileFnBridgeFoundationObject(from: response)
            deliveryLock.lock()
            let testingSink = self.testingSink
            let targetWebView = preferredWebView ?? currentWebView
            deliveryLock.unlock()

            testingSink?(outbound)
            if let targetWebView {
                targetWebView.evaluateJavaScript(
                    try fileFnBridgeReceiveInvocation(for: outbound),
                    completionHandler: nil
                )
            }
        } catch {
            // Drop non-serializable outbound data.
        }
    }

    @MainActor
    private func deliver(_ event: FileFnBridgeEventEnvelope) {
        do {
            let outbound = try fileFnBridgeFoundationObject(from: event)
            deliveryLock.lock()
            let testingSink = self.testingSink
            let targetWebView = currentWebView
            deliveryLock.unlock()

            testingSink?(outbound)
            if let targetWebView {
                targetWebView.evaluateJavaScript(
                    try fileFnBridgeReceiveInvocation(for: outbound),
                    completionHandler: nil
                )
            }
        } catch {
            // Drop non-serializable outbound data.
        }
    }
}
