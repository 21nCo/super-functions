# DevFn documentation site

This SvelteKit site uses DocsFn. Consumer guides live in `content/docs`; reference pages mirror existing configuration, security, migration, and package Markdown guides.

From the repository root:

```sh
npm --workspace @devfn/docs run dev
npm --workspace @devfn/docs run build
```

The build regenerates `static/llms.txt` and `static/llms-full.txt`. Run `docsfn validate --root .` from `devfn/docs`. The site defaults to port 6017. Set `site.canonicalUrl` in `docsfn.config.ts` after the public host is assigned.
