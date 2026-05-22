---
title: Swift Quickstart
description: Use FileFnClient on iOS and macOS via Swift Package Manager — foreground and background uploads, HEIC preprocessing, and SwiftUI helpers.
---

# Swift on iOS / macOS

`AuthFnSwift`'s sibling, `FileFnClient`, is a native Swift Package Manager target that talks to a filefn server. It owns multipart sessions, background recovery, anonymous upload tokens, and HEIC preprocessing.

## Install

```swift
.package(path: "filefn/swift")
```

For external consumers we publish the same package via SPM at the repository URL — see the repo `Package.swift`.

```swift
import FileFnClient
import FileFnSwiftUI
```

## Configure a client

```swift
struct BearerTokenAuthProvider: FileFnAuthProvider {
    let token: String

    func headers(for _: FileFnAuthContext) async throws -> [String: String] {
        ["Authorization": "Bearer \(token)"]
    }
}

let client = try FileFnClient(
    configuration: FileFnClientConfiguration(
        baseURL: URL(string: "https://api.example.com/filefn")!,
        authProvider: BearerTokenAuthProvider(token: "<token>")
    )
)
```

`FileFnClient` normalises the base URL, injects canonical FileFn headers (`x-request-id`, `x-filefn-client-version`), decodes envelope responses, and exposes typed errors for capability routes.

## Foreground upload

Use `FileFnForegroundUploader` while the app is active and can stream the upload directly:

```swift
let uploader = FileFnForegroundUploader(client: client)
let task = uploader.upload(
    FileFnForegroundUploadRequest(
        source: .fileURL(localFileURL),
        policy: "public-image",
        fileName: "avatar.png",
        mimeType: "image/png",
        metadata: ["source": .string("camera-roll")]
    )
)

let result = try await task.value()
```

The uploader owns:

- session creation
- part signing (S3-style or proxy)
- direct or proxy part upload
- part completion + final completion

## Background upload

`FileFnBackgroundUploader` survives suspension and recovery:

```swift
let uploader = FileFnBackgroundUploader(
    client: client,
    configuration: FileFnBackgroundUploadConfiguration(
        workingDirectory: workingDirectory
    )
)

let snapshot = try await uploader.enqueue(
    FileFnForegroundUploadRequest(
        source: .fileURL(localFileURL),
        policy: "public-image"
    )
)

let recovered = try await uploader.recover()
```

Persisted snapshots intentionally exclude session tokens and absolute paths. Anonymous upload tokens live in the secret store, and recovery reconciles state against `getUploadStatus` before resuming the remaining parts.

## HEIC preprocessing

`FileFnForegroundUploader`, `FileFnBackgroundUploader`, and the WebView bridge all default to `FileFnHEICPreprocessor()`:

- HEIC / HEIF inputs are transcoded to JPEG by default.
- Outgoing MIME type → `image/jpeg`.
- Outgoing filename rewritten to `.jpg`.
- Original media type is preserved through `originalMimeType` in metadata.

Set or replace preprocessors per request to skip or extend conversion.

## SwiftUI helpers

`FileFnSwiftUI` ships disk-backed loaders for `PhotosPicker` and `fileImporter`:

```swift
let asset = try await FileFnPhotosPickerLoader.load(item: item)
let task = FileFnForegroundUploader(client: client).upload(
    asset.makeUploadRequest(policy: "public-image")
)
let observable = FileFnUploadObservable(task: task)
```

`FileFnUploadObservable` is a `@Observable` wrapper that publishes progress and result for use in views.

## WKWebView native-backed mode

When your app is a WebView shell that still needs native-owned uploads, install `FileFnWebViewBridgeHost` on the host side and `@filefn/swift-bridge` on the JS side. The bridge protocol is `filefn-bridge/v1`, uploads are asset-handle based, and previews use `filefn-bridge://asset/{handle}/preview` URLs that never leak filesystem paths to JS. See [SDKs › Swift bridge](../sdk/swift-bridge).

## Next steps

- [SDKs › Swift](../sdk/swift) — full client API reference.
- [Recipes › HEIC conversion](../recipes/heic-conversion).
