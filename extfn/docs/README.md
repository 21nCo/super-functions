# ExtFn documentation site

This SvelteKit site uses DocsFn. Consumer guides live in `content/docs`; detailed reference pages mirror the existing Markdown guides in this directory to preserve repository links. Keep both copies aligned when changing an ExtFn contract.

From the repository root:

```sh
npm --workspace @extfn/docs run dev
npm --workspace @extfn/docs run build
```

The build regenerates `static/llms.txt` and `static/llms-full.txt`. For CLI validation, first build the SearchFn workspace dependencies from the repository root (the Vite site build uses source aliases and does not require these separate builds):

```sh
npm run build --workspace @searchfn/core
npm run build --workspace @searchfn/adapter-contracts
npm run build --workspace @searchfn/adapter-memory
npm run build --workspace @searchfn/adapter-indexeddb
npm run build --workspace @searchfn/client
npm exec --workspace @extfn/docs -- docsfn validate --root .
```
  The site defaults to port 6015. The public documentation URL is `https://extfn.com/docs`.

The LLM resources are served at `/docs/llms.txt` and `/docs/llms-full.txt`.
