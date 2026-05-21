---
title: Welcome to filefn
description: Self-hosted, framework-agnostic file uploads, storage, and processing for TypeScript, Python, and Swift. Resumable uploads, signed URLs, share links, OPFS offline, and a built-in processing pipeline — opt in to what you need.
---

# Welcome to filefn

**filefn** is a self-hosted file kernel you mount on the stack you already have. Configure storage and a database adapter, mount the router on your HTTP framework, and call it from typed clients on web, mobile, and Python backends. It runs anywhere Node, Bun, or Python runs — no vendor SDK, no per-GB egress markup, and no lock-in.

It is intentionally _unopinionated_ where it matters and _opinionated_ where it pays off:

- **Bring your own storage.** filefn talks to any `StorageAdapter` from `@superfunctions/storage` — local disk, S3, GCS, Azure Blob, Cloudflare R2, or a MinIO endpoint. Multipart, signed URLs, and proxy downloads are negotiated at the adapter layer.
- **Bring your own database.** Files, versions, sessions, parts, permissions, shares, and artifacts are stored through a pluggable adapter contract. In-memory, Drizzle, raw Postgres, or SQLite — all work today.
- **Pay for what you mount.** Uploads are bundled. Share links, grants, processing, dedup, and quotas are opt-in: skipping a feature removes its routes, schema, and OpenAPI surface entirely.
- **Type-safe end to end.** `@filefn/server` (Node), `@filefn/client` (browsers/Node), `filefn` on PyPI, and `FileFnClient` in `AuthFnSwift` (SPM) speak the same envelopes, error codes, and routes — derived from a single OpenAPI contract.
- **Resumable by design.** Multipart upload sessions, idempotency keys, anonymous upload session tokens, OPFS-staged offline uploads, HEIC preprocessing, and proxy-mode downloads are wired in by default.
- **Observable by default.** Every meaningful action emits a structured event (`upload.started`, `part.recorded`, `file:uploaded`, `processing.completed`, …) through a single emitter. Sensitive values — signed URLs, session tokens, auth headers — are redacted before they leave the kernel.
- **Self-hosted.** filefn is an open-source kernel that runs in your own backend. There is no vendor portal, no per-MAU pricing, and no lock-in.

## Pick where to start

If you have **15 minutes**, follow the [Getting Started](./getting-started) tutorial — it runs through `createFileFn`, mounting on Hono, configuring policies, and uploading your first file end to end.

If you want a **per-stack quickstart**, jump to [Quickstart](./quickstart) for setup recipes scoped to your framework: Node + Hono, Bun, Express, SvelteKit, Next.js App Router, FastAPI, Flask, or Swift on iOS.

If you're **comparing tools**, the highlights below are a cheatsheet against UploadThing, Uppy server, S3-direct uploads, and rolling your own.

## What's included

| Capability | What it gives you | Where it lives |
| --- | --- | --- |
| Multipart uploads | Session-based multipart uploads with signed-URL or proxy modes, anonymous session tokens, part dedup, and idempotency | bundled in `@filefn/server` |
| Resumable / offline uploads | OPFS staging in the browser, automatic resume on reconnect, HEIC → JPEG transcoding | bundled in `@filefn/client` |
| Versioning | Every upload becomes a new `fileVersion`; downloads can target a specific version | bundled |
| Share links | Tokenised, time-limited, optionally auth-required, optionally download-capped public links | opt-in via `auth.required` config |
| Permissions / grants | Per-user / per-tenant grants (`canRead`, `canWrite`, `canDelete`, `canShare`) with TTLs | opt-in via `authorizer` |
| Storage policies | Named policies that gate `contentTypes`, `maxSizeBytes`, `visibility`, storage targets, and storage path layout | bundled |
| Quotas | Pluggable `QuotaProvider` that participates in upload-session sizing checks and emits `FILEFN_QUOTA_EXCEEDED` | opt-in via `quota` |
| Rate limiting | Per-route limits (uploadInit/sign/complete, download, shareDownload, artifactDownload) on top of `@superfunctions/middleware` | opt-in via `rateLimit` |
| Processing pipeline | Thumbnails, PDF previews, OCR, image transforms, audio waveforms, video posters/transcodes — composable processors with stable artifacts | opt-in via `processing.enabled` |
| Render intents | Single `getRenderable` API that picks the right artifact (thumbnail/preview/full/download) and falls back to placeholders | bundled |
| Deduplication | Optional content-addressable storage with checksum-based dedup that respects per-policy/tenant scoping | opt-in via `dedup.enabled` |
| Native handoff | WKWebView bridge with asset-handle uploads, native preview URLs, and a stable handshake protocol | `@filefn/swift-bridge` + `FileFnWebViewBridgeHost` |
| OpenAPI | Canonical OpenAPI 3.1 contract, served from `filefn/server/contracts/filefn-client-v1.openapi.json` | bundled |

## SDK matrix

| SDK | Package | Server / Client | Status |
| --- | --- | --- | --- |
| Server kernel (Node) | `@filefn/server` | Server | Stable |
| Browser client | `@filefn/client` | Browser, Node, Bun, Deno | Stable |
| Python kernel | `filefn` (PyPI) | FastAPI, Flask, Starlette | Stable |
| Swift client | `FileFnClient` (SPM) | iOS, macOS — bearer + native handoff | Stable |
| SwiftUI helpers | `FileFnSwiftUI` (SPM) | iOS, macOS | Stable |
| WKWebView bridge | `FileFnWebViewBridgeHost` + `@filefn/swift-bridge` | iOS, macOS, JS | Stable |
| Processing | `@filefn/processing` | Server | Stable |
| Viewer | `@filefn/viewer` | Browser, Node | Stable |

## How is this different from…

- **UploadThing / Uploadcare / Cloudinary** — those are hosted products. filefn is an open-source kernel that runs in your own backend with your own storage. No vendor portal, no monthly bills, no migration cost when you grow.
- **Direct S3 client uploads** — direct uploads work until you need versioning, server-side processing, share links, dedup, OPFS-backed offline mode, or a real permission model. filefn keeps the signed-URL path-of-least-resistance and adds everything else when you turn it on.
- **Uppy / TUS / FilePond servers** — those are upload servers. filefn is an upload server _plus_ a downstream model: storage targets per policy, deterministic storage paths, processing artifacts, share-link tokens, render intents, and a Swift native bridge.
- **Roll your own** — filefn is the version of "roll your own uploads" you would have written if you had three months and an obsession with envelope discipline, idempotency, OPFS recovery, and processor-level testing.

## Where to go next

- [Getting Started](./getting-started) — install, configure, and upload your first file.
- [Quickstart](./quickstart) — per-framework setup walkthroughs.
- [Core Concepts](./core-concepts) — upload sessions, policies, render intents, the canonical envelope/error model, and the offline pipeline.
- [Features](./features) — every bundled feature documented end to end.
- [SDKs](./sdk) — `@filefn/server`, `@filefn/client`, the Python package, Swift, the WKWebView bridge, and the viewer.
- [Adapters](./adapters) — storage, database, and processing adapters.
- [Frameworks](./frameworks) — Hono, Express, Bun, SvelteKit, Next.js, FastAPI, Flask.
- [Recipes](./recipes) — copy-pasteable solutions for common flows.
- [API Reference](./api) — OpenAPI-backed endpoint documentation, derived from the canonical client contract.
- [AI resources](./ai-resources) — `llms.txt`, MCP, and Skills for coding assistants.
