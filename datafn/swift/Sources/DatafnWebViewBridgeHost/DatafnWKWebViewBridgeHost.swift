import DatafnCoreDataStore
import Foundation
import WebKit

public final class DatafnWKWebViewBridgeHost: NSObject, WKScriptMessageHandler, @unchecked Sendable {
    private let handlerName: String
    private let dispatcher: DatafnBridgeDispatcher
    private let eventEmitter: DatafnBridgeEventEmitter
    private let storage: DatafnCoreDataStore?
    private let storageObserverToken: UUID?
    private let deliveryLock = NSLock()

    private weak var currentWebView: WKWebView?
    nonisolated(unsafe) private var testingSink: ((Any) -> Void)?

    public nonisolated init(
        handlerName: String = "datafn",
        bridgeConfiguration: DatafnBridgeConfiguration,
        storage: DatafnCoreDataStore,
        remoteHandlers: DatafnBridgeRemoteHandlers = .unsupported(),
        searchHandlers: DatafnBridgeSearchHandlers? = nil,
        syncHandlers: DatafnBridgeSyncHandlers? = nil,
        healthReportProvider: @escaping @Sendable () async -> DatafnBridgeHealthReport
    ) {
        let eventEmitter = DatafnBridgeEventEmitter()
        let effectiveSyncHandlers = syncHandlers ?? Self.makeDefaultSyncHandlers(eventEmitter: eventEmitter)
        self.handlerName = handlerName
        self.eventEmitter = eventEmitter
        self.storage = storage
        self.dispatcher = DatafnBridgeDispatcher(
            configuration: bridgeConfiguration,
            storage: storage,
            eventEmitter: eventEmitter,
            remoteHandlers: remoteHandlers,
            searchHandlers: searchHandlers,
            syncHandlers: effectiveSyncHandlers,
            healthReportProvider: healthReportProvider
        )
        self.storageObserverToken = storage.subscribe { [weak eventEmitter] event in
            eventEmitter?.emit(event: event.name, payload: event.payload)
        }
        super.init()
        eventEmitter.setSink { [weak self] event in
            Task { @MainActor [weak self] in
                self?.deliver(event)
            }
        }
    }

    nonisolated init(
        handlerName: String = "datafn",
        dispatcher: DatafnBridgeDispatcher,
        eventEmitter: DatafnBridgeEventEmitter,
        storage: DatafnCoreDataStore? = nil,
        testingSink: ((Any) -> Void)? = nil
    ) {
        self.handlerName = handlerName
        self.dispatcher = dispatcher
        self.eventEmitter = eventEmitter
        self.storage = storage
        self.testingSink = testingSink
        self.storageObserverToken = storage?.subscribe { [weak eventEmitter] event in
            eventEmitter?.emit(event: event.name, payload: event.payload)
        }
        super.init()
        eventEmitter.setSink { [weak self] event in
            Task { @MainActor [weak self] in
                self?.deliver(event)
            }
        }
    }

    deinit {
        if let storageObserverToken, let storage {
            storage.unsubscribe(storageObserverToken)
        }
    }

    public func attach(to userContentController: WKUserContentController) {
        userContentController.add(self, name: handlerName)
    }

    public func detach(from userContentController: WKUserContentController) {
        eventEmitter.emit(
            event: DatafnCoreDataStore.bridgeClosedEvent,
            payload: ["handlerName": .string(handlerName)]
        )
        userContentController.removeScriptMessageHandler(forName: handlerName)

        deliveryLock.lock()
        currentWebView = nil
        deliveryLock.unlock()
    }

    public func userContentController(
        _: WKUserContentController,
        didReceive message: WKScriptMessage
    ) {
        guard message.name == handlerName else {
            return
        }

        deliveryLock.lock()
        currentWebView = message.webView
        deliveryLock.unlock()

        Task { [weak self] in
            guard let self else { return }
            let response = await self.dispatcher.dispatch(rawMessage: message.body)
            self.deliver(response, preferredWebView: message.webView)
        }
    }

    nonisolated func handleMessageForTesting(_ rawMessage: Any) async -> DatafnBridgeResponseEnvelope {
        await dispatcher.dispatch(rawMessage: rawMessage)
    }

    nonisolated func setTestingSink(_ sink: ((Any) -> Void)?) {
        deliveryLock.lock()
        testingSink = sink
        deliveryLock.unlock()
    }

    private func deliver(_ response: DatafnBridgeResponseEnvelope, preferredWebView: WKWebView? = nil) {
        do {
            let outbound = try Self.foundationObject(from: response)
            deliveryLock.lock()
            let testingSink = self.testingSink
            let targetWebView = preferredWebView ?? currentWebView
            deliveryLock.unlock()

            testingSink?(outbound)
            if let targetWebView {
                targetWebView.evaluateJavaScript(
                    try Self.receiveInvocation(for: outbound),
                    completionHandler: nil
                )
            }
        } catch {
            // Intentionally drop non-serializable outbound data.
        }
    }

    private func deliver(_ event: DatafnBridgeEventEnvelope) {
        do {
            let outbound = try Self.foundationObject(from: event)
            deliveryLock.lock()
            let testingSink = self.testingSink
            let targetWebView = currentWebView
            deliveryLock.unlock()

            testingSink?(outbound)
            if let targetWebView {
                targetWebView.evaluateJavaScript(
                    try Self.receiveInvocation(for: outbound),
                    completionHandler: nil
                )
            }
        } catch {
            // Intentionally drop non-serializable outbound data.
        }
    }

    nonisolated private static func makeDefaultSyncHandlers(
        eventEmitter: DatafnBridgeEventEmitter
    ) -> DatafnBridgeSyncHandlers {
        DatafnBridgeSyncHandlers(
            start: {
                eventEmitter.emit(
                    event: DatafnCoreDataStore.syncStatusEvent,
                    payload: ["state": .string("running")]
                )
            },
            stop: {
                eventEmitter.emit(
                    event: DatafnCoreDataStore.syncStatusEvent,
                    payload: ["state": .string("stopped")]
                )
            },
            pullNow: {
                eventEmitter.emit(
                    event: DatafnCoreDataStore.syncStatusEvent,
                    payload: [
                        "state": .string("running"),
                        "action": .string("pullNow"),
                    ]
                )
            },
            cloneNow: {
                eventEmitter.emit(
                    event: DatafnCoreDataStore.syncStatusEvent,
                    payload: [
                        "state": .string("running"),
                        "action": .string("cloneNow"),
                    ]
                )
            },
            reconcileNow: {
                eventEmitter.emit(
                    event: DatafnCoreDataStore.syncStatusEvent,
                    payload: [
                        "state": .string("running"),
                        "action": .string("reconcileNow"),
                    ]
                )
            },
            schedulePush: {
                eventEmitter.emit(
                    event: DatafnCoreDataStore.syncStatusEvent,
                    payload: [
                        "state": .string("running"),
                        "action": .string("schedulePush"),
                    ]
                )
            }
        )
    }

    private static func foundationObject<T: Encodable>(from value: T) throws -> Any {
        let data = try JSONEncoder().encode(value)
        return try JSONSerialization.jsonObject(with: data)
    }

    private static func receiveInvocation(for jsonObject: Any) throws -> String {
        let data = try JSONSerialization.data(withJSONObject: jsonObject)
        let json = String(decoding: data, as: UTF8.self)
        return "window.__datafnBridgeReceive__(\(json));"
    }
}
