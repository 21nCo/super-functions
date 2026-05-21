---
title: SDKs
description: TypeScript server, browser client, Python kernel, native Swift package, viewer resolver, and WKWebView bridge — every filefn SDK speaks the same routes and envelopes.
---

# SDKs

Every filefn SDK is generated from the same canonical contract — you can mix them on a single deployment without breaking anything.

| SDK | Package | Where it runs | Notes |
| --- | --- | --- | --- |
| Server kernel | `@filefn/server` | Node 18+, Bun, Cloudflare Workers (with Workers-safe adapters) | The runtime itself. |
| Browser client | `@filefn/client` | Browser, Node, Bun, Deno | Multipart uploads, OPFS offline, HEIC preprocessing. |
| Python kernel | `filefn` (PyPI) | Python 3.10+ | One-to-one with the Node kernel. Same routes, same errors. |
| Swift client | `FileFnClient` (SPM) | iOS 16+, macOS 13+ | Foreground / background uploaders, HEIC preprocessing, secret-store-backed token recovery. |
| SwiftUI helpers | `FileFnSwiftUI` (SPM) | iOS, macOS | `PhotosPicker` / `fileImporter` loaders, `FileFnUploadObservable`. |
| WKWebView host | `FileFnWebViewBridgeHost` (SPM) | iOS, macOS | The native side of the asset-handle bridge. |
| WKWebView bridge | `@filefn/swift-bridge` | Browser (WebView) | The JS side of the asset-handle bridge. |
| Processing | `@filefn/processing` | Node 18+, Bun | Bundled processors (thumbnails, OCR, video, audio, etc.). |
| Viewer | `@filefn/viewer` | Browser, Node | Framework-agnostic render-intent resolver. |

## Pages in this section

- [@filefn/server](./server) — the kernel API: `createFileFn`, `FileProvider`, `Authorizer`, `QuotaProvider`, processor authoring.
- [@filefn/client](./client) — `createFileFnClient`, `uploadFile`, `resumeUpload`, `resolveRenderable`, OPFS offline.
- [filefn (Python)](./python) — `create_file_fn`, `FileFnConfig`, the same shape in Python.
- [Swift](./swift) — `FileFnClient`, foreground / background uploaders, SwiftUI helpers.
- [@filefn/viewer](./viewer) — render-intent resolver utilities.
- [Swift bridge](./swift-bridge) — `FileFnWebViewBridgeHost` + `@filefn/swift-bridge` for native-backed WebView apps.
