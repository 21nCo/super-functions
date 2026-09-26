# SendFn documentation site

This SvelteKit site uses DocsFn. Consumer guides live in `content/docs`; package references mirror the current source READMEs.

From the repository root:

```sh
npm --workspace @sendfn/docs run dev
npm --workspace @sendfn/docs run build
```

The build regenerates `static/llms.txt` and `static/llms-full.txt`. Run `docsfn validate --root .` from `sendfn/docs`. The site defaults to port 6021. Set `site.canonicalUrl` once the public host is assigned.
