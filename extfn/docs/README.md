# ExtFn documentation site

This SvelteKit site uses DocsFn. Consumer guides live in `content/docs`; detailed reference pages mirror the existing Markdown guides in this directory to preserve repository links. Keep both copies aligned when changing an ExtFn contract.

From the repository root:

```sh
npm --workspace @extfn/docs run dev
npm --workspace @extfn/docs run build
```

The build regenerates `static/llms.txt` and `static/llms-full.txt`. Run `docsfn validate --root .` from `extfn/docs`. The site defaults to port 6015. Set `site.canonicalUrl` in `docsfn.config.ts` after the public host is assigned.
