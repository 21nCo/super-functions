# DataFn Todo App Example

This example now serves as the dual-mode reference web app for the Apple-native bridge work.

## Topologies

| Topology | Where the app runs | Local persistence | Remote persistence | Sync owner |
|---|---|---|---|---|
| Browser-owned | Browser tab | IndexedDB | DataFn server | JavaScript |
| Embedded native-backed DataFn-server | `WKWebView` in the Apple host | Core Data | DataFn server | Swift |
| Embedded native-backed CloudKit | `WKWebView` in the Apple host | Core Data | CloudKit private database | Swift |

The same Svelte app detects injected bootstrap globals from the Apple host:

- `window.__DATAFN_EXAMPLE_TOPOLOGY__`
- `window.__DATAFN_NATIVE_CONFIG__`

If those globals request native-backed mode, the app swaps:

- `IndexedDbStorageAdapter` -> `createNativeBackedStorageAdapter(...)`
- direct JavaScript sync ownership -> `sync.owner = "native"`
- browser HTTP transport -> `createNativeBackedRemoteAdapter(...)`
- JavaScript sync engine control -> `createNativeSyncController(...)`

In browser-owned mode, the example behaves exactly as before and keeps IndexedDB plus JavaScript-owned sync.

## Run In Browser-owned Mode

1. Start the server:

```bash
npm --prefix datafn/examples/todo-app/server install
npm --prefix datafn/examples/todo-app/server run dev
```

2. Start the client:

```bash
npm --prefix datafn/examples/todo-app/client install
npm --prefix datafn/examples/todo-app/client run dev
```

3. Open the Vite URL directly in the browser.

## Run In Embedded Native-backed Mode

1. Keep the same client and server running.
2. Open the Apple host project at `datafn/examples/apple-webview-host/DatafnAppleHost.xcodeproj`.
3. Run the `DatafnAppleHost` scheme in Xcode.
4. Point the host at the same Vite client URL.
5. Choose either:

- `Native-backed DataFn-server`
- `Native-backed CloudKit`

## Caveats

- Native-backed mode intentionally disables IndexedDB fallback. If the bridge is missing, the app should fail before persistence starts.
- The example disables the local IndexedDB-backed search provider in native-backed mode so the embedded app does not create sidecar browser databases while Swift owns persistence.
- CloudKit mode needs a real container identifier and signing entitlements before device-to-device sync can work on a real signed app.
