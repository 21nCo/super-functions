import DatafnCoreDataStore
import Foundation

public final class DatafnBridgeEventEmitter: @unchecked Sendable {
    public typealias EventHandler = @Sendable (DatafnBridgeEventEnvelope) -> Void
    public typealias Sink = @Sendable (DatafnBridgeEventEnvelope) -> Void

    private let lock = NSLock()
    private var handlers: [UUID: EventHandler] = [:]
    private var sink: Sink?
    private let supportedEvents = Set(DATAFN_BRIDGE_EVENT_NAMES)

    public init() {}

    public func setSink(_ sink: Sink?) {
        lock.lock()
        self.sink = sink
        lock.unlock()
    }

    @discardableResult
    public func subscribe(_ handler: @escaping EventHandler) -> UUID {
        let token = UUID()
        lock.lock()
        handlers[token] = handler
        lock.unlock()
        return token
    }

    public func unsubscribe(_ token: UUID) {
        lock.lock()
        handlers.removeValue(forKey: token)
        lock.unlock()
    }

    public func emit(
        event: String,
        payload: DatafnJSONObject = [:]
    ) {
        guard supportedEvents.contains(event) else {
            return
        }

        let envelope = DatafnBridgeEventEnvelope(
            event: event,
            payload: Self.redact(.object(payload))
        )

        lock.lock()
        let handlers = Array(self.handlers.values)
        let sink = self.sink
        lock.unlock()

        handlers.forEach { $0(envelope) }
        sink?(envelope)
    }

    static func redact(_ value: DatafnJSONValue) -> DatafnJSONValue {
        switch value {
        case .object(let object):
            return .object(
                Dictionary(
                    uniqueKeysWithValues: object.map { key, nestedValue in
                        if shouldRedact(key: key) {
                            return (key, .string("[REDACTED]"))
                        }
                        return (key, redact(nestedValue))
                    }
                )
            )
        case .array(let values):
            return .array(values.map(redact))
        default:
            return value
        }
    }

    private static func shouldRedact(key: String) -> Bool {
        let normalized = key.lowercased()
        return normalized.contains("authorization")
            || normalized.contains("token")
            || normalized.contains("secret")
            || normalized.contains("cookie")
            || normalized.contains("apikey")
            || normalized.contains("api_key")
            || normalized.contains("bearer")
            || normalized == "auth"
    }
}
