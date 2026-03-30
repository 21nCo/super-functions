# DataFn Apple Runtime

Swift Package Manager package for Apple-native DataFn runtimes, Core Data persistence, `WKWebView` bridge hosting, Swift-owned sync backends, and SwiftUI observation bindings.

## Products

- `DatafnAppleRuntime`
- `DatafnCoreDataStore`
- `DatafnWebViewBridgeHost`
- `DatafnServerSync`
- `DatafnCloudKitSync`
- `DatafnSwiftUI`

## Topologies

| Topology | Local persistence | Remote persistence | Sync owner |
|---|---|---|---|
| Embedded DataFn-server | Core Data | DataFn server | Swift |
| Embedded CloudKit | Core Data | CloudKit private database | Swift |

The browser-owned IndexedDB topology remains on the JavaScript side and is documented in `@datafn/client`.

## Runtime Example

```swift
import DatafnAppleRuntime

let configuration = DatafnAppleRuntimeConfiguration(
    schemaJSON: DatafnExampleSchema.json,
    schemaHash: "todo-app-example-v1",
    namespace: "org-1:user-1",
    clientID: "apple-host-device",
    storeRootURL: FileManager.default.temporaryDirectory.appendingPathComponent(
        "datafn-apple-example",
        isDirectory: true
    ),
    syncBackend: .datafnServer(
        DatafnServerSyncConfiguration(
            baseURL: URL(string: "http://127.0.0.1:3001/datafn")!,
            websocketURL: URL(string: "ws://127.0.0.1:3001/datafn/ws")!,
            profileID: "default"
        )
    )
)

let runtime = try await DatafnAppleRuntime(configuration: configuration)
try await runtime.start()
let bridgeHost = await runtime.makeBridgeHost(handlerName: "datafn")
let observationSource = await runtime.makeObservationSource()
```

Switch the `syncBackend` to `.iCloud(...)` for CloudKit personal multi-device mode.

## SwiftUI Layer

`DatafnSwiftUI` stays thin and subscribes to the same native store/event stream used by the WebView bridge:

- `DatafnObservedQuery<Value>`
- `DatafnObservedMutationState`

That means SwiftUI and embedded web content stay synchronized through one authoritative Core Data namespace store.
