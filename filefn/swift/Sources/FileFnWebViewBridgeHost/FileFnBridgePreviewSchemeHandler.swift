import Foundation
import WebKit

public final class FileFnBridgePreviewSchemeHandler: NSObject, WKURLSchemeHandler {
    private let assetRegistry: FileFnNativeAssetRegistry
    private let lock = NSLock()
    private var activeTasks: [ObjectIdentifier: Task<Void, Never>] = [:]

    public init(assetRegistry: FileFnNativeAssetRegistry) {
        self.assetRegistry = assetRegistry
        super.init()
    }

    public func webView(_ webView: WKWebView, start urlSchemeTask: any WKURLSchemeTask) {
        let requestURL = urlSchemeTask.request.url
        let taskID = ObjectIdentifier(urlSchemeTask)
        let task = Task {
            defer {
                removeTask(for: taskID)
            }
            do {
                guard let requestURL,
                      let assetHandle = await assetRegistry.assetHandle(for: requestURL) else {
                    throw FileFnBridgeError(
                        code: "NATIVE_ASSET_NOT_FOUND",
                        message: "Preview URL did not match a registered asset"
                    )
                }

                let descriptor = try await assetRegistry.descriptor(for: assetHandle)
                let fileURL = try await assetRegistry.fileURL(for: assetHandle)
                try Task.checkCancellation()
                let data = try Data(contentsOf: fileURL)
                try Task.checkCancellation()

                let response = URLResponse(
                    url: requestURL,
                    mimeType: descriptor.mimeType,
                    expectedContentLength: data.count,
                    textEncodingName: nil
                )
                urlSchemeTask.didReceive(response)
                urlSchemeTask.didReceive(data)
                urlSchemeTask.didFinish()
            } catch is CancellationError {
                // Stop callbacks once WebKit has cancelled the scheme task.
            } catch {
                urlSchemeTask.didFailWithError(error)
            }
        }
        storeTask(task, for: taskID)
        _ = webView
    }

    public func webView(_ webView: WKWebView, stop urlSchemeTask: any WKURLSchemeTask) {
        let taskID = ObjectIdentifier(urlSchemeTask)
        let task = removeTask(for: taskID)
        task?.cancel()
        _ = webView
    }

    private func storeTask(_ task: Task<Void, Never>, for identifier: ObjectIdentifier) {
        lock.lock()
        defer { lock.unlock() }
        activeTasks[identifier] = task
    }

    @discardableResult
    private func removeTask(for identifier: ObjectIdentifier) -> Task<Void, Never>? {
        lock.lock()
        defer { lock.unlock() }
        return activeTasks.removeValue(forKey: identifier)
    }
}
