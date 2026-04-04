# FileFn Swift

Native Swift Package Manager support for FileFn clients on iOS and macOS.

## Products

- `FileFnClient` for direct HTTP access to `filefn/server`
- `FileFnSwiftUI` for `PhotosPicker`, file-import, and upload observation helpers
- `FileFnWebViewBridgeHost` for native-backed `WKWebView` shells

## Install

```swift
.package(path: "filefn/swift")
```

```swift
import FileFnClient
import FileFnSwiftUI
import FileFnWebViewBridgeHost
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

`FileFnClient` normalizes the base URL, injects canonical FileFn headers such as `x-request-id` and `x-filefn-client-version`, decodes the canonical envelope shape, and preserves capability-level errors for optional route families.

## Read routes

The native client covers the full Swift contract surface:

- Files: `listFiles`, `getFile`, `deleteFile`, `listVersions`, `getVersion`, `downloadURL`
- Render and artifacts: `resolveRenderable`, `listArtifacts`, `downloadArtifact`
- Capability routes: `listPolicies`, `getStorageQuota`, `createGrant`, `listGrants`, `revokeGrant`, `createShareLink`, `listShareLinks`, `revokeShareLink`, `resolveShareDownload`, `triggerProcessing`
- Upload sessions: `createUploadSession`, `getUploadStatus`, `signPart`, `completePart`, `completeUpload`, `abortUpload`

```swift
let files = try await client.listFiles(limit: 20)
let detail = try await client.getFile(fileId: files.files[0].fileId)
let download = try await client.downloadURL(fileId: detail.fileId)
```

## Foreground uploads

Use `FileFnForegroundUploader` when the app is active and can stream the upload directly:

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

Foreground uploads own the full multipart flow natively: session creation, part signing, direct or proxy part upload, part completion, and final completion.

## Background uploads and recovery

Use `FileFnBackgroundUploader` when uploads must survive suspension and recovery:

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

Persisted snapshots intentionally exclude upload-session tokens and absolute paths. Anonymous upload session tokens are kept in the secret store, and recovery reconciles state against `getUploadStatus` before resuming remaining parts.

## HEIC preprocessing

`FileFnForegroundUploader`, `FileFnBackgroundUploader`, and the WebView bridge all default to `FileFnHEICPreprocessor()`.

- HEIC or HEIF inputs are transcoded to JPEG by default.
- The outgoing MIME type becomes `image/jpeg`.
- The outgoing filename is rewritten to `.jpg`.
- Metadata preserves the original media type through `originalMimeType` when needed.

You can replace or extend the preprocessors on each upload request.

## SwiftUI helpers

`FileFnSwiftUI` adds import helpers that produce disk-backed assets ready for native upload or native-backed WebView registration:

- `FileFnPhotosPickerLoader.load(item:)`
- `FileFnFileImporterLoader.load(url:)`
- `FileFnUploadObservable`

```swift
let asset = try await FileFnPhotosPickerLoader.load(item: item)
let task = FileFnForegroundUploader(client: client).upload(
    asset.makeUploadRequest(policy: "public-image")
)
let observable = FileFnUploadObservable(task: task)
```

## Native-backed WebView mode

`FileFnWebViewBridgeHost` is the native owner for `WKWebView`-rendered apps that still need FileFn uploads, auth, and local previews to stay native.

- The bridge protocol is `filefn-bridge/v1`.
- Native-backed mode is explicit and fail-fast; there is no silent fallback to browser-owned behavior.
- Uploads are started from opaque `assetHandle` values registered in `FileFnNativeAssetRegistry`.
- Preview URLs use `filefn-bridge://asset/{handle}/preview`, never filesystem paths.
- Native code owns upload-session tokens, auth headers, and the actual upload bytes.

Bridge-facing JavaScript lives in [filefn/swift-bridge](../swift-bridge/README.md).

## Contract artifact

The deterministic client contract lives at `filefn/server/contracts/filefn-client-v1.openapi.json`. The source object that generates it lives in `filefn/server/src/client-contract.ts`.

## Local verification

```bash
swift build --package-path filefn/swift
swift test --package-path filefn/swift
swift test --package-path filefn/swift --filter FileFnWebViewBridgeHostTests
npm --workspace filefn/swift-bridge test
npm --prefix filefn/examples/full-demo/server run dev
FILEFN_BASE_URL=http://127.0.0.1:3001/filefn swift test --package-path filefn/swift --filter FileFnIntegrationTests
npm test -- --run filefn/server/tests/client-contract.test.ts
```
