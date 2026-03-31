# DataFn Apple WebView Host

This reference host demonstrates the final Apple-native topology matrix from the Core Data bridge spec:

| Topology | Web app runtime | Local persistence | Remote persistence | Sync owner |
|---|---|---|---|---|
| Browser-owned | Safari / desktop browser | IndexedDB | DataFn server | JavaScript |
| Embedded native-backed DataFn-server | `WKWebView` in SwiftUI | Core Data | DataFn server | Swift |
| Embedded native-backed CloudKit | `WKWebView` in SwiftUI | Core Data | CloudKit private database | Swift |

The host injects a deterministic bootstrap payload into the web app before page load:

- `window.__DATAFN_EXAMPLE_TOPOLOGY__`
- `window.__DATAFN_NATIVE_CONFIG__`

The updated todo app example consumes those globals and switches between browser-owned IndexedDB mode and native-backed Core Data mode without changing the app codebase.

Search ownership follows the same split:

- Browser-owned mode keeps a JavaScript SearchFn provider backed by IndexedDB.
- Embedded native-backed modes configure `DatafnAppleRuntime` with a Swift-owned SearchFn backend persisted under the namespace support directory.
- CloudKit mode syncs records through CloudKit, but the SearchFn index remains derived local state on each device and is not synced as index files.

## Project Layout

- `DatafnAppleHost/`
  Native SwiftUI app source.
- `DatafnAppleHostTests/`
  Host topology and bootstrap tests.
- `DatafnAppleHost.xcodeproj/`
  iOS project used by the final verification command.
- `scripts/verify-topologies.sh`
  Reproducible final verification command set.

## Running The Example

1. Start the todo app server:

```bash
npm --prefix datafn/examples/todo-app/server install
npm --prefix datafn/examples/todo-app/server run dev
```

2. Start the todo app client:

```bash
npm --prefix datafn/examples/todo-app/client install
npm --prefix datafn/examples/todo-app/client run dev
```

3. Open the same app directly in the browser at the Vite URL to exercise browser-owned IndexedDB mode.

4. Open `datafn/examples/apple-webview-host/DatafnAppleHost.xcodeproj` in Xcode, run the `DatafnAppleHost` scheme on an iOS simulator, and point the embedded URL at the same Vite app.

5. Switch the host topology:

- `Browser-owned`
  No native bridge. The web app uses IndexedDB and JavaScript-owned sync.
- `Native-backed DataFn-server`
  Swift initializes `DatafnAppleRuntime`, owns the Core Data store, attaches the `WKWebView` bridge host, and runs DataFn-server sync plus native SearchFn indexing against the same namespace store the web app reads.
- `Native-backed CloudKit`
  Swift initializes `DatafnAppleRuntime` in `icloud` mode. The web app stays native-backed, while Swift owns persistence, native SearchFn indexing, and CloudKit synchronization.

## Operational Caveats

- Native-backed mode is fail-fast. If the WebView bridge is unavailable, the web app must fail before persistence starts instead of falling back to IndexedDB.
- The example host defaults to `http://127.0.0.1:4173` for the web app and `http://127.0.0.1:3001/datafn` for the DataFn server runtime.
- CloudKit mode needs a real iCloud container identifier plus matching app entitlements before end-to-end device sync can work on signed builds. The example project keeps the container ID configurable in the UI so teams can swap in their own container.
- CloudKit does not sync the SearchFn index files themselves. Each device rebuilds and maintains its local index from the Core Data records that CloudKit merges.
- The bundled HTML fallback is only a bootstrap inspector. The real dual-mode story is the `todo-app` example running directly in the browser and inside `WKWebView`.

## Final Verification

Run the consolidated script from the repository root:

```bash
bash datafn/examples/apple-webview-host/scripts/verify-topologies.sh
```

Or run the commands individually:

```bash
npm --prefix datafn/swift-bridge test
npm --prefix datafn/client test
swift test --package-path datafn/swift
xcodebuild -project datafn/examples/apple-webview-host/DatafnAppleHost.xcodeproj -scheme DatafnAppleHost -destination 'platform=iOS Simulator,name=iPhone 16' test
```
