---
title: Share links
description: Opt-in tokenised, optionally auth-required, optionally download-capped public links to files.
---

# Share links

See [Core Concepts › Share links](../core-concepts/share-links) for the full lifecycle. This page is the operator-facing reference.

## Enabling

Share links are wired automatically when `auth` is configured. There's no separate `shares.enabled` flag — every server gets the routes by default. Disable by removing `auth` (or setting `auth.required: false` and not exposing the routes through your reverse proxy).

## Routes

- `POST /:fileId/share-links` — create
- `GET /:fileId/share-links` — list (returns hash prefix only)
- `DELETE /:fileId/share-links/:token` — revoke
- `GET /share-links/:token/download` — resolve to a download URL
- `GET /proxy/share-links/:token/download` — proxy-mode download

## Schema

`fileShares`:

```ts
interface FileShareRecord {
  tokenHash: string;
  fileId: string;
  versionId?: string;
  expiresAt?: string;
  requiresAuth: boolean;
  maxDownloads?: number;
  downloads: number;
  createdAt: string;
  revokedAt?: string;
}
```

`tokenHash` is a hash of the plaintext token. The plaintext is returned exactly once on creation.

## Authorization

To create a share link, the principal must own the file (or have a grant with `canShare: true`). To revoke, the principal must own the file or have created the share link.

Anonymous downloads (no auth) work when `requiresAuth` is `false`. If `requiresAuth: true`, the recipient must present a valid session in addition to the token.

## TTL and download caps

Both fields are server-enforced. The download counter is incremented atomically when `GET /share-links/:token/download` resolves; a second concurrent request that would push the counter past `maxDownloads` fails with `FILEFN_SHARE_DOWNLOADS_EXCEEDED`.

## Anti-enumeration

`FILEFN_SHARE_NOT_FOUND` (404) and `FILEFN_SHARE_REVOKED` / `FILEFN_SHARE_EXPIRED` (410) are deliberately distinct. The 404 means "no row." The 410s mean "row exists but unusable." This is the only place where the kernel leaks any signal — if you want to fully hide existence, set up a CDN-edge handler that returns 404 for both.

## See also

- [Recipes › Signed share links](../recipes/signed-share-links) — common patterns (one-time, time-bound, IP-restricted).
