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
    @ObservationIgnored private let loader: @Sendable (DatafnRuntimeObservationSource) async throws -> Value
    @ObservationIgnored private let shouldRefresh: @Sendable (DatafnStoreEvent) -> Bool
    @ObservationIgnored private var observerToken: UUID?
    @ObservationIgnored private var refreshTask: Task<Void, Never>?
    @ObservationIgnored private var refreshGeneration = 0

    public init(
        initialValue: Value,
        source: DatafnRuntimeObservationSource,
        refreshOn: @escaping @Sendable (DatafnStoreEvent) -> Bool = { _ in true },
        loader: @escaping @Sendable (DatafnRuntimeObservationSource) async throws -> Value
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
        refreshTask?.cancel()
        if let observerToken {
            source.unsubscribe(observerToken)
        }
    }

    public func refresh() {
        refreshTask?.cancel()
        isLoading = true
        refreshGeneration += 1
        let generation = refreshGeneration
        let source = self.source
        let loader = self.loader
        refreshTask = Task.detached { [weak self] in
            do {
                let loadedValue = try await loader(source)
                await self?.applyLoadedValue(loadedValue, generation: generation)
            } catch {
                if error is CancellationError {
                    await self?.applyCancellation(generation: generation)
                    return
                }
                await self?.applyLoadError(error, generation: generation)
            }
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

    private func applyLoadedValue(_ loadedValue: Value, generation: Int) {
        guard generation == refreshGeneration else {
            return
        }
        value = loadedValue
        lastError = nil
        isLoading = false
    }

    private func applyLoadError(_ error: Error, generation: Int) {
        guard generation == refreshGeneration else {
            return
        }
        lastError = Self.normalize(error)
        isLoading = false
    }

    private func applyCancellation(generation: Int) {
        guard generation == refreshGeneration else {
            return
        }
        isLoading = false
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
