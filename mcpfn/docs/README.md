# McpFn documentation site

This SvelteKit site uses the published DocsFn packages. Its consumer guides live in `content/docs`; package reference pages reflect the McpFn source on this branch. When a package contract changes, update both its package README and the corresponding site page.

From the repository root, install workspace dependencies and run:

```sh
npm run build --workspace @searchfn/core --workspace @searchfn/adapter-contracts --workspace @searchfn/adapter-memory --workspace @searchfn/adapter-indexeddb --workspace @searchfn/client
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
The public documentation URL is `https://mcpfn.com/docs`.

The LLM resources are served at `/docs/llms.txt` and `/docs/llms-full.txt` so they stay inside the shared docs Worker route. Generated page links use the configured public host, `https://mcpfn.com/docs`.
