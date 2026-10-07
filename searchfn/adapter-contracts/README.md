# `@searchfn/adapter-contracts`

Shared interfaces and error primitives for SearchFn adapters.

## Adapter conformance tests

The optional `@searchfn/adapter-contracts/testing` export provides the shared
adapter conformance suite. It is test-only and requires the consuming project
to install a compatible `vitest` version:

```sh
npm install --save-dev vitest@^3.2.4
```

Workspace adapters use `adapter-vitest.config.ts` to resolve this export to its
TypeScript source, so their tests do not require a prior contracts build.
