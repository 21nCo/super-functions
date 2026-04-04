import FileFnClient
import Foundation

public final class FileFnBridgeEventEmitter: @unchecked Sendable {
    private let lock = NSLock()
    private var sink: ((FileFnBridgeEventEnvelope) -> Void)?

    public init() {}

    public func setSink(_ sink: ((FileFnBridgeEventEnvelope) -> Void)?) {
        lock.lock()
        self.sink = sink
        lock.unlock()
    }

    public func emit(event: String, payload: FileFnJSONValue = .object([:])) {
        guard isFileFnBridgeEventName(event) else {
            return
        }
        let envelope = FileFnBridgeEventEnvelope(
            event: event,
            payload: fileFnBridgeSanitize(payload)
        )
        lock.lock()
        let sink = self.sink
        lock.unlock()
        sink?(envelope)
    }
}
