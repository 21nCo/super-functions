import SearchFnAdapterContracts
import SearchFnConvenience

@main
struct SearchFnInMemoryExample {
    static func main() async throws {
        let search = InMemorySearchFn(
            defaults: SearchFnDefaults(
                limit: 20,
                limitPerResource: 10,
                fuzzy: .enabled,
                prefix: true
            )
        )

        let client = search.client()

        try await client.initialize(
            SearchFnInitializeParams(
                resources: [
                    SearchFnInitializeResourceConfig(name: "tasks", searchFields: ["title", "body"]),
                    SearchFnInitializeResourceConfig(name: "notes", searchFields: ["body"]),
                ]
            )
        )

        try await client.index(
            SearchFnIndexParams(
                resource: "tasks",
                documents: [
                    SearchFnDocument(id: "t1", fields: ["title": "Hybrid search", "body": "Swift local index"]),
                    SearchFnDocument(id: "t2", fields: ["title": "Fix launch checklist", "body": "Coordinate docs and release"]),
                ]
            )
        )
        try await client.index(
            SearchFnIndexParams(
                resource: "notes",
                documents: [
                    SearchFnDocument(id: "n1", fields: ["body": "Launch notes for the Swift package"]),
                ]
            )
        )

        _ = try await client.search(
            SearchFnSearchParams(resource: "tasks", query: "hybrid")
        )
        _ = try await client.searchAll(
            SearchFnSearchAllParams(query: "launch", resources: ["tasks", "notes"])
        )

        try await client.remove(resource: "tasks", ids: ["t2"])
        try await client.clear(resource: "notes")
        try await client.dispose()
    }
}
