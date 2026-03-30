import Foundation
import SearchFnAdapterContracts
import SearchFnConvenience
import SearchFnSQLiteAdapter

@main
struct SearchFnSQLiteExample {
    static func main() async throws {
        let rootURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("searchfn-swift-example", isDirectory: true)

        let search = try SearchFn(
            sqlite: SearchFnSQLiteAdapterConfiguration(
                rootURL: rootURL,
                indexKey: "project-docs",
                defaults: SearchFnDefaults(limit: 10, limitPerResource: 5, fuzzy: .enabled, prefix: true)
            )
        )

        let client = search.client()

        try await client.initialize(
            SearchFnInitializeParams(
                resources: [
                    SearchFnInitializeResourceConfig(name: "docs", searchFields: ["title", "body"]),
                    SearchFnInitializeResourceConfig(name: "guides", searchFields: ["title"]),
                ]
            )
        )

        try await client.index(
            SearchFnIndexParams(
                resource: "docs",
                documents: [
                    SearchFnDocument(id: "d1", fields: ["title": "Getting started", "body": "Swift search runtime"]),
                    SearchFnDocument(id: "d2", fields: ["title": "Persistence", "body": "SQLite-backed local index"]),
                ]
            )
        )
        try await client.index(
            SearchFnIndexParams(
                resource: "guides",
                documents: [
                    SearchFnDocument(id: "g1", fields: ["title": "Swift package guide"]),
                ]
            )
        )

        _ = try await client.search(
            SearchFnSearchParams(resource: "docs", query: "getting")
        )
        _ = try await client.searchAll(
            SearchFnSearchAllParams(query: "swift", resources: ["docs", "guides"])
        )

        try await client.remove(resource: "docs", ids: ["d2"])
        try await client.clear(resource: "guides")
        try await client.dispose()
    }
}
