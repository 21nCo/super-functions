import DatafnAppleRuntime
import DatafnCoreDataStore
import Foundation
import Observation

@MainActor
@Observable
public final class DatafnObservedMutationState {
    public private(set) var lastMutationID: String?
    public private(set) var lastClientID: String?
    public private(set) var lastSequence: Int64?
    public private(set) var lastEventName: String?
    public private(set) var lastError: DatafnObservedError?

    @ObservationIgnored private let source: DatafnRuntimeObservationSource
    @ObservationIgnored private var observerToken: UUID?

    public init(source: DatafnRuntimeObservationSource) {
        self.source = source
        self.observerToken = source.subscribe { [weak self] event in
            Task { @MainActor [weak self] in
                self?.consume(event)
            }
        }
    }

    deinit {
        if let observerToken {
            source.unsubscribe(observerToken)
        }
    }

    private func consume(_ event: DatafnStoreEvent) {
        lastEventName = event.name

        switch event.name {
        case DatafnCoreDataStore.mutationAppliedEvent:
            lastMutationID = event.payload["mutationId"]?.stringValue
            lastClientID = event.payload["clientId"]?.stringValue
            if let sequence = event.payload["seq"]?.intValue {
                lastSequence = Int64(sequence)
            }
            lastError = nil
        case DatafnCoreDataStore.mutationRejectedEvent,
            DatafnCoreDataStore.syncFailedEvent:
            lastError = DatafnObservedError(
                code: event.payload["code"]?.stringValue ?? "INTERNAL",
                message: event.payload["message"]?.stringValue ?? "Mutation failed",
                details: event.payload
            )
        default:
            break
        }
    }
}
