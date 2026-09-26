# McpFn documentation site

This SvelteKit site uses the published DocsFn packages. Its consumer guides live in `content/docs`; package reference pages reflect the McpFn source on this branch. When a package contract changes, update both its package README and the corresponding site page.

From the repository root, install workspace dependencies and run:

```sh
npm --workspace @mcpfn/docs run dev
npm --workspace @mcpfn/docs run build
```

The build regenerates `static/llms.txt` and `static/llms-full.txt`. Run DocsFn validation from this directory:

```sh
cd mcpfn/docs
docsfn validate --root .
docsfn build --root . --out-dir .docsfn
```

The site defaults to port 6010 in development and preview. Set `CLOUDFLARE_DOCS_DEPLOY=1` when building with the Cloudflare adapter.
Set `site.canonicalUrl` in `docsfn.config.ts` after the public host is assigned.
