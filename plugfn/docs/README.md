# PlugFn documentation site

This SvelteKit site uses DocsFn. Consumer guides live in `content/docs`; the original Markdown guides remain at their existing paths under `plugfn/docs`.

From the repository root:

```sh
npm --workspace @plugfn/docs run dev
npm --workspace @plugfn/docs run build
```

The build regenerates `static/llms.txt` and `static/llms-full.txt`. For CLI validation, first build the SearchFn workspace dependencies from the repository root (the Vite site build uses source aliases and does not require these separate builds):

```sh
npm run build --workspace @searchfn/core
npm run build --workspace @searchfn/adapter-contracts
npm run build --workspace @searchfn/adapter-memory
npm run build --workspace @searchfn/adapter-indexeddb
npm run build --workspace @searchfn/client
npm exec --workspace @plugfn/docs -- docsfn validate --root .
```

The site defaults to port 6023. Set `site.canonicalUrl` once the public host is assigned.

The LLM resources are served at `/docs/llms.txt` and `/docs/llms-full.txt` so they stay inside the shared docs Worker route. Generated page links use the configured public host, `https://plugfn.com/docs`.
