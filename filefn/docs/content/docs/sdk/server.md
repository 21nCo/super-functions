---
title: "@filefn/server"
description: The Node / Bun / Workers server kernel — createFileFn, FileProvider, Authorizer, QuotaProvider, and processor authoring.
---

# @filefn/server

```bash
npm install @filefn/server @superfunctions/storage @superfunctions/db
```

## Top-level API

```ts
import { createFileFn, type FileFnConfig, type FileFn } from "@filefn/server";

const fileFn: FileFn = createFileFn(config);
```

`FileFn` exposes:

```ts
interface FileFn extends FileProvider {
  router: FileFnRouter;                                  // single Request → Response | null
  events: FileFnEventEmitter;                            // typed event emitter
  readonly services: FileFnServices;                     // bound, authorized domain services
  definePolicy(name: string, policy: Omit<Policy, "name">): void;
  getSchema(): { version: number; schemas: TableSchema[] };
}
```

## `FileFnConfig`

| Field | Type | Default | Notes |
| --- | --- | --- | --- |
| `database` | `Adapter` | required | `@superfunctions/db` `Adapter`; FileFn applies its own schema. `db` remains a deprecated alias. |
| `storage` | `StorageAdapter` | required | `@superfunctions/storage` `StorageAdapter`. |
| `stores` | `RuntimeStores` | undefined | Shared runtime stores, including `atomicKv` for strict rate limiting and `kv` for best-effort counters. |
| `policies` | `Policy[]` | `[]` | Initial policies. Use `createNucleusPolicies()` for sane defaults. |
| `auth` | `AuthConfig` | `{}` | `{ resolveSession, required }`. |
| `quota` | `QuotaProvider` | undefined | Optional storage quota. |
| `rateLimiter` | `RateLimiter` | undefined | Single global rate limiter. |
| `rateLimit` | `{ mode?, algorithm?, limits? }` | undefined | Per-route rate limits; mode is `"strict"`, `"best-effort"`, or `"local"`. |
| `observability` | `ObservabilityInput<FileFnObservationEvent>` | undefined | Shared logging, typed events, metrics, traces and request observations. |
| `authorizer` | `Authorizer` | default | Permission resolution. |
| `namespace` | `string` | `"filefn"` | Table prefix. |
| `defaultChunkSizeBytes` | `number` | `5 MiB` | Multipart chunk floor. |
| `uploadSessionTtlSeconds` | `number` | `86400` | Session TTL. |
| `signedUrlTtlSeconds` | `number` | `900` | Per-part signed URL TTL. |
| `dedup` | `{ enabled: boolean }` | `{ enabled: false }` | Content-addressable storage. |
| `processing` | `{ enabled, processors?, flowFn? }` | `{ enabled: false }` | Processing pipeline. |

## Migrating from 0.1.x

Version 0.2.0 removes `FileFnConfig.logger` and `rateLimit.persistence`; there
are no compatibility aliases for these options.

- Replace `logger` with `observability: { logger }`, using a logger compatible
  with `@superfunctions/observability`.
- Replace `rateLimit.persistence` with `stores.kv` and
  `rateLimit.mode: "best-effort"` when cross-replica limits may be approximate.
- For strict shared limits, provide a CAS-capable `stores.atomicKv` and set
  `rateLimit.mode: "strict"`. Missing atomic storage is rejected.
- For process-local counters, use `rateLimit.mode: "local"`.

Without an explicit mode, FileFn selects strict when `stores.atomicKv` is
present, otherwise best-effort when `stores.kv` is present, otherwise local.
The separate pre-built `rateLimiter` option remains supported.


## `FileProvider`

