# BotFn documentation site

This SvelteKit site uses DocsFn. Consumer guides and source-aligned references live in `content/docs`. Keep these pages aligned with the actual packages under `botfn/`.

From the repository root:

```sh
npm --workspace @botfn/docs run dev
npm --workspace @botfn/docs run build
```

The build regenerates `static/llms.txt` and `static/llms-full.txt`. For CLI validation, first build the SearchFn workspace dependencies from the repository root (the Vite site build uses source aliases and does not require these separate builds):

```sh
npm run build --workspace @searchfn/core
npm run build --workspace @searchfn/adapter-contracts
npm run build --workspace @searchfn/adapter-memory
npm run build --workspace @searchfn/adapter-indexeddb
npm run build --workspace @searchfn/client
npm exec --workspace @botfn/docs -- docsfn validate --root .
```

The site defaults to port 6013. The public documentation URL is `https://botfn.com/docs`.

The LLM resources are served at `/docs/llms.txt` and `/docs/llms-full.txt`.
