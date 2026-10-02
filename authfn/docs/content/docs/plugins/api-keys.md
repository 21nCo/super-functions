---
title: API keys plugin
description: User-owned and server-issued unowned API keys — hashed, scoped, revocable.
---

# API keys plugin

`authFnApiKeyPlugin` lets signed-in users issue user-owned API keys and use them as bearer tokens against your service. Trusted TypeScript server code can also issue unowned service keys with the exported `createApiKey` helper. Keys are:

- **User-owned or unowned** — cookie-session routes bind keys to the signed-in user's `userId`; trusted server code can explicitly pass `userId: null` to issue an unowned service key.
- **Hashed at rest** — the plaintext is shown once at creation; only `secretHash` is persisted.
- **Scoped** — keys carry an array of scope strings; your app decides what they mean.
- **Named** — for a user's UI or a service ("CI", "personal laptop", "retrieval-worker").
- **Revocable** — cookie-session routes revoke the caller's user-owned keys; trusted server code can revoke unowned keys with `revokeApiKeyById`. Both set `revokedAt`.

```ts
import { authfn, authFnPlugins } from 'authfn';
import { authFnApiKeyPlugin } from '@authfn/api-keys';

const authApp = authfn({
  plugins: authFnPlugins(authFnApiKeyPlugin({ secretPrefix: 'sk_live_' })),
});
```

## Configuration

| Option | Default | Notes |
| --- | --- | --- |
| `secretPrefix` | `'authfn_'` | Prefix for the issued secret string. Useful for vendor-specific keys (`sk_live_`, `prj_`). |
| `now` | `() => new Date()` | Clock injection for tests. |

## Routes

| Method | Path | Operation ID | Notes |
| --- | --- | --- | --- |
| `POST` | `/auth/api-keys` | `createApiKey` | Body: `{ name?, scopes?, expiresAt?, metadata? }`. Returns plaintext once. |
| `GET` | `/auth/api-keys` | `listApiKeys` | Lists the caller's keys. Plaintext is never returned again. |
| `DELETE` | `/auth/api-keys/:keyId` | `revokeApiKey` | Revokes a key. |

## Schema

| Table | Purpose |
| --- | --- |
| `authfn_api_keys` | One row per key: `{ id, userId, secretHash, name, scopes, metadata, expiresAt, revokedAt, lastUsedAt, createdAt, updatedAt }`. |

## Authentication via API key

When a request carries `Authorization: Bearer <secret>`, the kernel:

1. Looks up the key by `secretHash`.
2. Rejects if `revokedAt` is set (`AUTHFN_API_KEY_REVOKED`).
3. Rejects if `expiresAt` is at or before the current time.
4. Updates `lastUsedAt`.
5. Synthesizes an `AuthFnSession` with `type: 'api-key'`, `actorType: 'api-key'`, `methods: ['api-key']`.

The synthesized session is what `auth.provider.authenticate(request)` returns. Your application authorization logic should branch on `session.actorType`:

```ts
if (session.actorType === 'api-key') {
  const scopes = session.metadata?.scopes;
  if (!Array.isArray(scopes) || !scopes.includes('repo:read')) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }
}
```

## Issued plaintext shape

```ts
const created = await client.createApiKey({ name: 'CI', scopes: ['build:run'] });
console.log(created.secret);   // shown once: "sk_live_<random>"
```

The plaintext follows `<secretPrefix><base64url(random)>`. Display it once, then redirect to a "you can't see this again" UI.

## Scopes

`scopes` is an array of strings. authfn does not enforce any particular meaning — your application code decides what each scope grants. A common pattern is `<resource>:<verb>`:

```
repo:read repo:write account:read
```

Return an explicit HTTP 403 when an authenticated API-key request lacks the required scope. In this example, `auth` is your AuthFn server and `handleAuthorizedRequest` is your application's protected handler; it only runs after the scope check passes.

