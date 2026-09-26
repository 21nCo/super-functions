# SecFn documentation site

This SvelteKit site uses DocsFn. Consumer guides live in `content/docs`; source-aligned references mirror the core, server, and runtime package READMEs.

From the repository root:

```sh
npm --workspace @secfn/docs run dev
npm --workspace @secfn/docs run build
```

The build regenerates `static/llms.txt` and `static/llms-full.txt`. Run `docsfn validate --root .` from `secfn/docs`. The site defaults to port 6016. Set `site.canonicalUrl` in `docsfn.config.ts` after the public host is assigned.
