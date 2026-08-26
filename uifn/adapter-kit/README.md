# @uifn/adapter-kit

Lossless framework-translation helpers and the shared semantic conformance
harness for the React, Svelte, and Solid adapters.

The package is intentionally limited to:

- event/attribute/style translation and deterministic prop merging;
- ref composition, element registration, lifecycle cleanup, and SSR guards;
- the normalized semantic trace schema, comparator, and parity runner.

It does not own primitive state, keyboard maps, transitions, focus algorithms,
portals, positioning, layers, modal locks, presence, or other DOM services.
Primitive behavior belongs to `@uifn/core`; browser ownership belongs to
`@uifn/dom`. Framework adapters may bind those contracts but may not fork them.

The semantic trace preserves actions, transactions, callbacks, complete part
props and DOM/ARIA state, form values, focus, errors, and cleanup resources. It
normalizes only framework-generated identifiers and transaction version
numbers. Callback order, focus targets, ARIA values, state, styles, and cleanup
remain comparison-significant.

The public-parity gate mounts all 69 actual exported public compounds in React,
Svelte, and Solid in both workspace-source and clean packed-tarball consumers. Every trace
must match a reviewed golden; seeded ARIA, callback-order, and focus mutations
must fail at their exact semantic paths.

Status: `ga-candidate`.
