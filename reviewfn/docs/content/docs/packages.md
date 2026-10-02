---
title: Packages
description: Choose the ReviewFn package for each integration layer.
---

| Package | Consumer responsibility |
| --- | --- |
| `@superfunctions/reviewfn-cli` | `reviewfn` binary for init, preflight, review, render, publish, and evaluate. |
| `@superfunctions/reviewfn-core` | Versioned contracts, identity, policy, coordinator, validation, artifacts, and rendering. |
| `@superfunctions/reviewfn-harness-codex` | Supported Codex CLI capability checks, bounded execution, and structured output normalization. |
| `@superfunctions/reviewfn-context-composio` | Explicit-account Linear issue, comment, and document context snapshots. |
| `@superfunctions/reviewfn-github` | Exact Git source snapshots and idempotent advisory GitHub publication. |
| `@superfunctions/reviewfn-testing` | Fakes, fixtures, replay metrics, and evaluation comparison checks. |

Each package is independently installable and has a separate `README.md`. The CLI depends on the other five packages. Import the lower-level packages when embedding ReviewFn in a trusted host, and preserve their identity, policy, and artifact boundaries. The [source package list](https://github.com/21nCo/super-functions/tree/dev/reviewfn) is the current implementation map.
