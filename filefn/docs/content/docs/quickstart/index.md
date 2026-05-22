---
title: Quickstart
description: Per-framework setup walkthroughs for filefn — Node + Hono, Express, Bun, SvelteKit, Next.js App Router, Python + FastAPI, Python + Flask, and Swift on iOS.
---

# Quickstart

Pick the page that matches your stack. Each quickstart is self-contained: it shows the exact dependencies, the canonical `createFileFn(...)` (or Python / Swift equivalent) call, and how to mount the router on the framework's request lifecycle.

If you're brand-new to filefn, do [Getting Started](../getting-started) first — it explains the kernel call once, in detail. The quickstarts assume you already know what `policies`, `auth`, and `storage` mean.

## TypeScript / JavaScript

- [Hono](./hono) — the canonical Node + Bun + Cloudflare Workers integration. Smallest amount of glue code.
- [Express](./express) — works on any Node 18+ server with a `Request → Response` adapter shim.
- [Bun](./bun) — `Bun.serve`-native, identical kernel.
- [SvelteKit](./sveltekit) — mounted from a `+server.ts` catch-all under `/filefn`.
- [Next.js (App Router)](./nextjs) — mounted from a `app/filefn/[...path]/route.ts` catch-all.

## Python

- [FastAPI](./fastapi) — mounted as a sub-application using `filefn`'s router protocol.
- [Flask](./flask) — mounted as a Blueprint with a request → response shim.

## Swift

- [Swift on iOS / macOS](./swift) — `FileFnClient` from SPM with `FileFnForegroundUploader` and `FileFnBackgroundUploader`. WKWebView apps additionally use `FileFnWebViewBridgeHost` + `@filefn/swift-bridge`.

## What's the same on every framework?

Regardless of framework, every server boots through `createFileFn(config)` (Node) or `create_file_fn(config)` (Python). The Swift client is a pure HTTP client — it talks to whichever filefn server you mount.

Every server speaks the same canonical envelopes (`{ ok: true, data }` / `{ ok: false, error }`), the same error codes, and the same routes. You can deploy the Node kernel, the Python kernel, or both behind the same domain with no client changes.
