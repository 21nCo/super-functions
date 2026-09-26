# MemoryFn documentation site

This SvelteKit site uses DocsFn. Consumer guides and source-aligned references live in `content/docs`. Update the site alongside changes to `memoryfn/typescript` public contracts.

From the repository root:

```sh
npm --workspace @memoryfn/docs run dev
npm --workspace @memoryfn/docs run build
```

The build regenerates `static/llms.txt` and `static/llms-full.txt`. Run `docsfn validate --root .` from `memoryfn/docs`. The site defaults to port 6012. Set `site.canonicalUrl` in `docsfn.config.ts` after the public host is assigned.
