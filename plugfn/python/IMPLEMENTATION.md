# PlugFn Python Runtime - Implementation Baseline

This document describes the current Python **experimental baseline** for PlugFn.

It is intentionally narrower than the TypeScript runtime and should be read as a truthful implementation snapshot, not as a production claim.

## Current baseline

After Phase 05, the Python package guarantees:

- clean import from the package entrypoint
- clean import of the currently exported providers
- a passing repo-root Python baseline via `python3 -m pytest -q plugfn/python/tests`
- mutually consistent maturity language across Python docs and status artifacts

## Current package shape

```text
plugfn/python/plugfn/
├── __init__.py
├── types.py
├── core/
├── auth/
├── storage/
├── http/
├── webhooks/
├── adapters/
└── providers/
```

## What the baseline includes

- `PlugFn` and `PlugFnConfig` entrypoints
- provider registry and dynamic provider proxy scaffolding
- OAuth connection flow scaffolding
- workflow and webhook scaffolding
- experimental provider exports for `github` and `slack`

## What the baseline does not claim

- production readiness
- release-gated support
- security parity with the TypeScript runtime
- parity with the future core provider target of `github`, `linear`, `clickup`, and `gmail`

## Provider model contract

The provider model now declares provider metadata plus optional runtime fields directly:

- `auth_config`
- `actions`
- `triggers`

Provider modules must populate those fields without relying on undeclared Pydantic attribute mutation at import time.

## Import/test baseline

The repo-root test baseline currently verifies:

- package import
- provider export import
- provider metadata/action/trigger availability for the current experimental exports

That baseline is intentionally smaller than later parity and security phases.

## Next work after this baseline

- Phase 06: Python auth and webhook security parity
- Phase 07: Python core provider parity
- Phase 08: repo-root release gate integration
