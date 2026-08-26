# @uifn/registry

The signed, offline-capable registry and transaction-safe source installer for uifn.

Status: `ga-candidate`. The stable catalog contains the 69 canonical components for React, Svelte, and Solid. Vue and Angular are intentionally unsupported.

## One delivery pipeline

Package exports and copied-source modules are generated together from the canonical uifn anatomy. A source template is byte-identical to its package source before installation. The generated catalog records the canonical version, generator version, definition hash, generator hash, template hashes, output hashes, MIT license, dependency requirements, and clean-room provenance.

The bundled catalog is verified with a detached Ed25519 signature before it is used. It does not require a registry network request, and the signing private key is never shipped in the package or repository.

## CLI

```bash
uifn list --json
uifn info button --framework react --json
uifn add button --framework react --cwd . --dry-run --json
uifn add button --framework react --cwd . --json
uifn diff --cwd . --json
uifn update button --cwd . --dry-run --json
uifn doctor --cwd . --json
uifn remove button --cwd . --dry-run --json
uifn validate --json
```

`add` validates the complete plan before writing. It rejects unsupported frameworks, dependency conflicts, dirty tracked files, traversal, symlink escapes, checksum failures, invalid signatures, dependency cycles, and license/provenance failures. Successful writes are staged on the consumer filesystem and committed atomically; an interruption restores the original bytes.

`--dry-run` returns the exact public plan and writes nothing. Repeating an unchanged install is byte-idempotent.

## Consumer metadata

Source installs write:

- `components/uifn/<framework>/...` — generated source owned by the consumer.
- `.uifn/registry.lock` — schema v2 lock entries with framework, version, dependencies, per-file source/output/installed hashes, canonical/generator versions, and provenance.
- `.uifn/selected-components.json` — the selected source-mode component index.
- dependency additions in `package.json`, only when they are not already compatible.

Local edits are never silently overwritten or removed. Conflict diagnostics report base, local, and incoming SHA-256 hashes without exposing file contents or local absolute paths.

## Maintainer checks

```bash
npm run generate:check
npm run typecheck
npm test
npm run build
```

The repository-wide delivery gate also creates independent package/source consumers for React, Svelte, and Solid and verifies type checking, production build, SSR, hydration, browser semantics, accessibility, and semantic-trace equivalence.
