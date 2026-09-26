# PlugFn documentation site

This SvelteKit site uses DocsFn. Consumer guides live in `content/docs`; the original Markdown guides remain at their existing paths under `plugfn/docs`.

From the repository root:

```sh
npm --workspace @plugfn/docs run dev
npm --workspace @plugfn/docs run build
```

The build regenerates `static/llms.txt` and `static/llms-full.txt`. Run `docsfn validate --root .` from `plugfn/docs`. The site defaults to port 6023. Set `site.canonicalUrl` once the public host is assigned.
