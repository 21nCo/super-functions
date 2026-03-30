import Foundation
import SearchFnAdapterContracts
import SearchFnClient
import SearchFnMemoryAdapter

public final class InMemorySearchFn: @unchecked Sendable {
    private let clientInstance: any SearchFnClientProtocol

    public init(
        pipeline: SearchFnPipelineOptions? = nil,
        defaults: SearchFnDefaults? = nil
    ) {
        let adapter = SearchFnMemoryAdapter(
            pipeline: pipeline,
            defaults: defaults
        )
        self.clientInstance = createSearchClient(
            SearchFnClientConfiguration(
                adapter: adapter,
                defaults: defaults
            )
        )
    }

    public func client() -> any SearchFnClientProtocol {
        clientInstance
    }
}
