---
title: API keys plugin
description: User-owned API keys — issued, hashed, scoped, revocable.
---

# API keys plugin

`authFnApiKeyPlugin` lets users issue API keys and use them as bearer tokens against your service. Keys are:

- **User-owned** — every key is bound to a `userId`.
- **Hashed at rest** — the plaintext is shown once at creation; only `secretHash` is persisted.
- **Scoped** — keys carry an array of scope strings; your app decides what they mean.
- **Named** — for the user's UI ("CI", "personal laptop").
- **Revocable** — `DELETE /auth/api-keys/:id` flips `revokedAt`.

```ts
import { authFnApiKeyPlugin } from '@authfn/core';

authFnApiKeyPlugin({ secretPrefix: 'sk_live_' });
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
3. Rejects if `expiresAt` is past.
4. Updates `lastUsedAt`.
5. Synthesizes an `AuthFnSession` with `type: 'api-key'`, `actorType: 'api-key'`, `methods: ['api-key']`.

The synthesized session is what `auth.provider.authenticate(request)` returns. Your application authorization logic should branch on `session.actorType`:

```ts
if (session.actorType === 'api-key') {
  if (!session.subject.attributes?.scopes?.includes('repo:read')) {
    return forbidden();
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

Authorize like this in your handlers:

```ts
function require(session: AuthFnSession, scope: string) {
  const scopes = (session.subject.attributes as any)?.scopes ?? [];
  if (!scopes.includes(scope)) {
    throw new AuthFnForbiddenError(`scope ${scope} required`);
  }
}
```

## Revocation

```ts
await client.revokeApiKey({ keyId });
```

After revocation, every subsequent request with that key returns `AUTHFN_API_KEY_REVOKED` (HTTP 401).

## Errors

| Code | When |
| --- | --- |
| `AUTHFN_VALIDATION_ERROR` | Invalid name / scopes / expiresAt. |
| `AUTHFN_UNAUTHENTICATED` | Caller is not signed in (key creation requires a session). |
| `AUTHFN_API_KEY_REVOKED` | Key was used after revocation or expiry. |
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
