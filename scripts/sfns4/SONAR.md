# SFNS-4 Sonar triage

Input analysis snapshot: PR 179 at `896545d34ab1f11d0db8e30860d503f5e03bcab4`.
The remediation described below was committed separately as `cfd1a7a24e142e80b1894d859c2c4be28988b4dc`; these were distinct commits, not amendments.
This record distinguishes code changes, contextual false positives, and the applied analysis setting. No quality thresholds are weakened.

## Code changes

- CI invokes the locally installed Turbo and Playwright binaries after `npm ci`, preventing `npx` from installing an unexpected package if a dependency is absent. The lockfile remains authoritative. This fixes S6505/S8543 (`AaCfxCXRuJ9aukROuO0m`, `AaCfxCXRuJ9aukROuO0n`) across all sibling commands.
- OneDrive OData quote escaping and SecFn UUID formatting use literal `replaceAll`, preserving the old global replacement behavior (S7781: `AaCcCMlIuOjzGCLqXYmF`, `AaCcCMZ2uOjzGCLqXYli`).
- Shared resource templates remove repeated handwritten declarations. Every action receives a distinct array and distinct hint objects. A one-time compatibility fingerprint was captured before extraction from the reviewed head; the serialized manifest, ordering, and contract version remain unchanged.

## Contextual false positives

All ten issue status changes to false positive were confirmed by the Sonar MCP.
These are individual issue dispositions, not rule exclusions. Reassess if the input domain or call contract changes.

| Rule / issues | Evidence |
| --- | --- |
| S7758: `AaCcCMiuuOjzGCLqXYl5`, `AaCcCMiuuOjzGCLqXYl9` | Google upload decodes `atob` to bytes; download encodes a `Uint8Array`. Values are 0–255, so surrogate-pair handling does not apply. Drive wire tests cover every byte value and the 8192-byte chunk boundary. |
| S7758: `AaCcCMlIuOjzGCLqXYmG`, `AaCcCMlIuOjzGCLqXYmH` | OneDrive download converts `Uint8Array` bytes into a binary string for `btoa`; upload converts the binary string from `atob` into bytes. Neither operates on Unicode text. Existing wire tests verify binary payloads and capability requests. |
| S7758: `AaCcCMjsuOjzGCLqXYmC` | Slack upload converts only the binary string returned by `atob`. Wire tests verify exact 0/255 bytes and credential omission. |
| S7758: `AaCcCMuhuOjzGCLqXYnZ`, `AaCcCMuhuOjzGCLqXYnf` | SendFn decodes explicitly base64-encoded attachment strings and encodes typed bytes. Actual text uses `TextEncoder`. The attachment test round-trips all byte values across the chunk boundary. |
| S7737: `AaCcCMqquOjzGCLqXYmh` | `Tool.run` accepts a complete `ToolContext`, whose metadata and policy are both required. An omitted context creates fresh metadata and policy per invocation. Partial contexts are not the API; merging defaults into caller-supplied policy would change the contract. |
| S1313: `AaCcCMq0uOjzGCLqXYmk` | `169.254.169.254` is an SSRF denylist entry, not a configured destination. `isBlockedIp` rejects it; the tool policy test verifies denial of its metadata URL. |
| S2245: `AaCcCMs7uOjzGCLqXYm_` | `Math.random` only varies retry sleep duration by a factor of 0.8–1.2. No token, identifier, key, nonce or authorization decision depends on it. Trace identifiers separately require Web Crypto. |

## Generated discovery duplication: applied and verified

Five checked-in TypeScript files are generated Google Discovery snapshots, with source URL, source digest, revision and generator provenance. Repeated schema data is not repeated handwritten behavior. Keep security and reliability analysis enabled for them.

In SonarCloud **Administration → General Settings → Analysis scope → Duplication → Duplication Exclusions**, `sonar.cpd.exclusions` now contains these five separate values (previously empty):

```text
plugfn/providers/src/google/discovery/calendar.ts
plugfn/providers/src/google/discovery/docs.ts
plugfn/providers/src/google/discovery/drive.ts
plugfn/providers/src/google/discovery/gmail.ts
plugfn/providers/src/google/discovery/sheets.ts
```

Do not exclude the directory globally, handwritten provider code, tests, or security analysis. See [SonarSource duplication exclusion documentation](https://docs.sonarsource.com/sonarqube-cloud/managing-your-projects/project-analysis/setting-analysis-scope/exclude-from-coverage-duplication).

The setting was saved through the signed-in personal Aside profile and verified by reloading on September 14, 2026. Automatic analysis remains on. No security exclusions or quality thresholds changed. At `cfd1a7a`, before the exclusions were analyzed, the result was 10.3% duplication with security, reliability and maintainability all A and zero open security/reliability findings.

## Recorded verification for the cfd1a7a remediation

Provider suite: 476 tests; connected mailbox: 4 tests; LangFn tool/policy: 4 tests; SecFn core: 9 tests. Provider and SecFn core typechecks pass. The original one-time manifest fingerprint comparison passed. The ongoing regression check retains independent mutable objects without coupling every future catalog addition to an opaque digest. At the original `896545d` input snapshot, security and duplication failed while reliability was A. The later `cfd1a7a` result is recorded above. At `de37986be127f912a4cbd3762d259f11a451e3ac`, Sonar passed with 0.3% duplication (GitHub check completed September 14, 2026 at 17:38:33 UTC). These are three separate analyses.

The packed consumer gate passed for 38 packages, including Svelte SSR, hydration and keyboard interaction. Artifact-set SHA-256: `295b0ed7b643f14d597cc6d18daecb235327efcfd9756694df6443e870a8023c`.
