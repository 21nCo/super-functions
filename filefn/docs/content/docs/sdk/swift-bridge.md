---
title: Swift bridge
description: Native-backed WKWebView bridge — FileFnWebViewBridgeHost on the Swift side, @filefn/swift-bridge on the JS side, with asset-handle uploads and bridge-scheme previews.
---

# Swift bridge

When your app is a WebView shell that still wants native-owned uploads, auth, and previews, install:

- `FileFnWebViewBridgeHost` (SPM) on the Swift side.
- `@filefn/swift-bridge` (npm) on the JavaScript side.

The bridge protocol is `filefn-bridge/v1`. It is intentionally fail-fast — if the bridge is not present, requests do not silently fall back to browser-owned behaviour.

## Why a bridge?

A WebView app can theoretically use `@filefn/client` directly. In practice:

- Browser-owned uploads can't survive the app being backgrounded for long.
- WebViews struggle with iOS background URL sessions.
- Auth tokens stored in localStorage can be stolen by injected JS.
- Pending-local previews leak filesystem paths through `file://` URLs.

The bridge keeps every sensitive operation on the native side: tokens in the keychain, uploads in `URLSession`, previews behind opaque scheme URLs.

## JavaScript side

```ts
import { createNativeBackedFileFnClient } from "@filefn/swift-bridge";

const client = createNativeBackedFileFnClient({
  clientId: "ios-webview-shell",
  mode: "native-backed",
  baseURL: "https://api.example.com/filefn",
});

await client.handshake();
```

The handshake confirms:

- protocol version (`filefn-bridge/v1`)
- upload ownership (always `"native"` in native-backed mode)
- auth ownership (always `"native"`)
- preview scheme (`filefn-bridge://`)

After handshake, the JS surface is a near-twin of `@filefn/client`:

```ts
const file = await client.getFile(fileId);
const url = await client.downloadUrl(fileId);
const renderable = await client.resolveRenderable({ fileId, intent: "preview" });
```

Reads pass through to the native HTTP client. Renderable URLs come back as either real URLs (uploaded files) or `filefn-bridge://asset/{handle}/preview` (pending-local).

## Uploads (asset-handle based)

```ts
// Native side has already imported / captured the asset and registered it.
const handle = await client.upload.start({
  assetHandle: "asset_2cd9…",
  policy: "public-image",
  metadata: { source: "camera" },
});

handle.onProgress((p) => updateUI(p));
const result = await handle.done();
```

Bytes don't cross the JS bridge. Blob/File/Buffer objects are not sent through `WKScriptMessageHandler` — large binary payloads stay in Swift.

## Native side

```swift
import FileFnWebViewBridgeHost

let host = FileFnWebViewBridgeHost(
    client: fileFnClient,
    configuration: FileFnWebViewBridgeHostConfiguration(
        clientId: "ios-webview-shell",
        previewScheme: "filefn-bridge"
    )
)

// Wire the bridge into your WKWebView's userContentController.
host.install(on: webView)

// When the user picks an asset (PhotosPicker, fileImporter, etc.):
let asset = try await FileFnPhotosPickerLoader.load(item: pickedItem)
let registry = host.assetRegistry
let assetHandle = try await registry.register(asset)

// JS now has a stable opaque handle to call upload.start with.
```

The host:

- enforces the protocol version
- emits redacted events (`bridge.ready`, `upload.progress`, `upload.completed`, `upload.failed`, `upload.cancelled`, `health.changed`)
- owns session creation, anonymous tokens, multipart/proxy transfer, completion, and recovery

## Native previews

Pending-local previews use `filefn-bridge://asset/{handle}/preview`. The host registers a `WKURLSchemeHandler` that resolves these to actual bytes (decoded HEIC, transformed images, fallback placeholder) without exposing absolute filesystem paths to JS.

## Events

JS subscribes to a stable redacted event stream:

```ts
client.events.on("upload.progress", (e) => /* { uploadId, bytesUploaded, bytesTotal } */);
client.events.on("upload.completed", (e) => /* { uploadId, fileId, versionId } */);
client.events.on("upload.failed", (e) => /* { uploadId, code, message } */);
client.events.on("health.changed", (e) => /* { online } */);
```

## Verification

```bash
swift test --package-path filefn/swift --filter FileFnWebViewBridgeHostTests
npm --workspace filefn/swift-bridge test
```

Both suites are part of the regular CI matrix.

## See also

- [SDKs › Swift](./swift) — pure-native (no WebView) usage.
- [Recipes › HEIC conversion](../recipes/heic-conversion).
