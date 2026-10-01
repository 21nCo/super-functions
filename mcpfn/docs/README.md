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
npm exec -- docsfn validate --root .
npm exec -- docsfn build --root . --out-dir .docsfn
```

The site defaults to port 6010 in development and preview. Set `CLOUDFLARE_DOCS_DEPLOY=1` when building with the Cloudflare adapter.
The public documentation route is `/docs`.

The LLM resources are served at `/docs/llms.txt` and `/docs/llms-full.txt` so they stay inside the shared docs Worker route. Until a public host is serving the site, generated indexes link to the repository source pages and the full corpus footer links to the source index. The default Git ref is `dev`; set `DOCS_SOURCE_REF` to a branch or commit when generating preview/version-pinned links (for example `DOCS_SOURCE_REF=codex/docs-mcpfn-20260926 npm run generate:llms --workspace @mcpfn/docs`). Deployment builds use `CLOUDFLARE_DOCS_PUBLIC_ORIGIN` for page/body/footer links, independently of `CLOUDFLARE_DOCS_ASSETS_ORIGIN` for assets.
