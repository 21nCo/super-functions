import Foundation
import SearchFnAdapterContracts
import SearchFnClient
import SearchFnSQLiteAdapter

public final class SearchFn: @unchecked Sendable {
    private let clientInstance: any SearchFnClientProtocol

    public init(sqlite configuration: SearchFnSQLiteAdapterConfiguration) throws {
        guard configuration.rootURL.isFileURL else {
            throw SearchFnError.invalid("rootURL must be a file URL", path: "rootURL")
        }
        if configuration.indexKey.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            throw SearchFnError.invalid("indexKey must be a non-empty string", path: "indexKey")
        }

        let adapter = SearchFnSQLiteAdapter(configuration: configuration)
        self.clientInstance = createSearchClient(
            SearchFnClientConfiguration(
                adapter: adapter,
                defaults: configuration.defaults
            )
        )
    }

    public func client() -> any SearchFnClientProtocol {
        clientInstance
    }
}
