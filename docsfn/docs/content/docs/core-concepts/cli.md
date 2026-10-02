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

1. Starts watching project/config roots before the first build, so local import failures can recover.
2. Runs the complete pipeline and artifact publication in a fresh child process for every build. Config functions and class instances stay in that child.
3. Keeps watching after errors, prints diagnostics, and invalidates publisher-owned stale successful artifacts.
4. Queues and debounces changes, including changes received during an active build; builds run one at a time.
5. Refreshes content watch directories after a successful config load and checks bootstrap roots after every build.

**Additional dependency roots:** repeat `--watch-root <dir>` for config dependencies outside the project/config/content directories:

```sh
docsfn dev . --watch-root ../shared-settings --watch-root ../shared-content
```

Relative roots resolve from the docs project. Ordinary `node_modules`, `.git`, `.next`, `.svelte-kit`, and `.turbo` directories are ignored; an explicit watch root opts into these directories. Bootstrap watches include real paths of symlinked roots and the nearest package scope manifest.

**Generated outputs:** only the build publisher's files, ownership journal, and staging files at the selected output directory are ignored. Content under an output ancestor remains watched, including when `--out-dir .` is used.

Stop dev with Ctrl+C; it closes the watcher and terminates any active build child.

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

Config is trusted executable code. Jiti loads TypeScript and JavaScript modules without staging a rewritten dependency graph. Read-only source trees, CommonJS dependencies, package-local aliases, self references, and async export factories are supported. Module-relative `import.meta` and CommonJS resolver APIs use source paths; native startup conditions and symlink flags apply. File-URL query and fragment identities remain distinct.

`loadDocsConfig` evaluates a config once per host process. Repeated calls use that snapshot, including cached evaluation failures. CLI dev obtains fresh transitive ESM, CommonJS, JSON, and TypeScript dependencies by starting a new **whole-pipeline** process on every rebuild; it sends only diagnostics and watch paths back to the watcher. Direct API consumers, including Next.js and SvelteKit loaders, must restart their host after config/dependency edits or repairs.

Watch roots are a declared directory boundary, not an exhaustive import graph. Declare external dependencies with `--watch-root`, including dependencies loaded through computed imports or filesystem reads. `getDocsConfigWatchRoots` supplies bootstrap roots without evaluating the config. The deprecated `getDocsConfigDependencies` returns bootstrap files/directories and no longer enumerates transitive dependencies.

Only missing paths permit config discovery to continue; access errors fail loading. First-run failure cleanup creates no output directory or marker when no ownership record exists.
