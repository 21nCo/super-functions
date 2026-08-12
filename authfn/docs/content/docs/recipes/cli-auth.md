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

Your protected endpoint authenticates via `auth.provider`:

```ts
app.get('/projects', async (c) => {
  const session = await auth.provider.authenticate(c.req.raw);
  if (!session || session.actorType !== 'api-key') {
    return c.json({ error: 'unauthorized' }, 401);
  }
  // session.actorId === api key id
  // session.subject.attributes.scopes === ['read', 'write']
  return c.json({ projects: [...] });
});
```

## Per-key scopes

Authorization is up to your application:

```ts
function require(session: AuthFnSession, scope: string) {
  const scopes = session.subject.attributes?.scopes ?? [];
  if (!scopes.includes(scope)) throw new Error('forbidden');
}
```

## Refreshing keys

To rotate, the user creates a new key, swaps it in their CLI env, then revokes the old one.

## Related

- [Plugins → API keys](../plugins/api-keys)
- [Concepts → Sessions](../core-concepts/sessions)
