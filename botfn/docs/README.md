# BotFn documentation site

This SvelteKit site uses DocsFn. Consumer guides and source-aligned references live in `content/docs`. Keep these pages aligned with the actual packages under `botfn/`.

From the repository root:

```sh
npm --workspace @botfn/docs run dev
npm --workspace @botfn/docs run build
```

The build regenerates `static/llms.txt` and `static/llms-full.txt`. Run `docsfn validate --root .` from `botfn/docs`. The site defaults to port 6013. Set `site.canonicalUrl` in `docsfn.config.ts` after the public host is assigned.
