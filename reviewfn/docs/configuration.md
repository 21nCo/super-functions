# Configuration

ReviewFn uses versioned JSON files at `.reviewfn/config.json` and `.reviewfn/policy.json`. Unknown adapters fail preflight. Secret values never belong in either file; `credentialEnv` names an environment variable without recording its value.

In GitHub Actions, pass `--trusted-config-from-base`. ReviewFn reads both files using `git show BASE:path`, so a pull request cannot weaken the policy controlling its own review.

The configuration selects the profile, harness, inference provider/model/auth, context adapters, approved argv test commands, outputs and retention. Commands are argv arrays and never pass through a shell. Profiles contain 1–80 letters, digits, underscores or hyphens so accepted configurations remain publishable. Optional context identities must be nonempty strings when present.

`composio-linear` requires:

- `account`: explicit Composio account alias, word ID, or connected-account ID;
- `expectedWorkspace`: expected Linear organization/team identity;
- `issue`: key such as `ENG-123`.

`repository-markdown` accepts exact repository-relative paths or `**/*.md` suffix patterns. Traversal and symlink escapes are refused.

Fallback entries are provenance only. ReviewFn never selects one automatically; an operator must explicitly rerun a compatible configuration.

Version 0.1 accepts only `advisory` output mode. Both configuration and policy validation reject `gate`; required-check behavior needs a later, separately calibrated and authorized release.

PR inference requires a trusted Docker image and action-proxy authentication with an explicit model. Local API-key and ChatGPT modes are restricted to trusted repositories. `local-isolated` names the mandatory Docker execution adapter; other adapter names fail preflight. Test commands use container paths such as `node`, not a host-specific executable path. See the security model for fixed resource bounds. `retainTranscript` is false unless explicitly enabled. Normalized events retain only bounded telemetry counters, never message, reasoning or tool-output payloads; content-bearing JSONL belongs to the separately retained opt-in transcript.

Linear comment and document connection requests share a request budget equal to the configured context source limit. Empty pages consume that budget; exhaustion records incomplete context. The prompt lists policy-authorized source IDs explicitly, excluding comments when their authority is disabled.
