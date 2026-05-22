---
title: Core Concepts
description: How filefn is wired — upload sessions, multipart, policies, render intents, the canonical envelope/error model, share links, grants, dedup, offline, events, and security.
---

# Core Concepts

filefn has a small set of concepts that compose into the whole runtime. Read these once and the rest of the docs will feel obvious.

## The shape of the kernel

Every server boots through `createFileFn(config)` (TypeScript) or `create_file_fn(config)` (Python). The return value is a `FileFn` object that exposes:

- `router` — a single `Request → Response | null` handler that routes everything under `/`. You mount it under any prefix you want (`/filefn` is the canonical choice).
- `events` — a strongly-typed event emitter (`upload.started`, `part.recorded`, `file:uploaded`, …).
- `definePolicy(name, policy)` — register or override a policy at runtime.
- `getSchema()` — the canonical schema (7 tables) for migrations.
- A `FileProvider` interface (`createUploadSession`, `getUploadSessionStatus`, …) for direct programmatic use without going through HTTP.

## The conceptual map

```mermaid
flowchart LR
  subgraph Client
    UI[Browser / Mobile]
    UI --> Client[@filefn/client]
  end

  subgraph Server
    Client -- HTTP --> Router[fileFn.router]
    Router --> Upload[Upload sessions]
    Router --> Files[Files / versions]
    Router --> Shares[Share links]
    Router --> Grants[Permissions]
    Router --> Processing[Processing]
    Router --> Policies[Policies]
    Router --> Quota[Quota]
  end

  subgraph Adapters
    Storage[StorageAdapter]
    DB[Adapter]
    Authorizer[Authorizer]
    QuotaProvider[QuotaProvider]
    Processors[Processors]
  end

  Upload --> Storage
  Upload --> DB
  Files --> Storage
  Files --> DB
  Shares --> Storage
  Shares --> DB
  Grants --> DB
  Grants --> Authorizer
  Processing --> Storage
  Processing --> DB
  Processing --> Processors
  Quota --> QuotaProvider
```

## What to read next

- [Architecture](./architecture) — what each subsystem does and why it's separated.
- [Upload sessions](./upload-sessions) — the lifecycle of a single upload from `init` to `complete`.
- [Multipart](./multipart) — how chunk size, parts, and modes (signed-URL vs. proxy) are negotiated.
- [Idempotency](./idempotency) — why `x-idempotency-key` is the right hammer for accidental double-clicks and resumed sessions.
- [Policies](./policies) — gating uploads by content type, size, visibility, and storage target.
- [Visibility](./visibility) — `public` / `private` / `shared` and how each affects download URLs.
- [Storage targets](./storage-targets) — durable / temporary tiers and per-policy artifact targets.
- [Render intents](./render-intents) — `thumbnail` / `preview` / `full` / `download` and the placeholder fallback.
- [Artifacts](./artifacts) — the processing pipeline output model.
- [Dedup](./dedup) — content-addressable storage with policy/tenant scoping.
- [Grants](./grants) — per-user / per-tenant permission grants.
- [Share links](./share-links) — tokenised, optionally auth-required, optionally download-capped.
- [Offline](./offline) — OPFS staging, automatic resume, and pending-local previews.
- [Events](./events) — the canonical event catalog and redaction rules.
- [Errors](./errors) — every error code, with HTTP status and recovery advice.
- [Observability](./observability) — logging, request IDs, secret redaction.
- [Rate limiting](./rate-limiting) — per-route windowing on top of `@superfunctions/middleware`.
- [Security](./security) — what filefn protects, what it doesn't, and the threat model.
