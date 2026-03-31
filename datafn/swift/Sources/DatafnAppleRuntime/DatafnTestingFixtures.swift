import DatafnCoreDataStore
import Foundation

func makeSearchSchemaJSONForTesting() -> Data {
    let json = """
    {
      "resources": [
        {
          "name": "todos",
          "version": 1,
          "fields": [
            { "name": "text", "type": "string", "required": false }
          ],
          "indices": {
            "search": ["text"]
          }
        },
        {
          "name": "categories",
          "version": 1,
          "fields": [
            { "name": "name", "type": "string", "required": false }
          ],
          "indices": {
            "search": ["name"]
          }
        },
        {
          "name": "audit",
          "version": 1,
          "fields": [
            { "name": "kind", "type": "string", "required": false }
          ],
          "indices": {
            "search": []
          }
        }
      ],
      "relations": []
    }
    """

    return Data(json.utf8)
}

func makeSearchSchemaForTesting() -> DatafnRuntimeSchema {
    try! DatafnRuntimeSchema.decode(from: makeSearchSchemaJSONForTesting())
}

func makeStoreRootURLForTesting() -> URL {
    testingRootURL
}

func makeSupportDirectoryURLForTesting() -> URL {
    testingRootURL
        .appendingPathComponent("Support", isDirectory: true)
}

func makeDatafnServerSyncBackendForTesting() -> DatafnSyncBackendConfiguration {
    .datafnServer(
        DatafnServerSyncConfiguration(
            baseURL: URL(string: "https://api.example.com/datafn")!,
            profileID: "default"
        )
    )
}

private let testingRootURL: URL = FileManager.default.temporaryDirectory
    .appendingPathComponent(
        "datafn-apple-runtime-tests-\(UUID().uuidString)",
        isDirectory: true
    )

func makeBlockingSearchRootURLForTesting() throws -> URL {
    let rootURL = makeStoreRootURLForTesting()
    try FileManager.default.createDirectory(at: rootURL, withIntermediateDirectories: true)
    let blockingFileURL = rootURL.appendingPathComponent("blocking-parent", isDirectory: false)
    try Data("blocked".utf8).write(to: blockingFileURL)
    return blockingFileURL.appendingPathComponent("SearchFn", isDirectory: true)
}
