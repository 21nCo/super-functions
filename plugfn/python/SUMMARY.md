# PlugFn Python Runtime Summary

## Status summary

The current Python label is **experimental baseline**.

This label means the package is importable, has a passing Python baseline, and participates in the core PlugFn release gate. It still should not be described as parity-complete across the full TypeScript provider surface.

## What exists today

- `plugfn` package entrypoint
- provider exports for `github`, `linear`, `clickup`, `gmail`, and `slack`
- auth-derived identity and raw-body webhook verification for the core adapter paths
- a passing repo-root Python test baseline at `python3 -m pytest -q plugfn/python/tests`

## What still blocks adoption as the default integration runtime

- broader provider parity outside the declared core set is still incomplete
- Python should not be treated as blanket-equal to the TypeScript runtime
- production wording must stay matrix-bounded even when the release gate is green

## Contract for current readers

Use the Python package only with explicit experimental expectations.

Before any Python surface can be described as production-ready, all of the following must be true:

1. the provider is marked appropriately in [../docs/provider-readiness-matrix.md](../docs/provider-readiness-matrix.md)
2. `npm run gate:plugfn-release` passes on the same commit
3. Python docs and status artifacts still agree with that matrix

## Current export scope

Current exported providers:

- `github`
- `linear`
- `clickup`
- `gmail`
- `slack`

Core provider set tracked by the release gate:

- `github`
- `linear`
- `clickup`
- `gmail`
