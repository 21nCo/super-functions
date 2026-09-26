---
title: Server and storage
description: Mount authenticated document routes and save with optimistic concurrency.
---

`@mdfn/server` provides document CRUD, immutable versions, restore, editorial workflows, and collaboration-update storage. Every operation passes through the host's principal resolver and authorization callback.

## Run a local server

This single-user example uses ephemeral storage. Install the packages, save the code as `server.ts`, set `MDFN_DEMO_TOKEN` to a local secret, and run `npx tsx server.ts`:

```sh
npm install @mdfn/server @superfunctions/db hono @hono/node-server
npm install --save-dev tsx
```

```ts
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { memoryAdapter } from "@superfunctions/db/adapters/memory";
import { createMdfnServer, MdfnServerError } from "@mdfn/server";

const token = process.env.MDFN_DEMO_TOKEN;
if (!token) throw new Error("Set MDFN_DEMO_TOKEN before starting");
const { router } = createMdfnServer({
  database: memoryAdapter(),
  durability: "ephemeral",
  resolvePrincipal(request) {
    if (request.headers.get("authorization") !== `Bearer ${token}`) {
      throw new MdfnServerError("MDFN_UNAUTHENTICATED", 401);
    }
    return { id: "local-author", tenantId: "local" };
  },
  authorize(_action, principal, document) {
    return !document || (document.ownerId === principal.id && document.tenantId === principal.tenantId);
  },
});
const app = new Hono();
app.all("/api/mdfn/*", (c) => router.handle(c.req.raw));
serve({ fetch: app.fetch, port: 3010 });
```

Replace the demo resolver with your application's verified session identity for production. A missing resolver denies HTTP access. Never derive authority from an unverified owner/tenant field in a request body.

## Create, edit, and save

Install `@mdfn/client @mdfn/facade`. The following is a Node client for the local server; browser applications should use their authenticated same-origin session instead of shipping the demo token:

```ts
import { writeFile } from "node:fs/promises";
import { createMdfn, Transaction } from "@mdfn/facade";
import { createMdfnClient, MdfnClientError } from "@mdfn/client";

const client = createMdfnClient({
  baseUrl: "http://localhost:3010/api/mdfn",
  headers: { authorization: `Bearer ${process.env.MDFN_DEMO_TOKEN}` },
});
let remote = await client.createDocument({ title: "Example", markdown: "# Hello\n" });
const editor = createMdfn({ markdown: remote.markdown, sidecar: remote.sidecar });
editor.dispatch(new Transaction().replaceSource(2, 7, "Welcome"));
const snapshot = editor.getState();
let canDispose = false;
try {
  remote = await client.updateDocument(remote.id, {
    expectedVersion: remote.version,
    markdown: snapshot.markdown,
    sidecar: snapshot.sidecar,
    idempotencyKey: crypto.randomUUID(),
  });
  if (editor.getState().version === snapshot.version) editor.markSaved();
  canDispose = true;
  console.log(remote.version, remote.markdown);
} catch (error) {
  // Save the complete draft before disposing, including on network/key-reuse errors.
  await writeFile("mdfn-unsaved-draft.json", JSON.stringify({ documentId: remote.id, expectedVersion: remote.version, markdown: snapshot.markdown, sidecar: snapshot.sidecar }), { mode: 0o600 });
  canDispose = true;
  if (error instanceof MdfnClientError && error.code === "MDFN_VERSION_CONFLICT") {
    const latest = await client.getDocument(remote.id);
    console.error("Version conflict: reconcile mdfn-unsaved-draft.json with", latest.version);
    process.exitCode = 1;
  } else {
    throw error;
  }
} finally {
  if (canDispose) editor.destroy(); // Keep the editor alive if backing up the draft fails.
}
```

Use the last **server** version for `expectedVersion`, not the controller's local version. A stale update returns `MDFN_VERSION_CONFLICT` (409); retain the user's edits and reconcile with the latest document instead of blindly retrying. For a network retry of the same write, reuse its idempotency key and payload. `markSaved()` is local bookkeeping and does not persist anything.

## Durable deployment

Durable mode is the default and requires transactions plus relational constraints. Supply a durable `@superfunctions/db` adapter, provision the descriptors from `getSchema()` with your migration system, and keep browser/server Markdown extensions aligned. The returned `schema` describes required storage; construction does not replace the host's migration process. Ephemeral mode is only for local/testing hosts and loses data on restart.

Persist Markdown and the complete sidecar together. Writes validate them atomically. `listVersions` returns summaries and a continuation cursor; `getVersion` fetches full historical content, and `restoreVersion` requires the current expected version. Collaboration update storage is a separate protocol covered in [collaboration](/docs/collaboration).
