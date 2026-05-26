# PlugFn Public Contract

## Overview

PlugFn is the shared integration runtime for Superfunctions applications. Its core contract is:

- register provider modules
- manage connection state
- expose OAuth and webhook routes through shared HTTP abstractions
- execute actions and workflows against configured providers

PlugFn is not currently described as globally production-ready. A provider or runtime surface may only be treated as production-ready on commits where `npm run gate:plugfn-release` passes and the provider is marked `production` in [docs/provider-readiness-matrix.md](./docs/provider-readiness-matrix.md).

## Package surface

- TypeScript runtime package: `plugfn`
- CLI package: `@plugfn/cli`
- Python package: `plugfn`

The package names above are the only public install contract. Historical scoped-package instructions are obsolete.

## Core runtime scope

The default PlugFn product story is a general shared integration runtime for repository apps such as nucleus. The core runtime includes:

- provider registration and discovery
- connection lifecycle orchestration
- OAuth callback handling through shared OAuth packages
- webhook route exposure and verification
- workflow execution and lifecycle management
- shared persistence through `@superfunctions/db`

## Vertical and experimental scope

PlugFn may contain additional modules that are useful for specific products or mail-heavy workflows. Those surfaces are allowed to exist, but they are not part of the default adoption contract unless they independently meet the same release gate and matrix requirements.

Examples of vertical or non-core scope include:

- managed-mail flows
- forwarding adapters
- app-specific mail policy layers
- product-specific financial extraction or send governance workflows

## Core provider set tracked by release gating

The provider set that release gating must cover is:

- `github`
- `linear`
- `clickup`
- `gmail`
- `notion`

These are the minimum providers that must be tracked explicitly in the readiness matrix. Python parity may lag provider-by-provider; the matrix is the source of truth for language readiness.

## Language contract

### TypeScript

The TypeScript runtime is the primary PlugFn implementation today. It is the reference surface for:

- `plugfn(...)`
- provider registration
- route exposure through `createPlugFnRouter(...)`
- shared OAuth and storage integration

### Python

The Python package exists, and the declared core provider set is now part of the repo-root release gate. Broader parity beyond that core set is still not claimed, so Python docs and summaries must stay aligned with the readiness matrix.

## Browser and client boundary

PlugFn does not currently publish a browser-first SDK. If a thin browser helper is added later, it is limited to:

- provider catalog discovery
- connection initiation

The following operations remain server-only:

- token exchange
- token refresh
- disconnect
- direct credentialed provider actions
- webhook verification
- workflow execution

See [docs/client-sdk-boundary.md](./docs/client-sdk-boundary.md).

## Route exposure

PlugFn routes are intended to be mounted through `@superfunctions/http` in TypeScript and equivalent FastAPI or Flask adapters in Python. The route surface includes:

- OAuth start and callback routes
- webhook ingestion routes
- connection management routes
- provider catalog routes
- workflow management routes

The concrete route semantics are hardened in later implementation phases; this document only defines the public contract and scope boundary.

## Shared-package expectations

PlugFn should build on shared packages rather than duplicating generic infrastructure:

- `@superfunctions/db`
- `@superfunctions/http`
- `@superfunctions/oauth-core`
- `@superfunctions/oauth-flow`
- `@superfunctions/oauth-http`
- `@superfunctions/oauth-storage`
- `@superfunctions/oauth-providers`

## Release truth

The correct readiness wording is:

> PlugFn does not make blanket production-ready claims; readiness is provider-specific and must match the provider readiness matrix plus a green same-commit `npm run gate:plugfn-release`.

See [docs/operations/release-gates.md](./docs/operations/release-gates.md).
