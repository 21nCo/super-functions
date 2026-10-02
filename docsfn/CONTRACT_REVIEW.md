# PR #133: config, artifact and HTML trust contracts

This focused review replaces isolated comment fixes with explicit invariants for
three connected surfaces. It does not certify the entire DocsFn port or linked
issue completeness. Hosted CI, security analysis and remaining PR findings are
separate merge gates.

| Surface | Required contract | Gap addressed | Regression evidence |
| --- | --- | --- | --- |
| Config discovery | An unreadable config must not silently select defaults | Discovery swallowed access errors | Inaccessible-directory fixture rejects loading |
| Config imports | Preserve live exports and native module context; refresh in a new host | Custom graph compilation owned partial module semantics | Fresh-host ESM/CJS/JSON/TS edits; live function/class identity; actual native startup flags |
| Config lifecycle | Read-only source trees; evaluate one factory per host; restart the whole consumer | Same-process ESM cache could not be unloaded safely | Read-only fixture; concurrent factory identity; fresh CLI worker per build and worker shutdown |
| Artifact publication | Never expose a partially written individual output | Direct writes could truncate files or follow symlinks | Injected second-rename failure; artifact and marker symlink sentinels |
| Artifact ownership | Cleanup removes generated files only when identity still matches | Hash-only ownership could claim an identical manual file before replacement | Identical manual-file failure fixture; malformed journal refusal |
| Artifact recovery | Failed runs invalidate owned outputs and recover recorded staging | Old/new outputs could survive a partial publication without usable ownership | Child process exits after first rename; next invocation removes both generations and recorded temporary files |
| HTML trust | Missing or changed identity cannot silently gain allowlist trust | Synthetic source identity and whitespace trimming broadened trust | Missing identity, whitespace and case-sensitive tests; React trust-boundary suite |
| HTML allowlist cost | Adversarial paths must not cause regex backtracking | Glob translation used a dynamic regular expression | Bounded dynamic-programming matcher; pathological wildcard fixture denies trust |

## Design and boundaries

Config modules remain trusted executable code. Jiti loads modules in their original source context; the maintained loader handles TypeScript and legacy JSON syntax. Config factories are evaluated once per host and their live values stay with the consuming pipeline. Direct API hosts restart after dependency changes or evaluation failures. CLI dev starts a fresh whole-pipeline worker for each build, watches declared directory boundaries before loading, and sends only diagnostics and watch paths across IPC. No custom graph compiler, rewritten source staging, resolver subprocess, or Node cache eviction remains.

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

## Follow-up review corrections

Module-relative ESM and CommonJS resolver APIs use the original source context. Native startup conditions, symlink flags and environment options apply without custom flag parsing. File-URL query and fragment identities are supported. Native `import.meta.dirname`/`filename` are available in Node 20.11+, 21.2+, and later majors; portable older-Node configs can derive them from `import.meta.url`. Bootstrap watches cover package scope manifests without parsing them first, so CLI dev can recover after malformed JSON is repaired.

Cleanup before any generation is non-creating when no ownership record exists.
The reported missing-source HTML bypass was invalid: `isUnsafeHtmlAllowed` returns
false, and `assertCompiledContentTrusted` then scans the content and rejects unsafe
HTML. Existing missing-identity and React trust tests verify that behavior.

Additional corrections reject repeated separators in configured route bases,
escape LLM index link labels/destinations, collect required renderer names through
the full block tree, and preserve editable-control keyboard shortcuts in both UI
adapters while preventing browser history navigation for handled shortcuts.

Config identity now follows native real paths by default, including symlinked
entry configs and graph dependencies; `--preserve-symlinks` preserves lexical
identity. The optional `import.meta.resolve` parent is honored when Node's
`--experimental-import-meta-resolve` feature is enabled. Hashbangs and directive prologues preserve CommonJS strict mode. A native-loader
regression exercises quoted and newline-containing filesystem paths: the maintained loader handles the filesystem paths directly.
The corresponding CodeQL sanitization findings were assessed against those exact
scalar/array inputs; this does not expand the trust boundary for executable config.

RSS and dated JSON feeds now accept the same auth/classifier policy as other public
artifacts; callers must supply it because manifests do not contain that policy.
Mixed mode without a classifier fails closed. Additional coverage includes OpenAPI
3.2 QUERY operations, changing embedded mode in persistent Svelte shells, and
intersection of explicit React search scopes with the loaded artifact.

## 2026-09-30 bounded reset assessment (superseded loader proposal)

The initial local proposal claimed support for Node-equivalent flag spellings and early rejection of computed imports. Those claims were not established by the production loader at that point. The subsequent maintained-loader investigation superseded that proposal; historical acceptance receipts above describe their original staged-loader implementation, not the current implementation.

## 2026-10-02 approved restart contract

The author approved retaining live config values and using host restart as the reload boundary. Core now uses Jiti 2.7.0, evaluates a config factory once per host process, and retains both successful snapshots and failed evaluations. Direct API consumers must restart their host after config dependency changes or repairs. Native source identity, conditional resolution, file-URL variants, and computed imports replace the staged graph's restrictions.

CLI dev owns the full pipeline in a fresh child for every build. It starts broad bootstrap watches before the first load, keeps them active after failures, and supports declared external dependency roots with repeatable `--watch-root`. Only diagnostic reports and watch directories cross IPC; live config values stay with their consumer. Content watches survive output ancestors, while exact publisher-owned output names and temporary files are ignored at both requested and physical output paths.

Public RSS filters protected candidates before ordered or fallback metadata validation. Search override scopes must be enabled even for disabled search, so configuration typos cannot silently erase documents. These earlier local corrections remain in scope for verification.

This is a coordinated config/watch remediation, not a certification of all remaining hosted review findings. Current validation receipts and unresolved boundaries are recorded in `.conduct/pr-133-remediation-ledger.md`; historical receipts above must not be read as checks on the current change.
