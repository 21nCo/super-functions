# @datafn/extfn

`@datafn/extfn` is the DataFn integration layer for `extfn`.

It keeps DataFn authority in the extension background context and gives popup, options, sidepanel, and content code a proxy client surface that stays aligned with the public `@datafn/client` API.

## What this package owns

- background authority setup
- background request routing for DataFn RPC methods
- cross-context proxy client creation
- subscription fanout and cleanup for extension contexts

It does not move DataFn semantics into `extfn` core.

## Public surface

The package exports:

- `createDatafnExtfnAuthority(...)`
- `createDatafnExtfnProxyClient(...)`
- `createBrowserDatafnExtfnBridge(...)`
- `datafnExtfn(...)`
- `createDatafnExtfnRoutes(...)`

## Options

`DatafnExtfnOptions` is based on the current public `DatafnClientConfig` shape.

Supported keys:

- `schema`
- `clientId`
- `namespace`
- `sync`
- `storage`
- `plugins`
- `searchProvider`
- `requestTimeoutMs`

Not supported:

- `authContext`

If you need auth/session behavior, keep that in consumer code or another package-owned layer and pass DataFn the resulting configuration or storage behavior explicitly.

## Background authority

Create the authority in background code only.

```ts
import { createDatafnExtfnAuthority } from "@datafn/extfn";
import { demoNamespace, demoSchema } from "./demoSchema.js";

const authority = createDatafnExtfnAuthority(
  {
    schema: demoSchema,
    clientId: "authority:demo",
    namespace: demoNamespace,
  },
  {
    address: {
      context: "background",
    },
  },
);

authority.attachBrowserRuntimeBridge();
```

The authority:

- rejects non-background startup
- reuses `@datafn/client` storage adapters
- owns subscription lifecycle
- speaks extfn-compatible request/response/event envelopes to extension contexts

## Popup, options, sidepanel, and content clients

Create a proxy client in any non-background context.

```ts
import { createDatafnExtfnProxyClient } from "@datafn/extfn";

const client = createDatafnExtfnProxyClient({
  schema: demoSchema,
  clientId: "popup:demo",
  namespace: demoNamespace,
});

const notes = await client.query({
  resource: "note",
  version: 1,
  select: ["id", "title"],
});
```

You can also pass explicit runtime options:

```ts
const client = createDatafnExtfnProxyClient(
  {
    schema: demoSchema,
    clientId: "content:demo",
    namespace: demoNamespace,
  },
  {
    address: {
      context: "content",
      contentScriptId: "highlights",
      tabId: 12,
    },
  },
);
```

## Using the plugin helper

`datafnExtfn(...)` returns a runtime plugin plus convenience accessors.

Use it when your package wants to bundle:

- a stable plugin id
- background route registration
- a reusable proxy-client factory

Keep in mind that background authority startup is still package-owned logic.

## Example in this repo

See:

- `extfn/examples/svelte-datafn-demo/extfn.config.ts`
- `extfn/examples/svelte-datafn-demo/src/background/index.ts`
- `extfn/examples/svelte-datafn-demo/src/demoClient.ts`

## Validation from repo root

```bash
npm run test -- --filter=@datafn/extfn
npm run build -- --filter=svelte-datafn-demo
npm exec extfn scan -- --config extfn/examples/svelte-datafn-demo/extfn.config.ts
```
