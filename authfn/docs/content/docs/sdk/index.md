---
title: SDKs
description: First-party authfn SDKs — Node kernel, TypeScript client, Svelte bindings, Python kernel, Swift client.
---

# SDKs

authfn ships a first-party SDK for every supported runtime. Pick the right one for the role:

| Layer | Package | Role |
| --- | --- | --- |
| Server kernel (Node) | [`authfn`](./core) | Declare the app, inject runtime dependencies, and mount on Hono / Express / Bun / SvelteKit / Next.js. |
| TypeScript client | [`@authfn/client`](./client) | Browser, Node, Bun, Deno HTTP client. |
| Svelte bindings | [`@authfn/svelte`](./svelte) | Stores, context, SvelteKit helpers. |
| Python kernel | [`authfn`](./python) (PyPI) | Compose the auth runtime, mount on FastAPI / Flask / Starlette. |
| Swift client | [`AuthFnSwift`](./swift) (SPM) | iOS / macOS bearer client with native Apple flow and handoff. |

A `@authfn/admin` package mounts admin-only HTTP routes on top of any kernel — see [Admin](../admin).

## Wire-level parity

All SDKs speak the **same wire contract**: same paths, same envelopes, same error codes, same OpenAPI document. A Node server can serve a Swift client; a Python server can serve a `@authfn/client` browser app; the Svelte SDK works against either backend.

The contract is enforced in CI:

- `authfn` writes its OpenAPI snapshot.
- The Python kernel diffs against it.
- The Swift client tests run against a synthetic Node server.

This means picking an SDK is a runtime decision, not a long-term architectural commitment. You can swap a Node kernel for a Python one (or the other way around) without changing client code.
