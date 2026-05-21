---
title: Full demo
description: Browser uploads, thumbnails, download / delete, smoke tests — Hono + SvelteKit + memory adapter + local FS storage.
---

# Full demo

The full-demo example exercises the entire surface in a single repo. Use it as:

- a sanity check that your local toolchain works
- a "minimal complete app" template
- a smoke test target for CI on changes to filefn internals

Located at `filefn/examples/full-demo/`.

## Layout

```
filefn/examples/full-demo/
├── README.md
├── smoke.mjs
├── server/
│   └── (Node.js + Hono + memory DB + local FS)
└── client/
    └── (SvelteKit + @filefn/client)
```

## Run it

From the workspace root:

```bash
npm install

cd filefn/examples/full-demo/server
npm run dev   # http://localhost:3001
```

In another shell:

```bash
cd filefn/examples/full-demo/client
npm run dev   # http://localhost:5173
```

Open `http://localhost:5173`, pick a file, and watch it upload.

If the default ports are taken:

```bash
PORT=3101 npm --prefix filefn/examples/full-demo/server run dev
VITE_FILEFN_SERVER_URL=http://localhost:3101 npm --prefix filefn/examples/full-demo/client run dev -- --port 5174
```

## Smoke check

```bash
node filefn/examples/full-demo/smoke.mjs
```

The script walks the full lifecycle (init → upload → list → download → delete) using the canonical `@filefn/*` packages. CI runs the same script.

## Server highlights

- `createMemoryAdapter()` — no DB to set up.
- `createLocalStorage({ rootDir: "./.filefn-storage" })` — bytes on disk under the example dir.
- A single `images` policy.
- `processing.enabled: true` with `createThumbnailProcessor()` for default sizes.
- All filefn routes mounted under `/filefn`.

## Client highlights

- `createFileFnClient({ baseUrl: "/filefn" })` — wired through Vite proxy.
- Direct `uploadFile` / `listFiles` / `downloadUrl` / `deleteFile` calls.
- Renderable previews via `client.resolveRenderable`.

## Next step

For something closer to production, read [Production](./production).
