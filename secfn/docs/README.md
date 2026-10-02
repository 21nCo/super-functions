# SecFn documentation site

This SvelteKit site uses DocsFn. Consumer guides live in `content/docs`; source-aligned references mirror the core, server, and runtime package READMEs.

From the repository root:

```sh
npm --workspace @secfn/docs run dev
npm --workspace @secfn/docs run build
```

The build regenerates the three source README reference mirrors and `static/llms.txt` / `static/llms-full.txt`. Edit the core, server, or runtime README, then run `npm --workspace @secfn/docs run generate:references` and `npm --workspace @secfn/docs run generate:llms`. Run `npm --workspace @secfn/docs run check:references` and `npm --workspace @secfn/docs run check:llms` before building: these checks reject stale committed bytes without rewriting them. CI runs the reference and all affected consumers' LLM checks before Build/prebuild.

For CLI validation, first build the SearchFn workspace dependencies from the repository root (the Vite site build uses source aliases and does not require these separate builds):

```sh
npm run build --workspace @searchfn/core
npm run build --workspace @searchfn/adapter-contracts
npm run build --workspace @searchfn/adapter-memory
npm run build --workspace @searchfn/adapter-indexeddb
npm run build --workspace @searchfn/client
npm run validate --workspace=@secfn/docs
```

The site defaults to port 6016. The planned public documentation URL is `https://secfn.com/docs`; set `site.canonicalUrl` after the host serves the site.

The LLM resources are served at `/docs/llms.txt` and `/docs/llms-full.txt` so they stay inside the shared docs Worker route. Until the public docs host is live, generated page links and the standalone full-corpus index footer point to source files on GitHub. `DOCS_SOURCE_REF` selects an encoded source revision (default `dev`). Deployment selects `CLOUDFLARE_DOCS_PUBLIC_ORIGIN` independently of `CLOUDFLARE_DOCS_ASSETS_ORIGIN`, which is only the asset CDN.
