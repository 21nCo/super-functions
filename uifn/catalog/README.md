# `@uifn/catalog`

Private, versioned definition compiler for the 69-primitive uifn 1.0 catalog.

`src/catalog-source.mjs` is the canonical source. It records identity, anatomy,
inputs, events, states, controlled and form semantics, DOM service ownership,
accessibility requirements, React/Svelte/Solid targets, vectors, docs, stories,
release ownership, and exceptions. `generated/` is entirely mechanical output.

The generated files are requirement and target metadata only. They do not prove
that controllers, adapters, components, stories, docs, accessibility reviews, or
registry/source-install payloads have been implemented.

From the repository root:

```sh
npm run generate:uifn-catalog
npm run verify:uifn-catalog
node --test scripts/verify-uifn-catalog.test.mjs
```

The verifier compiles twice, requires byte-identical results, checks the checked-in
directory for drift, and executes positive and negative CAT-001 vectors.
