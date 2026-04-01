# svelte-datafn-demo

Svelte-based `extfn` example that uses `@datafn/extfn`.

What it demonstrates:

- background-owned DataFn authority
- popup and options pages using the DataFn proxy client
- content UI reading extension-backed data through the same DataFn integration
- Svelte page mounts plus content mounts

## Repo-root commands

```bash
npm run build -- --filter=svelte-datafn-demo
npm exec extfn build -- --target chromium-mv3 --config extfn/examples/svelte-datafn-demo/extfn.config.ts
npm exec extfn scan -- --target chromium-mv3 --config extfn/examples/svelte-datafn-demo/extfn.config.ts
npm exec extfn package -- --target chromium-mv3 --config extfn/examples/svelte-datafn-demo/extfn.config.ts
```
