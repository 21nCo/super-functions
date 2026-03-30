import DatafnSearchContracts
import Foundation

public enum DatafnSearchFnBackendFactory {
    public static func make(
        searchConfiguration: DatafnSearchBackendConfiguration,
        namespace: String,
        supportDirectoryURL: URL
    ) -> DatafnSearchFnBackend {
        DatafnSearchFnBackend(
            configuration: resolveConfiguration(
                searchConfiguration: searchConfiguration,
                namespace: namespace,
                supportDirectoryURL: supportDirectoryURL
            )
        )
    }

    public static func resolveConfiguration(
        searchConfiguration: DatafnSearchBackendConfiguration,
        namespace: String,
        supportDirectoryURL: URL
    ) -> DatafnSearchFnBackendConfiguration {
        DatafnSearchFnBackendConfiguration(
            searchConfiguration: searchConfiguration,
            searchRootURL: searchConfiguration.searchRootURL
                ?? supportDirectoryURL.appendingPathComponent("SearchFn", isDirectory: true),
            indexKey: namespace
        )
    }
}
