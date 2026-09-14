---
title: CLI
description: docsfn validate, build, and dev commands, options, artifacts, and pipeline overview.
---

# CLI

The **`docsfn`** CLI (`@docsfn/cli`) loads your config, runs the **manifest + search** pipeline, prints **diagnostics**, and writes **artifacts** to disk.

## Installation

- **One-off:** `npx docsfn <command>` from your docs site root.
- **Project dependency:** add `@docsfn/cli` to `devDependencies` and run `npx docsfn` or a package script.

## `docsfn validate [root]`

Validates configuration and content **without** writing artifacts (beyond what the pipeline needs in memory).

**Options:**

| Flag | Description |
| --- | --- |
| `--root <dir>` | Working directory containing `docsfn.config.*` (defaults to positional `[root]` or `.`). |
| `--config <path>` | Explicit config file path. |

**Output:** Human-readable diagnostics (errors, warnings, info) via `formatDiagnosticsForCli`, plus a summary line with counts.

**Exit code:** **`0`** when there are no error-severity diagnostics; **`1`** when any **error** exists (`hasErrorDiagnostics`).

## `docsfn build [root]`

Runs the full pipeline and writes output under **`--out-dir`** (default **`.docsfn`**). Legacy **`--out`** is accepted as an alias for the output directory.

**Artifacts** (`writeArtifacts`):

| File | Contents |
| --- | --- |
| `manifest.json` | Resolved `DocsManifest` (pages, routes, sidebars, blog, apis, …). |
| `search.json` | `DocsSearchArtifact` when `search.enabled` is true and the index builds successfully. |
| `diagnostics.json` | Array of `DocsDiagnostic` objects from the run. |
| `compat-report.json` | Compatibility preset report (e.g. fumadocs parity hints). |

**Console:** On success with a search artifact, the CLI prints build duration and **`search artifact` size in bytes**.

**Exit code:** Same rule as validate—**`1`** on error diagnostics.

## `docsfn dev [root]`

1. Runs an **initial** pipeline + `writeArtifacts` (same as build).
2. If errors occur, exits with code **`1`**.
3. Computes **watch targets**: config file candidates, content collection directories from config (and optional provider watch metadata), **excluding** the output directory.
4. Starts **chokidar** on those paths with `ignoreInitial: true`.
5. On any change, queues a **rebuild** (`runPipeline` with `changedPaths`), rewrites artifacts, and prints diagnostics + `dev:rebuild` summary.

**Output directory exclusion:** Changes **inside** `.docsfn` (or your chosen `--out-dir`) do **not** trigger rebuilds, preventing feedback loops.

## Pipeline overview

1. **Load config** — `loadDocsConfig` from `docsfn.config.ts` / `.mjs` / `.js`.
2. **Create provider** — default CLI uses **`FsContentProvider`** rooted at the site.
3. **Build manifest** — `buildManifest(provider, config)` resolves pages, meta, navigation, routes.
4. **Build search index** — `buildSearchIndex(manifest, { search, auth })` when enabled.
5. **Collect diagnostics** — config, content, compat, and search stages surface structured issues.
6. **Write artifacts** — on `build` / `dev` only.

For day-to-day authoring, run **`docsfn dev`** in one terminal and your framework dev server in another so JSON artifacts stay fresh.

See also: [Search](./search), [Content providers](./content-providers).

## Output ownership and failure recovery

Build/dev record ownership in `.docsfn-build-outputs.json`; `docsfn llms` uses
`.docsfn-llms-outputs.json`. Records identify generated files by content hash and
filesystem identity. Legacy LLM hash-only records remain readable, with their
older hash-only identity guarantees until successful regeneration.

Files are staged completely, journaled, then renamed into place. Publication is
atomic per file, not across the output set. A failed publication attempts to
remove all still-owned outputs; cleanup failures are reported. The next invocation
can recover staged files recorded by an interrupted publication.

Removal preserves edited outputs, manual replacements and older files without an
ownership record, and reports preserved artifact names. Inspect these warnings:
unmanaged files can remain stale. Successful generation can replace regular files
at the requested output names and establishes ownership for subsequent cleanup.
Artifact and marker symlinks are rejected. The chosen directory must be trusted;
this does not protect against concurrent filesystem replacement. A crash before
the journal is written may leave an unrecorded temporary file.

## Config loading

Config import graphs are compiled into a temporary directory, so deployment
source directories can be read-only. Static local imports and literal dynamic
imports are staged together. Package-local aliases and package self references
resolve using Node's import/require conditions; their package manifest is tracked
as a config dependency. Only missing paths permit discovery to continue; access
errors fail loading instead of silently selecting default configuration.

The temporary graph is removed after the config export resolves, including on
failure. Configuration is trusted executable JavaScript, not a sandbox. Computed
runtime imports are not dependency-tracked; ordinary external packages retain
Node's cache behavior. CommonJS staging cache entries are evicted, but Node's ESM
module cache cannot be unloaded: repeated reloads can retain memory in a long-lived
watch process. Graph limits bound each load, not lifetime process memory.
