# @filefn/swift-bridge

JavaScript bridge package for `WKWebView` apps that want FileFn to stay native-owned.

## What it does

`@filefn/swift-bridge` gives a WebView-rendered app a thin, versioned bridge to the native Swift runtime in `filefn/swift`.

- The protocol version is `filefn-bridge/v1`.
- A `handshake()` is required before any native-backed request.
- The bridge exposes FileFn reads, capability routes, health checks, and native-owned uploads.
- Native-backed mode is explicit and fail-fast. If the bridge is unavailable, requests fail with stable bridge errors instead of falling back to browser-owned behavior.

## Handshake

Create a native-backed client and complete the handshake before making requests:

```ts
import { createNativeBackedFileFnClient } from "@filefn/swift-bridge";

const client = createNativeBackedFileFnClient({
  clientId: "ios-webview-shell",
  mode: "native-backed",
  baseURL: "https://api.example.com/filefn",
});

await client.handshake();
```

The handshake confirms that upload ownership and auth ownership are both native, and it returns the preview scheme plus the mounted bridge capabilities.

## Upload semantics

Uploads are asset-handle based, not raw-byte based.

- Native code imports or captures the asset first.
- Swift registers that asset in `FileFnNativeAssetRegistry` and returns an opaque `assetHandle`.
- JavaScript calls `upload.start({ assetHandle, policy, ... })`.
- Swift owns session creation, anonymous upload tokens, multipart/proxy transfer, completion, and recovery.

This package does not bridge browser-owned `Blob`, `File`, or raw upload bytes through `WKScriptMessageHandler`. Large binary payloads stay native.

## Events

The bridge exposes a stable event stream:

- `bridge.ready`
- `bridge.closed`
- `upload.progress`
- `upload.completed`
- `upload.failed`
- `upload.cancelled`
- `health.changed`

Events are redacted before leaving Swift, so auth headers, signed query strings, upload session tokens, and absolute filesystem paths are not exposed to JavaScript.

## Native previews

Pending local previews use opaque bridge URLs of the form `filefn-bridge://asset/{handle}/preview`. Web content never receives a direct filesystem path.

## Contract artifact

The HTTP routes behind the native client are documented in `filefn/server/contracts/filefn-client-v1.openapi.json`. The native-backed bridge intentionally sits above that HTTP contract and below the WebView UI layer.

## Local verification

```bash
npm --workspace filefn/swift-bridge test
swift test --package-path filefn/swift --filter FileFnWebViewBridgeHostTests
npm test -- --run filefn/server/tests/client-contract.test.ts
```
