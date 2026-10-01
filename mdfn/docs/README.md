# MDFN documentation site

This SvelteKit site uses DocsFn. Consumer guides live in `content/docs`; the package reference mirrors source READMEs.

From the repository root:

```sh
npm --workspace @mdfn/docs run dev
npm --workspace @mdfn/docs run build
```

The build regenerates `static/llms.txt` and `static/llms-full.txt`. For CLI validation, first build the SearchFn workspace dependencies from the repository root (the Vite site build uses source aliases and does not require these separate builds):

```sh
npm run build --workspace @searchfn/core
npm run build --workspace @searchfn/adapter-contracts
npm run build --workspace @searchfn/adapter-memory
npm run build --workspace @searchfn/adapter-indexeddb
npm run build --workspace @searchfn/client
npm run validate --workspace=@mdfn/docs
```

The site defaults to port 6022. Set `site.canonicalUrl` once the public docs host serves these routes.

The LLM resources are served at `/docs/llms.txt` and `/docs/llms-full.txt` so they stay inside the shared docs Worker route. Until the public docs host is live, generated page links and the full-corpus index reference point to source files on GitHub. They default to ref `dev`; set `DOCS_SOURCE_REF` to a branch or commit for unmerged/version-pinned previews, e.g. `DOCS_SOURCE_REF=codex/docs-mdfn-20260926 npm run generate:llms --workspace @mdfn/docs`. Cloudflare builds use `CLOUDFLARE_DOCS_PUBLIC_ORIGIN` for standalone page/body/index links, independently of the assets origin. CI checks committed corpora before prebuild regeneration can hide drift.
