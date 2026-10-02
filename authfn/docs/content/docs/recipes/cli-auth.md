---
title: CLI authentication
description: Issue an API key from your web UI and use it from a command-line tool.
---

# CLI authentication

## Goal

Let users authenticate a CLI tool against your authfn-backed service. The standard pattern is API keys: the user creates one in your web UI, copies the secret, and exports it as an env var.

## Plugins

- `authFnApiKeyPlugin`.

## Web flow

```ts
const created = await client.createApiKey({ name: 'CLI', scopes: ['read', 'write'] });
showOnce(created.data.secret);   // "sk_live_..." — display once, copy to clipboard
```

## CLI usage

```bash
export ACME_API_KEY=sk_live_...
acme list-projects
```

```ts
// in the CLI:
const apiKey = process.env.ACME_API_KEY;
const response = await fetch('https://api.acme.com/projects', {
  headers: { Authorization: `Bearer ${apiKey}` },
});
```

## Server-side authentication

Your protected endpoint authenticates via `auth.provider` and uses the `hasScope` helper below to return HTTP 403 before loading protected data:

```ts
app.get('/projects', async (c) => {
  let session: AuthFnSession | null;
  try {
    session = await auth.provider.authenticate(c.req.raw);
  } catch (error) {
    if (error !== null && typeof error === 'object' &&
        'code' in error && error.code === 'AUTHFN_API_KEY_REVOKED') {
      return c.json({ error: 'unauthorized' }, 401);
    }
    throw error;
  }
  if (!session || session.actorType !== 'api-key') {
    return c.json({ error: 'unauthorized' }, 401);
  }
  if (!hasScope(session, 'read')) {
    return c.json({ error: 'forbidden' }, 403);
  }
  // session.actorId === api key id
  // session.metadata.scopes === ['read', 'write']
  return c.json({ projects: [] }); // Replace with your application's project data.
});
```

Missing, invalid, expired, revoked, or non-API-key credentials receive HTTP 401. The catch only handles the expected revocation error from authentication; unexpected provider failures and failures while loading project data remain host application errors. Active keys lacking `read` receive HTTP 403.

## Per-key scopes

Authorization is up to your application. This predicate reads the stored key scopes; the handler above owns the HTTP 403 response instead of throwing a generic error:

```ts
function hasScope(session: AuthFnSession, scope: string): boolean {
  const scopes = session.metadata?.scopes;
  return Array.isArray(scopes) && scopes.includes(scope);
}
```

## Refreshing keys

To rotate, the user creates a new key, swaps it in their CLI env, then revokes the old one.

## Related

- [Plugins → API keys](../plugins/api-keys)
- [Concepts → Sessions](../core-concepts/sessions)
