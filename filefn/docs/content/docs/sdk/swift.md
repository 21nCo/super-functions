---
title: Swift
description: The native Swift Package Manager target — FileFnClient, foreground / background uploaders, SwiftUI helpers, secret-store-backed token recovery.
---

# Swift

```swift
.package(path: "filefn/swift")
```

`filefn/swift` ships three SPM targets:

- `FileFnClient` — pure HTTP client.
- `FileFnSwiftUI` — `PhotosPicker` / `fileImporter` loaders + `FileFnUploadObservable`.
- `FileFnWebViewBridgeHost` — native side of the WKWebView bridge.

## `FileFnClient`

```swift
import FileFnClient

struct BearerAuthProvider: FileFnAuthProvider {
    let token: String
    func headers(for _: FileFnAuthContext) async throws -> [String: String] {
        ["Authorization": "Bearer \(token)"]
    }
}

let client = try FileFnClient(
    configuration: FileFnClientConfiguration(
        baseURL: URL(string: "https://api.example.com/filefn")!,
        authProvider: BearerAuthProvider(token: token)
    )
)
```

The client:

- normalises the base URL
- injects `x-request-id` and `x-filefn-client-version`
- decodes envelopes (`{ ok, data }` / `{ ok, error }`)
- throws typed `FileFnError` for non-2xx responses

## Read routes

```swift
let files = try await client.listFiles(limit: 20)
let detail = try await client.getFile(fileId: files.files[0].fileId)
let versions = try await client.listVersions(fileId: detail.fileId)
let download = try await client.downloadURL(fileId: detail.fileId)
let renderable = try await client.resolveRenderable(fileId: detail.fileId, intent: .preview)
let artifacts = try await client.listArtifacts(fileId: detail.fileId)
```

## Capability routes

```swift
let policies = try await client.listPolicies()
let quota = try await client.getStorageQuota()
let grant = try await client.createGrant(fileId: detail.fileId, input: .init(userId: "alice", canRead: true, canShare: true))
let share = try await client.createShareLink(fileId: detail.fileId, input: .init(expiresAt: Date().addingTimeInterval(3600)))
let renderable = try await client.triggerProcessing(fileId: detail.fileId, input: .init(processors: ["thumbnail"]))
```

The capability methods throw `FileFnCapabilityError` when the server doesn't expose the capability (e.g. share links disabled in config). Catch and degrade gracefully.

## Foreground upload

`FileFnForegroundUploader` is the right choice when the app is active and can stream the upload directly:

```swift
let uploader = FileFnForegroundUploader(client: client)

let task = uploader.upload(
    FileFnForegroundUploadRequest(
        source: .fileURL(localURL),
        policy: "public-image",
        fileName: "avatar.png",
        mimeType: "image/png",
        metadata: ["source": .string("camera-roll")]
    )
)

let result = try await task.value()
// result.fileId, result.versionId
```

The uploader owns:

- session creation
- per-part signing (S3-style or proxy)
- direct or proxy part PUT
- per-part completion
- final completion

## Background upload

`FileFnBackgroundUploader` survives suspension and recovery:

```swift
let uploader = FileFnBackgroundUploader(
    client: client,
    configuration: FileFnBackgroundUploadConfiguration(workingDirectory: workingURL)
)

let snapshot = try await uploader.enqueue(
    FileFnForegroundUploadRequest(source: .fileURL(localURL), policy: "public-image")
)

// On app relaunch:
let recovered = try await uploader.recover()
for task in recovered.resumed {
    Task { try await task.value() }
}
```

Persisted snapshots intentionally exclude session tokens and absolute paths. Anonymous upload tokens are stored in the secret store keyed by snapshot id; recovery reconciles state against `getUploadStatus` before resuming the remaining parts.

## HEIC preprocessing

`FileFnForegroundUploader`, `FileFnBackgroundUploader`, and the WebView bridge default to `FileFnHEICPreprocessor()`. Pass your own (or `[]` to opt out):

```swift
let request = FileFnForegroundUploadRequest(
    source: .fileURL(localURL),
    policy: "public-image",
    preprocessors: [] // skip HEIC conversion
)
```

## SwiftUI helpers

```swift
import FileFnSwiftUI
import PhotosUI

struct UploadView: View {
    @State private var picked: PhotosPickerItem?
    @State private var uploader = FileFnForegroundUploader(client: client)

    var body: some View {
        PhotosPicker(selection: $picked, matching: .images) {
            Text("Pick a photo")
        }
        .onChange(of: picked) { _, newItem in
            guard let item = newItem else { return }
            Task {
                let asset = try await FileFnPhotosPickerLoader.load(item: item)
                let task = uploader.upload(asset.makeUploadRequest(policy: "public-image"))
                _ = try await task.value()
            }
        }
    }
}
```

`FileFnUploadObservable` wraps an upload task as `@Observable` for use in views:

```swift
@State private var observable: FileFnUploadObservable?

let task = uploader.upload(request)
observable = FileFnUploadObservable(task: task)

// Use observable.progress, observable.result, observable.error in your view body.
```

## WKWebView mode

For WebView shells, see [SDKs › Swift bridge](./swift-bridge).

## Errors

```swift
do {
    let detail = try await client.getFile(fileId: "missing")
} catch let error as FileFnError {
    if error.code == .notFound { /* ... */ }
}
```

`FileFnError.code` is the canonical `ErrorCodes` enum.

## See also

- [Recipes › HEIC conversion](../recipes/heic-conversion).
- [Quickstart › Swift](../quickstart/swift).
