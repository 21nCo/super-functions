# @datafn/swift-bridge

Official bridge package for running `@datafn/client` inside `WKWebView` while a Swift host owns persistence and sync.

## What It Exports

- `createWKWebViewBridgeBus(...)`
- `createNativeBackedStorageAdapter(...)`
- `createNativeBackedRemoteAdapter(...)`
- `createNativeBackedSearchProvider(...)`
- `createNativeSyncController(...)`
- `DATAFN_BRIDGE_PROTOCOL`

## Supported Topologies

| Topology | Storage adapter | Remote adapter | Sync controller |
|---|---|---|---|
| Browser-owned | IndexedDB / Memory | HTTP transport | JavaScript `SyncEngine` |
| Native-backed DataFn-server | Native-backed Core Data | Native-backed remote adapter | Native sync controller |
| Native-backed CloudKit | Native-backed Core Data | Native-backed remote adapter | Native sync controller |

## Basic Usage

```typescript
import { createDatafnClient } from "@datafn/client";
import {
  createNativeBackedRemoteAdapter,
  createNativeBackedStorageAdapter,
  createNativeSyncController,
  createWKWebViewBridgeBus,
} from "@datafn/swift-bridge";

const bus = createWKWebViewBridgeBus({ handlerName: "datafn" });

const client = createDatafnClient({
  schema,
  clientId: "apple-webview-device",
  namespace: "org-1:user-1",
  storage: createNativeBackedStorageAdapter(bus),
  sync: {
    owner: "native",
    mode: "sync",
    offlinability: true,
    remoteAdapter: createNativeBackedRemoteAdapter(bus),
    native: {
      syncController: createNativeSyncController(bus),
      remoteMode: "datafn-server",
      expectedSchemaHash: "todo-app-example-v1",
      failIfUnavailable: true,
      remoteProfile: "default",
    },
  },
});
```

For CloudKit-backed personal apps, change `remoteMode` to `"icloud"`.

## Contract Notes

- The bridge uses the canonical `datafn-bridge/v1` request/response/event envelopes.
- Native-backed mode is explicit and fail-fast.
- Optional storage semantics such as atomic missing-record merges are enabled only when the native host advertises them during the handshake.
- IndexedDB must not be used as a fallback persistence layer in native-backed mode.
- The same bridge event stream should drive both JavaScript signals and SwiftUI observers from the shared native store.
