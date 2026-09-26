# DevFn documentation site

This SvelteKit site uses DocsFn. Consumer guides live in `content/docs`; reference pages mirror existing configuration, security, migration, and package Markdown guides.

From the repository root:

```sh
npm --workspace @devfn/docs run dev
npm --workspace @devfn/docs run build
```

The build regenerates `static/llms.txt` and `static/llms-full.txt`. For CLI validation, first build the SearchFn workspace dependencies from the repository root (the Vite site build uses source aliases and does not require these separate builds):

```sh
npm run build --workspace @searchfn/core
npm run build --workspace @searchfn/adapter-contracts
npm run build --workspace @searchfn/adapter-memory
npm run build --workspace @searchfn/adapter-indexeddb
npm run build --workspace @searchfn/client
npm exec --workspace @devfn/docs -- docsfn validate --root .
```
  The site defaults to port 6017. Set `site.canonicalUrl` in `docsfn.config.ts` after the public host is assigned.