```ts
function hasScope(session: AuthFnSession, scope: string): boolean {
  const scopes = session.metadata?.scopes;
  return Array.isArray(scopes) && scopes.includes(scope);
}

async function handleRepositoryRequest(request: Request): Promise<Response> {
  let session: AuthFnSession | null;
  try {
    session = await auth.provider.authenticate(request);
  } catch (error) {
    if (error !== null && typeof error === 'object' &&
        'code' in error && error.code === 'AUTHFN_API_KEY_REVOKED') {
      return Response.json({ error: 'unauthorized' }, { status: 401 });
    }
    throw error;
  }
  if (!session || session.actorType !== 'api-key') {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasScope(session, 'repo:read')) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }
  return handleAuthorizedRequest(request, session);
}
```

Authentication and scope denial belong to your application's HTTP response layer: missing, invalid, expired, revoked, or non-API-key credentials receive HTTP 401; an active key without the required scope receives HTTP 403. The catch covers only authentication and only maps `AUTHFN_API_KEY_REVOKED`; unexpected failures propagate to your host's error handler, and protected work stays outside the catch. Do not throw a plain `Error` for scope denial: AuthFn's error handler normalizes it to `AUTHFN_INTERNAL_ERROR` (HTTP 500).

## Unowned service keys

Trusted server code can issue an unowned key with the exported `createApiKey` helper. Pass `userId: null` explicitly, along with your server's database adapter and namespace:

```ts
import { createApiKey, revokeApiKeyById } from 'authfn/core/api-keys';

const config = { database, namespace: 'authfn' };
const serviceKey = await createApiKey(config, {
  userId: null,
  name: 'retrieval-worker',
  scopes: ['skills:read'],
  metadata: { servicePrincipalId: 'service:retrieval-worker' },
  expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
});

// After checking your application's service-principal management policy:
await revokeApiKeyById(config, serviceKey.keyId);
```

These keys persist a null owner, use the same hashed-secret, expiry, and revocation behavior, and authenticate as `actorType: 'api-key'` with the key ID as their actor ID. Authentication exposes the stored scopes in `session.metadata.scopes` and leaves `session.metadata.ownerUserId` undefined. Your application must authorize service-principal issuance and use and enforce scopes; the helper does not create a user identity.

Unowned keys authenticate through the normal `auth.provider.authenticate` path only. The opt-in [placement-context issuer](../recipes/placement-bound-auth-context) (`createAuthFnPlacementContextIssuer`) binds each API-key grant to its owning user's placement, so it rejects an unowned key with `AUTHFN_UNAUTHENTICATED`. Use a user-owned key when a service must derive placement-bound context.

The cookie-session routes above remain user-owned: creation always uses the signed-in user's ID, and user listing and revocation exclude unowned keys. Manage unowned keys through trusted server code after applying your application's authorization policy.

## Revocation

```ts
await client.revokeApiKey({ keyId });
```

After revocation, `auth.provider.authenticate(request)` rejects with `AUTHFN_API_KEY_REVOKED`. AuthFn's HTTP error handler maps that error to HTTP 401; application-owned endpoints should return HTTP 401 as shown above. Unknown or expired keys instead authenticate to `null`.

## Errors

| Code | When |
| --- | --- |
| `AUTHFN_VALIDATION_ERROR` | Invalid name / scopes / expiresAt. |
| `AUTHFN_UNAUTHENTICATED` | Caller is not signed in (key creation requires a session). |
| `AUTHFN_API_KEY_REVOKED` | Key was used after revocation. |
| `AUTHFN_NOT_FOUND` | `revokeApiKey` for a missing key id. |

## Events

- `authfn.api_key.created`
- `authfn.api_key.revoked`

## Quick UI: list and revoke keys

```ts
const { keys } = await client.listApiKeys();
keys.forEach(({ id, name, lastUsedAt, scopes, createdAt }) => render({ id, name, lastUsedAt, scopes, createdAt }));

// On user clicks "revoke":
await client.revokeApiKey({ keyId });
```

The Svelte and Swift SDKs ship out-of-the-box list/create/revoke views; see [SDKs → Svelte](../sdk/svelte) and [Examples → account-settings](../examples/account-settings).

## Related

- [Concepts → Sessions](../core-concepts/sessions) — API key sessions.
- [Recipes → CLI authentication](../recipes/cli-auth) — issuing keys for command-line tools.
