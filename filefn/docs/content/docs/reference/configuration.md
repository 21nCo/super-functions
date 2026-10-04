---
title: Configuration
description: Every option in FileFnConfig — types, defaults, and effects.
---

# Configuration

`createFileFn(config: FileFnConfig)` accepts a single options object.

## Required

| Field | Type | Effect |
| --- | --- | --- |
| `database` | `Adapter` | The DB adapter (`@superfunctions/db`); `db` remains a deprecated alias. |
| `storage` | `StorageAdapter` | The storage adapter (`@superfunctions/storage`). |

## Policies

| Field | Type | Default | Effect |
| --- | --- | --- | --- |
| `policies` | `Policy[]` | `[]` | Initial policies. Use `createNucleusPolicies()` for sensible defaults. |

Policies can also be added at runtime via `fileFn.definePolicy(name, policy)`.

## Auth

| Field | Type | Default | Effect |
| --- | --- | --- | --- |
| `auth.resolveSession` | `(req: Request) => Promise<Principal | null>` | undefined | Resolves the calling principal. |
| `auth.required` | `boolean` | `false` | When true, anonymous requests fail with `FILEFN_AUTH_REQUIRED`. |

## Authorizer

| Field | Type | Default | Effect |
| --- | --- | --- | --- |
| `authorizer` | `Authorizer` | `createDefaultAuthorizer({ db, namespace })` | Custom permission resolution. |

Default authorizer reads `filefn_file_permissions` and respects ownership.

## Quota

| Field | Type | Default | Effect |
| --- | --- | --- | --- |
| `quota` | `QuotaProvider` | undefined | Optional storage-quota gate on `init`. |

## Rate limiting

| Field | Type | Default | Effect |
| --- | --- | --- | --- |
| `rateLimiter` | `RateLimiter` | undefined | Single global rate limiter. |
| `stores` | `RuntimeStores` | undefined | Shared `atomicKv` / `kv` stores. |
| `rateLimit.mode` | `"strict" \| "best-effort" \| "local"` | inferred from stores | Strict requires CAS-capable `stores.atomicKv`; best-effort uses `stores.kv`; local keeps counters in-process. |
| `rateLimit.algorithm` | `"fixed-window" | "sliding-window" | "token-bucket"` | `"fixed-window"` | Algorithm. |
| `rateLimit.limits.uploadInit` | `{ windowSeconds, maxRequests }` | undefined | Per-route. |
| `rateLimit.limits.uploadSign` | same | undefined | |
| `rateLimit.limits.uploadComplete` | same | undefined | |
| `rateLimit.limits.download` | same | undefined | |
| `rateLimit.limits.shareDownload` | same | undefined | |
| `rateLimit.limits.artifactDownload` | same | undefined | |

## Multipart

| Field | Type | Default | Effect |
| --- | --- | --- | --- |
| `defaultChunkSizeBytes` | `number` | `5 * 1024 * 1024` | Floor for chunk size. |
| `uploadSessionTtlSeconds` | `number` | `86400` | Session lifetime. |
| `signedUrlTtlSeconds` | `number` | `900` | Per-part signed URL lifetime. |

## Capabilities

| Field | Type | Default | Effect |
| --- | --- | --- | --- |
| `dedup.enabled` | `boolean` | `false` | Content-addressable storage. |
| `processing.enabled` | `boolean` | `false` | Run processors after upload. |
| `processing.processors` | `Processor[]` | `[]` | Processors to register. |
| `processing.flowFn` | `FlowFnQueue` | undefined | Queue for async processing. |

## Misc

| Field | Type | Default | Effect |
| --- | --- | --- | --- |
| `namespace` | `string` | `"filefn"` | Table prefix. |
| `observability` | `ObservabilityInput<FileFnObservationEvent>` | undefined | Structured logger, events, metrics, traces and request observations. |

## Example: production config

```ts
const fileFn = createFileFn({
  database: createPostgresAdapter({ pool }),
  storage: createS3Storage({ region, bucket, cdnPrefix }),
  policies: createNucleusPolicies(),

  auth: {
    resolveSession: async (req) => {
      const session = await authFn.getSession(req);
      return session ? { principalId: session.userId, tenantId: session.tenantId } : null;
    },
    required: true,
  },

  quota: storageQuotaProvider,
  authorizer: composeAuthorizers([orgAdminCanRead, createDefaultAuthorizer({ db, namespace: "filefn" })]),
  observability: { logger: pinoLogger },
  stores: { atomicKv: redisAtomicStore },

  rateLimit: {
    mode: "strict",
    algorithm: "sliding-window",
    limits: {
      uploadInit:        { windowSeconds: 60, maxRequests: 10 },
      uploadSign:        { windowSeconds: 60, maxRequests: 600 },
      uploadComplete:    { windowSeconds: 60, maxRequests: 30 },
      download:          { windowSeconds: 60, maxRequests: 120 },
      shareDownload:     { windowSeconds: 60, maxRequests: 60 },
      artifactDownload:  { windowSeconds: 60, maxRequests: 600 },
    },
  },

  defaultChunkSizeBytes: 5 * 1024 * 1024,
  uploadSessionTtlSeconds: 86400,
  signedUrlTtlSeconds: 900,

  dedup: { enabled: true },

  processing: {
    enabled: true,
    processors: [
      createThumbnailProcessor({ sizes: [{ name: "thumb", width: 256 }, { name: "preview", width: 1024 }] }),
      createPdfPreviewProcessor({ sizes: [{ name: "preview", width: 1024 }] }),
    ],
    flowFn: queueProvider,
  },
});
```

## See also

- [SDKs › Server](../sdk/server) — annotated API.
