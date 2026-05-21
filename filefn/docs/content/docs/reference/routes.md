---
title: Routes
description: Every HTTP route filefn exposes — methods, paths, request shapes, response shapes, error codes.
---

# Routes

The kernel exposes 24 paths covering 27 operations. Every route is mounted under whatever prefix you wire (commonly `/filefn`).

For an interactive explorer, see the [API page](../../api/filefn).

## Upload sessions

| Method | Path | Description | Errors |
| --- | --- | --- | --- |
| POST | `/upload/init` | Create a new upload session. | `FILEFN_POLICY_NOT_FOUND`, `FILEFN_POLICY_CONTENT_TYPE_NOT_ALLOWED`, `FILEFN_POLICY_MAX_SIZE_EXCEEDED`, `FILEFN_QUOTA_EXCEEDED`, `FILEFN_NO_SUPPORTED_UPLOAD_MODE`, `FILEFN_IDEMPOTENCY_CONFLICT`, `FILEFN_AUTH_REQUIRED`, `FILEFN_RATE_LIMITED`. |
| GET | `/upload/:id/status` | Get session status (open, complete, aborted, expired). | `FILEFN_SESSION_NOT_FOUND`, `FILEFN_SESSION_TOKEN_REQUIRED`, `FILEFN_SESSION_TOKEN_INVALID`. |
| POST | `/upload/:id/parts/:n/sign` | Sign a single part for direct PUT to storage. | `FILEFN_INVALID_PART_NUMBER`, `FILEFN_UPLOAD_EXPIRED`, `FILEFN_UPLOAD_ABORTED`, `FILEFN_UPLOAD_ALREADY_COMPLETED`, `FILEFN_RATE_LIMITED`. |
| PUT | `/upload/:id/parts/:n` | Upload part bytes through filefn (proxy mode). | `FILEFN_INVALID_PART_NUMBER`, `FILEFN_UPLOAD_EXPIRED`, `FILEFN_UPLOAD_ABORTED`, `FILEFN_UPLOAD_ALREADY_COMPLETED`. |
| POST | `/upload/:id/parts/:n/complete` | Record a finished part's etag. | `FILEFN_INVALID_PART_NUMBER`, `FILEFN_INVALID_ETAG`, `FILEFN_PART_CONFLICT`. |
| POST | `/upload/:id/complete` | Finalise the session. | `FILEFN_UPLOAD_INCOMPLETE`, `FILEFN_UPLOAD_SIZE_MISMATCH`, `FILEFN_UPLOAD_EXPIRED`, `FILEFN_UPLOAD_ABORTED`, `FILEFN_UPLOAD_ALREADY_COMPLETED`, `FILEFN_PROCESSING_ENQUEUE_FAILED`. |
| POST | `/upload/:id/abort` | Abort. Cleans up storage and DB rows. | (idempotent) |

## Files

| Method | Path | Description |
| --- | --- | --- |
| GET | `/files` | List files (filtered by principal / tenant). |
| GET | `/:fileId` | Get file metadata. |
| DELETE | `/:fileId` | Delete file (and all versions / artifacts). |

## Versions

| Method | Path | Description |
| --- | --- | --- |
| GET | `/:fileId/versions` | List versions. |
| GET | `/:fileId/versions/:versionId` | Get version metadata. |
| GET | `/:fileId/versions/:versionId/download` | Resolve download URL for a specific version. |

## Downloads

| Method | Path | Description |
| --- | --- | --- |
| GET | `/:fileId/download` | Resolve download URL (signed URL or proxy URL). |
| GET | `/proxy/files/:fileId/download` | Proxy-mode download (always streams through filefn). |
| GET | `/proxy/files/:fileId/versions/:versionId/download` | Proxy-mode version download. |

## Artifacts

| Method | Path | Description |
| --- | --- | --- |
| GET | `/:fileId/artifacts` | List artifacts. |
| GET | `/:fileId/artifacts/:artifactId/download` | Resolve artifact download URL. |
| GET | `/proxy/files/:fileId/artifacts/:artifactId/download` | Proxy-mode artifact download. |
| POST | `/:fileId/process` | Manually trigger processing. |

## Render intents

| Method | Path | Description |
| --- | --- | --- |
| GET | `/:fileId/render` | Resolve a render intent (`thumbnail`, `preview`, `full`). |

## Permissions / grants

| Method | Path | Description |
| --- | --- | --- |
| POST | `/:fileId/permissions` | Create a grant. |
| GET | `/:fileId/permissions` | List grants. |
| DELETE | `/:fileId/permissions/:permissionId` | Revoke a grant. |

## Share links

| Method | Path | Description |
| --- | --- | --- |
| POST | `/:fileId/share-links` | Create a share link. |
| GET | `/:fileId/share-links` | List share links. |
| DELETE | `/:fileId/share-links/:token` | Revoke a share link. |
| GET | `/share-links/:token/download` | Resolve a share-link download URL. |
| GET | `/proxy/share-links/:token/download` | Proxy-mode share-link download. |

## Capabilities

| Method | Path | Description |
| --- | --- | --- |
| GET | `/policies` | List registered policies. |
| GET | `/quota/storage` | Get storage quota for the principal/tenant. |

## Common headers

| Header | Direction | Description |
| --- | --- | --- |
| `Authorization` | request | Whatever your `auth.resolveSession` reads. Typical: `Bearer <token>`. |
| `x-request-id` | request / response | Correlation id; auto-generated if absent. |
| `x-idempotency-key` | request | On `POST /upload/init` to dedupe retries. |
| `x-upload-session-token` | request | Anonymous session token for unauthenticated uploads. |
| `x-filefn-client-version` | request | Sent by the bundled clients. |
| `etag` | response | On part PUTs. |

## See also

- [API explorer](../../api/filefn) — full interactive spec.
- [Errors](./errors) — per-error reference.
- [Envelopes](./envelopes) — request / response wrapper.
