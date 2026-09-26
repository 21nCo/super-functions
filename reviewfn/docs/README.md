# ReviewFn documentation site

This SvelteKit site uses DocsFn. Consumer guides live in `content/docs`; detailed reference pages mirror the existing Markdown guides in this directory to preserve repository links. Keep both copies aligned when changing a ReviewFn contract.

From the repository root:

```sh
npm --workspace @reviewfn/docs run dev
npm --workspace @reviewfn/docs run build
```

The build regenerates `static/llms.txt` and `static/llms-full.txt`. Run `docsfn validate --root .` from `reviewfn/docs`. The site defaults to port 6014. Set `site.canonicalUrl` in `docsfn.config.ts` after the public host is assigned.
