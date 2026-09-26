# MailFn documentation site

This SvelteKit site uses DocsFn. Consumer guides live in `content/docs`; references mirror the source specification, threat model, operations guide, and package READMEs.

From the repository root:

```sh
npm --workspace @mailfn/docs run dev
npm --workspace @mailfn/docs run build
```

The build regenerates `static/llms.txt` and `static/llms-full.txt`. Run `docsfn validate --root .` from `mailfn/docs`. The site defaults to port 6019. Set `site.canonicalUrl` in `docsfn.config.ts` after the public host is assigned.
