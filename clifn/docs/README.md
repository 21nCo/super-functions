# CliFn documentation site

This SvelteKit site uses DocsFn. Consumer guides and subpath references live in `content/docs` and should be updated with changes to the public `@clifn/core` exports.

From the repository root:

```sh
npm --workspace @clifn/docs run dev
npm --workspace @clifn/docs run build
```

The build regenerates `static/llms.txt` and `static/llms-full.txt`. Run `docsfn validate --root .` from `clifn/docs`. The site defaults to port 6011. Set `site.canonicalUrl` in `docsfn.config.ts` after the public host is assigned.
