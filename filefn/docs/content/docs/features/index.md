---
title: Features
description: Every bundled filefn feature, documented end to end — uploads, downloads, share links, grants, processing, dedup, quotas, offline, HEIC, policies, rate limiting.
---

# Features

filefn is composed of a small set of features. The bundled ones are always-on. The capability features are opt-in: turning them on adds routes, schema, and events; turning them off keeps the surface minimal.

## Bundled (always on)

- [Uploads](./uploads) — multipart sessions with signed-URL or proxy modes, idempotency, anonymous tokens, recovery.
- [Downloads](./downloads) — signed-URL or proxy downloads with version targeting.
- [Versions](./versions) — every upload becomes a new version; downloads can target a specific version.
- [Policies](./policies) — named upload contracts: content type, size, visibility, storage target, layout.

## Opt-in capabilities

- [Share links](./share-links) — tokenised, optionally auth-required, optionally download-capped.
- [Grants](./grants) — per-user / per-tenant permission grants with TTLs.
- [Processing](./processing) — thumbnails, PDF previews, OCR, image transforms, audio waveforms, video posters.
- [Deduplication](./dedup) — content-addressable storage with policy/tenant scoping.
- [Quota](./quota) — pluggable storage quota that gates uploads.
- [Offline](./offline) — OPFS-staged uploads, automatic resume, pending-local previews.
- [HEIC preprocessing](./heic) — automatic HEIC → JPEG conversion in the browser and on iOS.
- [Rate limiting](./rate-limiting) — per-route windowing on upload-init / sign / complete / download.

Each page covers: what the feature does, how to enable it, the routes it adds, the schema it touches, the events it emits, and how to extend it.
