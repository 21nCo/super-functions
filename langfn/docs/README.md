# LangFn documentation site

This SvelteKit site uses DocsFn and documents the current TypeScript source. Consumer guides live in `content/docs`; references mirror the TypeScript README, provider matrix, and release-gate notes.

From the repository root:

```sh
npm --workspace @langfn/docs run dev
npm --workspace @langfn/docs run build
```

The build regenerates `static/llms.txt` and `static/llms-full.txt`. For CLI validation, first build the SearchFn workspace dependencies from the repository root (the Vite site build uses source aliases and does not require these separate builds):

```sh
npm run build --workspace @searchfn/core
npm run build --workspace @searchfn/adapter-contracts
npm run build --workspace @searchfn/adapter-memory
npm run build --workspace @searchfn/adapter-indexeddb
npm run build --workspace @searchfn/client
npm exec --workspace @langfn/docs -- docsfn validate --root .
```
  The site defaults to port 6018. Set `site.canonicalUrl` in `docsfn.config.ts` after the public host is assigned.
