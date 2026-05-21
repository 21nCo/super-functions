---
title: Signed share links
description: Common share-link patterns — one-time, time-bound, password-protected, IP-restricted.
---

# Signed share links

filefn ships share links with TTLs and download caps. This recipe shows how to compose them with custom auth checks.

## One-time

```ts
const share = await fetch(`/filefn/${fileId}/share-links`, {
  method: "POST",
  body: JSON.stringify({ maxDownloads: 1 }),
}).then((r) => r.json());

const shareUrl = `https://app.example.com/shares/${share.data.token}`;
```

The first download succeeds; the second returns `FILEFN_SHARE_DOWNLOADS_EXCEEDED`.

## Time-bound

```ts
await fetch(`/filefn/${fileId}/share-links`, {
  method: "POST",
  body: JSON.stringify({
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1 hour
  }),
});
```

## Auth-required (recipient must be logged in)

```ts
await fetch(`/filefn/${fileId}/share-links`, {
  method: "POST",
  body: JSON.stringify({
    requiresAuth: true,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  }),
});
```

The share token still gates access (recipients without it can't download), and on top of that recipients must present a valid filefn session.

## Password-protected

filefn doesn't ship a "password on share" feature. Compose one in your app:

```ts
// Your app DB, indexed by tokenHash
interface ShareGuard {
  tokenHash: string;
  passwordHash: string;
  attempts: number;
}

app.post("/shares/:token/check", async (c) => {
  const { password } = await c.req.json();
  const tokenHash = await hashToken(c.req.param("token"));
  const guard = await db.findOne("share_guards", { tokenHash });
  if (!guard) return c.json({ ok: false }, 404);
  if (!await bcrypt.compare(password, guard.passwordHash)) {
    return c.json({ ok: false }, 403);
  }
  // Cookie or session for the next request
  setShareSession(c, tokenHash);
  return c.json({ ok: true });
});
```

The actual filefn `/share-links/:token/download` call is gated by both your password check (your cookie) and filefn's token check.

## IP-restricted

Same idea — wrap the route with a custom proxy that records the IP at create time and rejects on mismatch.

## Tracking

`filefn_file_shares.downloads` tracks the count. Add a hook for analytics:

```ts
fileFn.events.on("share.downloaded", async (e) => {
  await analytics.record({
    fileId: e.fileId,
    shareTokenHashPrefix: e.tokenHashPrefix,
    at: Date.now(),
  });
});
```

(There's no `share.downloaded` event today — implement it via `redirect-aware` middleware on the share-download route, or add an emitter in your app.)

## See also

- [Features › Share links](../features/share-links).
