# MDFN documentation site

This SvelteKit site uses DocsFn. Consumer guides live in `content/docs`; the package reference mirrors source READMEs.

From the repository root:

```sh
npm --workspace @mdfn/docs run dev
npm --workspace @mdfn/docs run build
```

The build regenerates `static/llms.txt` and `static/llms-full.txt`. Run `docsfn validate --root .` from `mdfn/docs`. The site defaults to port 6022. Set `site.canonicalUrl` once the public host is assigned.
