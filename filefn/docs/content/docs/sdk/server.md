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
  definePolicy(name: string, policy: Omit<Policy, "name">): void;
  getSchema(): { version: number; schemas: TableSchema[] };
}
```

## `FileFnConfig`

| Field | Type | Default | Notes |
| --- | --- | --- | --- |
| `db` | `Adapter` | required | `@superfunctions/db` `Adapter`. |
| `storage` | `StorageAdapter` | required | `@superfunctions/storage` `StorageAdapter`. |
| `policies` | `Policy[]` | `[]` | Initial policies. Use `createNucleusPolicies()` for sane defaults. |
| `auth` | `AuthConfig` | `{}` | `{ resolveSession, required }`. |
| `quota` | `QuotaProvider` | undefined | Optional storage quota. |
| `rateLimiter` | `RateLimiter` | undefined | Single global rate limiter. |
| `rateLimit` | `{ persistence?, algorithm?, limits? }` | undefined | Per-route rate limits. |
| `logger` | `Logger` | undefined | Pluggable structured logger. |
| `authorizer` | `Authorizer` | default | Permission resolution. |
| `namespace` | `string` | `"filefn"` | Table prefix. |
| `defaultChunkSizeBytes` | `number` | `5 MiB` | Multipart chunk floor. |
| `uploadSessionTtlSeconds` | `number` | `86400` | Session TTL. |
| `signedUrlTtlSeconds` | `number` | `900` | Per-part signed URL TTL. |
| `dedup` | `{ enabled: boolean }` | `{ enabled: false }` | Content-addressable storage. |
| `processing` | `{ enabled, processors?, flowFn? }` | `{ enabled: false }` | Processing pipeline. |

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
