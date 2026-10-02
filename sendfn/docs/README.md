# SendFn documentation site

This SvelteKit site uses DocsFn. Consumer guides live in `content/docs`; package references mirror the current source READMEs.

From the repository root:

```sh
npm --workspace @sendfn/docs run dev
npm --workspace @sendfn/docs run build
```

Reference mirrors come from `../typescript/README.md` and `../python/README.md`.
Use `npm run generate:references --workspace @sendfn/docs` after source edits.
The nonwriting `check:references` and `check:llms` commands run in CI before Build
can regenerate `static/llms.txt` and `static/llms-full.txt`. For CLI validation, first build the SearchFn workspace dependencies from the repository root (the Vite site build uses source aliases and does not require these separate builds):

```sh
npm run build --workspace @searchfn/core
npm run build --workspace @searchfn/adapter-contracts
npm run build --workspace @searchfn/adapter-memory
npm run build --workspace @searchfn/adapter-indexeddb
npm run build --workspace @searchfn/client
npm run validate --workspace=@sendfn/docs
```

The site defaults to port 6021. Set `site.canonicalUrl` once the public host is assigned.

The public landing page is `/docs` on both `sendfn.com` and `dev.sendfn.com`,
inside the docs Worker's `/docs*` route. `/` is a local-preview compatibility
route, not a claim that this Worker owns the deployed host root.

The LLM resources are served at `/docs/llms.txt` and `/docs/llms-full.txt` so they stay inside the shared docs Worker route. Until the public docs host is live, generated page links point to the source files on GitHub.
