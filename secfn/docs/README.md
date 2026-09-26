# SecFn documentation site

This SvelteKit site uses DocsFn. Consumer guides live in `content/docs`; source-aligned references mirror the core, server, and runtime package READMEs.

From the repository root:

```sh
npm --workspace @secfn/docs run dev
npm --workspace @secfn/docs run build
```

The build regenerates `static/llms.txt` and `static/llms-full.txt`. For CLI validation, first build the SearchFn workspace dependencies from the repository root (the Vite site build uses source aliases and does not require these separate builds):

```sh
npm run build --workspace @searchfn/core
npm run build --workspace @searchfn/adapter-contracts
npm run build --workspace @searchfn/adapter-memory
npm run build --workspace @searchfn/adapter-indexeddb
npm run build --workspace @searchfn/client
npm exec --workspace @secfn/docs -- docsfn validate --root .
```

The site defaults to port 6016. The public documentation URL is `https://secfn.com/docs`.

The LLM resources are served at `/docs/llms.txt` and `/docs/llms-full.txt` so they stay inside the shared docs Worker route. Generated page links use the configured public host, `https://secfn.com/docs`.
