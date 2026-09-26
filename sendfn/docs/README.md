# SendFn documentation site

This SvelteKit site uses DocsFn. Consumer guides live in `content/docs`; package references mirror the current source READMEs.

From the repository root:

```sh
npm --workspace @sendfn/docs run dev
npm --workspace @sendfn/docs run build
```

The build regenerates `static/llms.txt` and `static/llms-full.txt`. For CLI validation, first build the SearchFn workspace dependencies from the repository root (the Vite site build uses source aliases and does not require these separate builds):

```sh
npm run build --workspace @searchfn/core
npm run build --workspace @searchfn/adapter-contracts
npm run build --workspace @searchfn/adapter-memory
npm run build --workspace @searchfn/adapter-indexeddb
npm run build --workspace @searchfn/client
npm exec --workspace @sendfn/docs -- docsfn validate --root .
```

The site defaults to port 6021. Set `site.canonicalUrl` once the public host is assigned.

The LLM resources are served at `/docs/llms.txt` and `/docs/llms-full.txt` so they stay inside the shared docs Worker route. Generated page links use the configured public host, `https://sendfn.com/docs`.
