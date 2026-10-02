# ReviewFn documentation site

This SvelteKit site uses DocsFn. Consumer guides live in `content/docs`; detailed reference pages mirror the existing Markdown guides in this directory to preserve repository links. Edit the source guides and run `npm run generate:references --workspace @reviewfn/docs`. The nonwriting `check:references` verifies all five copies before CI builds.

From the repository root:

```sh
npm --workspace @reviewfn/docs run dev
npm --workspace @reviewfn/docs run build
```

The build regenerates `static/llms.txt` and `static/llms-full.txt`. For CLI validation, first build the SearchFn workspace dependencies from the repository root (the Vite site build uses source aliases and does not require these separate builds):

```sh
npm run build --workspace @searchfn/core
npm run build --workspace @searchfn/adapter-contracts
npm run build --workspace @searchfn/adapter-memory
npm run build --workspace @searchfn/adapter-indexeddb
npm run build --workspace @searchfn/client
npm exec --workspace @reviewfn/docs -- docsfn validate --root .
```

The site defaults to port 6014. Set `site.canonicalUrl` once the public docs host serves these routes.

The LLM resources are served at `/docs/llms.txt` and `/docs/llms-full.txt` so they stay inside the shared docs Worker route. Until the public docs host is live, generated page links and the full-text page-index footer point to source files on GitHub. For a preview, set `DOCS_SOURCE_REF` to its branch or commit when generating; the default `dev` does not contain unmerged pages. Cloudflare builds receive `CLOUDFLARE_DOCS_PUBLIC_ORIGIN` independently of `CLOUDFLARE_DOCS_ASSETS_ORIGIN`, so a CDN does not become the documentation host. Local root LLM resources remain compatibility aliases for the same artifacts; deployed routing remains limited to `/docs*`.