`FileFn` implements [`@superfunctions/files`](https://www.npmjs.com/package/@superfunctions/files)' `FileProvider`. You can call it programmatically without going through HTTP:

```ts
const session = await fileFn.createUploadSession(
  { policy: "public-image", fileName: "x.png", size: 100, mimeType: "image/png" },
  ctx,
);

await fileFn.signUploadPart({ uploadSessionId: session.uploadSessionId, partNumber: 1, contentLength: 100 }, ctx);
await fileFn.completeUploadPart({ uploadSessionId: session.uploadSessionId, partNumber: 1, etag: "abc", size: 100 }, ctx);
const result = await fileFn.completeUploadSession({ uploadSessionId: session.uploadSessionId }, ctx);
// result.fileId / result.versionId
```

`ctx` carries the principal — `{ principalId, tenantId, uploadSessionToken }`.

## Bound domain services

The public `FileFn.services` bundle is available in `@filefn/server` 0.2.0.
It contains `files`, `uploads`, `grants`, `shares`, `processing`, and `policies`.
These are the same instances used by the facade and router, bound to the same
schema, namespace, database, storage, policies, quota provider, and event emitter.
No separately constructed service or table access is needed.

```ts
const { versions } = await fileFn.services.files.listVersions(fileId, ctx);
const grants = await fileFn.services.grants.listGrants(fileId, ctx);
const artifacts = await fileFn.services.processing.listArtifactsForFile(fileId, ctx);
await fileFn.services.processing.triggerProcessingForFile(fileId, ctx, versionId);
```

All file operations still require the caller's domain principal/tenant context.
Grant management remains owner-only; share management and artifact access retain
their existing domain checks. The bound processing surface intentionally does
not expose `runProcessing` or a trigger accepting caller-supplied storage keys:
`triggerProcessingForFile` authorizes the file/version and resolves the input
from FileFn before scheduling work.

`@filefn/admin` requires this declared server version. Its
`createFileFnDomainAdminService({ fileFn, context })` maps each active admin
actor/scope to FileFn's domain context rather than bypassing these checks.

## Routes

`fileFn.router.handle(request)` is the single dispatcher. See [Reference › Routes](../reference/routes) for the full list.

## Events

```ts
fileFn.events.on("file:uploaded", (e) => /* ... */);
fileFn.events.on("processing.completed", (e) => /* ... */);
```

See [Core Concepts › Events](../core-concepts/events).

## Authoring a custom Authorizer

```ts
import {
  composeAuthorizers,
  createDefaultAuthorizer,
  type AuthorizerStrategy,
} from "@filefn/server";

const orgAdminCanRead: AuthorizerStrategy = {
  async canRead(file, principal) {
    if (principal.role === "org-admin" && file.tenantId === principal.tenantId) return true;
    return undefined; // defer
  },
};

const authorizer = composeAuthorizers([
  orgAdminCanRead,
  createDefaultAuthorizer({ db, namespace: "filefn" }),
]);

const fileFn = createFileFn({ db, storage, authorizer });
```

## Authoring a custom QuotaProvider

```ts
import type { QuotaProvider } from "@filefn/server";

const quota: QuotaProvider = {
  async check({ tenantId, requested }) {
    const current = await readUsedBytes(tenantId);
    const limit = await readPlanLimit(tenantId);
    return { allowed: current + requested <= limit, current, limit };
  },
  async used({ tenantId }) {
    const current = await readUsedBytes(tenantId);
    const limit = await readPlanLimit(tenantId);
    return { current, limit };
  },
};
```

## Authoring a custom Processor

```ts
import type { Processor, ProcessorResult } from "@filefn/server";

const watermark: Processor = {
  name: "watermark",
  supportedMimeTypes: ["image/png", "image/jpeg"],
  async process(input, getData): Promise<ProcessorResult> {
    const data = await getData();
    const watermarked = await applyWatermark(data, input.fileName);
    return {
      success: true,
      artifacts: [
        {
          kind: "watermarked",
          mimeType: input.mimeType,
          data: watermarked,
          storageKey: input.storageKey + ".watermarked",
        },
      ],
    };
  },
};
```

## Re-exports worth knowing

```ts
export {
  // Policies
  createNucleusPolicies,
  createPolicyRegistry,
  validatePolicyConstraints,
  computeStoragePath,
  resolveStorageTarget,
  resolveArtifactStorageTarget,
  matchesContentType,
  NUCLEUS_ALLOWED_CONTENT_TYPES,
  NUCLEUS_MAX_SIZE_BYTES,

  // Auth
  resolvePrincipal,

  // Errors
  FileFnError,
  ErrorCodes,

  // Observability
  createLogger,
  redactSecrets,

  // Authorization
  composeAuthorizers,
  createDefaultAuthorizer,

  // Services (for advanced direct use)
  createFileService,
  createGrantsService,
  createSharesService,
  createProcessingService,
} from "@filefn/server";
```

## See also

- [Core Concepts › Architecture](../core-concepts/architecture).
- [Reference › Configuration](../reference/configuration).
- [Reference › Schema](../reference/schema).
