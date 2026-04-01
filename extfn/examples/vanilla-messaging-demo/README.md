# vanilla-messaging-demo

Minimal framework-agnostic `extfn` example.

What it demonstrates:

- code-first config with one Chromium target
- background message handler discovery
- popup rendering without a framework adapter
- runtime capability and browser-facade access

## Repo-root commands

```bash
npm run build -- --filter=vanilla-messaging-demo
npm exec extfn build -- --target chromium-mv3 --config extfn/examples/vanilla-messaging-demo/extfn.config.ts
npm exec extfn scan -- --target chromium-mv3 --config extfn/examples/vanilla-messaging-demo/extfn.config.ts
npm exec extfn package -- --target chromium-mv3 --config extfn/examples/vanilla-messaging-demo/extfn.config.ts
```
