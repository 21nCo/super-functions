# @secfn/core

Core contracts and pure utilities for SecFn V1.

`@secfn/core` intentionally contains no database adapter, HTTP router, or framework integration. It provides the shared types that `@secfn/server`, `@secfn/runtime`, and `@secfn/cli` build on.

## Exports

- Encryption primitives using AES-256-GCM with per-record IV and salt.
- `KeyProvider` and `createStaticKeyProvider` for default env/master-key workflows.
- AAD helpers binding encrypted versions to tenant, namespace, secret id, and version.
- Scanner interfaces, default secret rule pack, scanner engine, and table/JSON/SARIF reporters.
- RBAC, audit event, secret, service token, runtime, and server config types.
- `SecFnError` variants.
- `getSecFnSchema()` for `@superfunctions/db` schema discovery.

## Example

```ts
import {
  buildSecretAad,
  createStaticKeyProvider,
  decryptSecret,
  encryptSecret,
  getSecFnSchema,
} from "@secfn/core";

const keyProvider = createStaticKeyProvider(process.env.SECFN_MASTER_KEY!, "env:main");

const aad = buildSecretAad({
  tenantId: "acme",
  namespace: "web",
  secretId: "secret_123",
  version: 1,
});

const encrypted = await encryptSecret("plain", keyProvider, aad);
const plain = await decryptSecret(encrypted, keyProvider, aad);
const schema = getSecFnSchema();
```

Production storage, admin routes, runtime routes, RBAC services, rate limiting, and audit persistence live in `@secfn/server`.
