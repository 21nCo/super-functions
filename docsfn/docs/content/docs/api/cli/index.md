---
title: "@docsfn/cli"
description: docsfn command-line interface reference.
---

# @docsfn/cli

Binary: **`docsfn`** (package **`@docsfn/cli`**).

## Global options pattern

Commands accept an optional positional **`[root]`** (defaults to `.`) plus flags below.

## `docsfn validate [root]`

Validates config + content pipeline **without** writing artifacts.

| Flag | Description |
| --- | --- |
| **`--root <dir>`** | Working directory containing config. |
| **`--config <path>`** | Explicit config file. |

**Exit code:** `0` when no **error** diagnostics; `1` otherwise.

**Output:** Colored diagnostics + summary counts.

## `docsfn build [root]`

Runs pipeline and writes **`.docsfn/`** (or **`--out-dir`**).

| Flag | Description |
| --- | --- |
| **`--root`** / **`--config`** | Same as validate. |
| **`--out <dir>`** | Legacy alias for output directory. |
| **`--out-dir <dir>`** | Output directory (default **`.docsfn`**). |

**Artifacts:** `manifest.json`, `search.json` (when enabled), `diagnostics.json`, `compat-report.json`.

**Exit code:** `0` on success without errors; `1` on errors.

**Console:** Prints timing + search artifact byte size when applicable.

## `docsfn dev [root]`

Initial build + **chokidar** watch on project/config and content directories. Only publisher-owned output files and staging files are excluded; content inside an output ancestor remains watched. Every build runs in a fresh worker.

| Flag | Description |
| --- | --- |
| **`--root`** / **`--config`** / **`--out-dir`** / **`--out`** | Same semantics as `build`. |
| **`--watch-root <dir>`** | Repeatable dev-only root for external or computed config dependencies. |

Build errors keep the watcher alive for recovery. On shutdown, the exit code reflects the latest build diagnostics (`1` for errors, `0` for success).

**Behavior:** Queued rebuilds on change; prints `dev:rebuild` summaries.

## Pipeline internals (summary)

`loadDocsConfig` → **`FsContentProvider`** → **`buildManifest`** → **`buildSearchIndex`** → collect diagnostics → **`writeArtifacts`** (build/dev only).
