# PR #133: config, artifact and HTML trust contracts

This focused review replaces isolated comment fixes with explicit invariants for
three connected surfaces. It does not certify the entire DocsFn port or linked
issue completeness. Hosted CI, security analysis and remaining PR findings are
separate merge gates.

| Surface | Required contract | Gap addressed | Regression evidence |
| --- | --- | --- | --- |
| Config discovery | An unreadable config must not silently select defaults | Discovery swallowed access errors | Inaccessible-directory fixture rejects loading |
| Config imports | Reload local dependencies while preserving package resolution context | Temporary staging lost package-local aliases and self references | ESM alias/self-reference edits refresh; CJS selects its require condition |
| Config lifecycle | Read-only source trees; dispose staging on success and rejection | Failure cleanup and cache lifetime needed explicit boundaries | Read-only graph fixture; rejected async export leaves no temporary graph |
| Artifact publication | Never expose a partially written individual output | Direct writes could truncate files or follow symlinks | Injected second-rename failure; artifact and marker symlink sentinels |
| Artifact ownership | Cleanup removes generated files only when identity still matches | Hash-only ownership could claim an identical manual file before replacement | Identical manual-file failure fixture; malformed journal refusal |
| Artifact recovery | Failed runs invalidate owned outputs and recover recorded staging | Old/new outputs could survive a partial publication without usable ownership | Child process exits after first rename; next invocation removes both generations and recorded temporary files |
| HTML trust | Missing or changed identity cannot silently gain allowlist trust | Synthetic source identity and whitespace trimming broadened trust | Missing identity, whitespace and case-sensitive tests; React trust-boundary suite |
| HTML allowlist cost | Adversarial paths must not cause regex backtracking | Glob translation used a dynamic regular expression | Bounded dynamic-programming matcher; pathological wildcard fixture denies trust |

## Design and boundaries

Config modules remain trusted executable code. Native resolution is used for
package-local aliases and self references; ESM resolution runs a bounded Node
resolver subprocess without executing the config there. Local resolved files join
the same staged graph. Literal imports are tracked; computed imports and ordinary
external package cache invalidation are outside this guarantee. Temporary files
are removed and staging CommonJS cache entries evicted, but ESM cache retention
remains a long-lived watcher memory limitation. Per-load graph limits do not bound
lifetime memory. Worker isolation would be a separate architectural change.

Build/dev and LLM outputs share one internal publisher. Callers supply their
complete output namespace, with `undefined` requesting removal. The journal stores
hash plus device/inode for old owned and newly staged files before rename. It
permits recovery after a partial publication while preserving identical manual
files that were never replaced. Legacy hash-only LLM records are accepted for
migration and retain weaker identity guarantees until regeneration.

Atomic rename protects each file; concurrent readers can still observe a mixed
multi-file generation. The selected directory is trusted, not hardened against
adversarial filesystem races. A crash before journaling can leave an unrecorded
temporary file. Disk durability across power loss is not guaranteed by this design.
Unmanaged outputs are preserved with warnings and may be stale. Successful explicit
generation may overwrite regular destination files. Native Windows behavior is
not certified by the macOS test run; privilege-dependent tests report a skip.

HTML policy matching is a structural trust decision over host-provided identity,
not proof of provenance. Missing identity denies allowlist trust; explicit global
unsafe-HTML opt-in remains supported. Wildcard matching is bounded and fails closed
when its work budget is exceeded. This review does not claim a comprehensive HTML
sanitizer audit.

## Validation

The validation record accompanies the commit in the PR comment: complete core
suite and build, CLI build/integration/failure tests, focused React trust tests,
and config/security tests on Node 20. Hosted checks must rerun on the pushed head;
local success is not evidence that Sonar or the full release gate has passed.
