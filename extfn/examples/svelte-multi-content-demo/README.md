# svelte-multi-content-demo

Svelte-based `extfn` example for multiple content modules and modular background handlers.

What it demonstrates:

- Chromium and Firefox targets
- one background service worker plus discovered message handlers
- multiple content entries with different anchor and style-isolation strategies
- Svelte page and content mounts

## Repo-root commands

```bash
npm run build -- --filter=svelte-multi-content-demo
npm exec extfn build -- --config extfn/examples/svelte-multi-content-demo/extfn.config.ts
npm exec extfn scan -- --config extfn/examples/svelte-multi-content-demo/extfn.config.ts
npm exec extfn package -- --target chromium-mv3 --config extfn/examples/svelte-multi-content-demo/extfn.config.ts
npm exec extfn package -- --target firefox-mv3 --config extfn/examples/svelte-multi-content-demo/extfn.config.ts
```
