# ApiFn documentation site

This SvelteKit site uses DocsFn. Consumer guides live in `content/docs`; reference pages mirror the source package READMEs.

From the repository root:

```sh
npm --workspace @apifn/docs run dev
npm --workspace @apifn/docs run build
```

The build regenerates `static/llms.txt` and `static/llms-full.txt`. Run `docsfn validate --root .` from `apifn/docs`. The site defaults to port 6020. Set `site.canonicalUrl` once the public host is assigned.
