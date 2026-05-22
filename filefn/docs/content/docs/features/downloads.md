---
title: Downloads
description: How filefn returns signed download URLs, proxies download bytes, and handles version-targeted downloads.
---

# Downloads

The download feature is always on. It owns:

- `GET /:fileId/download` — signed URL or proxy URL for the current version.
- `GET /:fileId/versions/:versionId/download` — signed URL for a specific version.
- `GET /proxy/files/:fileId/download` — stream bytes through filefn (always proxy).
- `GET /proxy/files/:fileId/versions/:versionId/download` — stream a specific version.

## Two modes (server-side)

If the storage adapter supports `getSignedUrl`, downloads return:

```json
{
  "ok": true,
  "data": {
    "url": "https://cdn.example.com/...?Signature=...",
    "fileName": "report.pdf",
    "mimeType": "application/pdf"
  }
}
```

The client follows `url` with a `GET` and gets bytes from the storage backend. filefn never touches them.

If the adapter doesn't support signed URLs, the response carries an internal `/proxy/files/:fileId/download` URL instead. The client follows that, and filefn streams bytes from storage.

`/proxy/...` routes are also useful when:

- you want filefn to apply Content-Disposition / Content-Type rules
- you want filefn to log every download (vs. silent CDN fetches)
- you want to enforce per-download accounting that the storage backend can't see

## TTL

`signedUrlTtlSeconds` (default 15 minutes) controls signed-URL lifetime. The download endpoint mints a fresh URL on every call — clients shouldn't cache them past `expiresAt`.

## Headers

Pass headers through the descriptor when the storage backend requires them:

```json
{
  "url": "...",
  "headers": { "X-Custom-Origin": "filefn" }
}
```

The bundled clients merge these into the `GET` automatically.

## Authorization

`auth.resolveSession` is required for `private` and `shared` files. The default `Authorizer` checks ownership and grants. See [Visibility](../core-concepts/visibility) for the matrix.

`public` files don't require auth. Their download URLs may include a long-lived signed URL or a CDN URL with no signature at all (depending on adapter config).

## Filenames

filefn doesn't rewrite the filename you uploaded. If you want a download UX that suggests a different name (e.g. `Report - Acme Corp.pdf`), do it in your app code:

```ts
const { url, fileName, mimeType } = await client.downloadUrl(fileId);

const a = document.createElement("a");
a.href = url;
a.download = `Report - ${myAppContext.orgName}.pdf`;
a.click();
```

## See also

- [Versions](./versions) — version-targeted downloads.
- [Share links](./share-links) — tokenised downloads for unauthenticated recipients.
