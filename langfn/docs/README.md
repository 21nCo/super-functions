# LangFn documentation site

This SvelteKit site uses DocsFn and documents the current TypeScript source. Consumer guides live in `content/docs`; references mirror the TypeScript README, provider matrix, and release-gate notes.

From the repository root:

```sh
npm --workspace @langfn/docs run dev
npm --workspace @langfn/docs run build
```

The build regenerates `static/llms.txt` and `static/llms-full.txt`. Run `docsfn validate --root .` from `langfn/docs`. The site defaults to port 6018. Set `site.canonicalUrl` in `docsfn.config.ts` after the public host is assigned.
