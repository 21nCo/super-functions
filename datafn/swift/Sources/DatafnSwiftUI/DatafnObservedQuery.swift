import DatafnAppleRuntime
import DatafnCoreDataStore
import Foundation
import Observation

public struct DatafnObservedError: Error, Equatable, Sendable {
    public let code: String
    public let message: String
    public let details: DatafnJSONObject?

    public init(
        code: String,
        message: String,
        details: DatafnJSONObject? = nil
    ) {
        self.code = code
        self.message = message
        self.details = details
    }
}

@MainActor
@Observable
public final class DatafnObservedQuery<Value: Sendable> {
    public private(set) var value: Value
    public private(set) var isLoading: Bool
    public private(set) var lastError: DatafnObservedError?

    @ObservationIgnored private let source: DatafnRuntimeObservationSource
    @ObservationIgnored private let loader: @Sendable (DatafnRuntimeObservationSource) throws -> Value
    @ObservationIgnored private let shouldRefresh: @Sendable (DatafnStoreEvent) -> Bool
    @ObservationIgnored private var observerToken: UUID?

    public init(
        initialValue: Value,
        source: DatafnRuntimeObservationSource,
        refreshOn: @escaping @Sendable (DatafnStoreEvent) -> Bool = { _ in true },
        loader: @escaping @Sendable (DatafnRuntimeObservationSource) throws -> Value
    ) {
        self.value = initialValue
        self.isLoading = false
        self.lastError = nil
        self.source = source
        self.loader = loader
        self.shouldRefresh = refreshOn
        self.observerToken = source.subscribe { [weak self] event in
            guard let self, self.shouldRefresh(event) else {
                return
            }
            Task { @MainActor [weak self] in
                self?.refresh()
            }
        }
        refresh()
    }

    deinit {
        if let observerToken {
            source.unsubscribe(observerToken)
        }
    }

    public func refresh() {
        isLoading = true
        defer { isLoading = false }

        do {
            value = try loader(source)
            lastError = nil
        } catch {
            lastError = Self.normalize(error)
        }
    }

    public static func recordsRefreshPredicate(
        resource: String
    ) -> @Sendable (DatafnStoreEvent) -> Bool {
        { event in
            switch event.name {
            case DatafnCoreDataStore.storageChangedEvent,
                DatafnCoreDataStore.hydrationChangedEvent:
                guard let eventResource = event.payload["resource"]?.stringValue else {
                    return false
                }
                return eventResource == resource || eventResource == "*"
            case DatafnCoreDataStore.mutationAppliedEvent,
                DatafnCoreDataStore.mutationRejectedEvent,
                DatafnCoreDataStore.syncStatusEvent,
                DatafnCoreDataStore.syncFailedEvent,
                DatafnCoreDataStore.healthChangedEvent:
                return true
            default:
                return false
            }
        }
    }

    private static func normalize(_ error: Error) -> DatafnObservedError {
        if let observedError = error as? DatafnObservedError {
            return observedError
        }

        if let storeError = error as? DatafnCoreDataStoreError {
            return DatafnObservedError(
                code: "INTERNAL",
                message: String(describing: storeError),
                details: ["path": "DatafnObservedQuery"]
            )
        }

        return DatafnObservedError(
            code: "INTERNAL",
            message: String(describing: error),
            details: ["path": "DatafnObservedQuery"]
        )
    }
}

public extension DatafnObservedQuery where Value == [DatafnJSONObject] {
    convenience init(
        resource: String,
        source: DatafnRuntimeObservationSource
    ) {
        self.init(
            initialValue: [],
            source: source,
            refreshOn: Self.recordsRefreshPredicate(resource: resource),
            loader: { try $0.listRecords(resource: resource) }
        )
    }
}
