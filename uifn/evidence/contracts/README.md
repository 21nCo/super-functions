# uifn governance contracts

This directory is the machine-readable governance boundary for the uifn 10/10 program. It records decisions and ownership; it does not claim that later implementation, accessibility, compatibility, performance, security, or release requirements have passed.

## Authoritative files

- `program-decisions.json`: locked product and support decisions, with a content-integrity signature tied to the originating user-confirmed specification.
- `supported-matrix.json`: target framework, runtime, browser, rendering-mode, and assistive-technology matrix.
- `ownership.json`: accountable principals, current/planned package ownership, DOM services, primitive families, release gates, accessibility surfaces, and security/performance gates.
- `defect-policy.json`: severity, response, remediation, exception, evidence-expiry, and release-blocking rules.
- `evidence.schema.json`: JSON Schema for readiness evidence.
- `ownership.schema.json`: JSON Schema for the ownership ledger.
- `baseline.json`: immutable Phase 00 snapshot of the dirty implementation under audit. Its `FAIL` verdict is intentional.
- `fixtures/`: positive and adversarial governance/evidence inputs used by `scripts/verify-uifn-governance.mjs`.

## Evidence lifecycle

Evidence is fail-closed. `blocked`, `skipped`, `not-applicable` without an approved applicability record, missing, malformed, expired, unsigned where a signature is required, or dirty release-candidate evidence never counts as a pass.

### Names

- Automated evidence: `YYYY-MM-DDTHHMMSSZ-<requirement-or-gate>-<artifact-hash-prefix>.json`.
- Human evidence: `YYYY-MM-DDTHHMMSSZ-<matrix-row>-<artifact-hash-prefix>-signed.json`.
- Phase reports: `PHASE_XX-YYYY-MM-DD-<unique-id>-report.md`.
- Superseding evidence uses a new name and links `supersedes`; existing evidence and reports are not overwritten.
- CSV logs are append-only rows. Existing rows are never reordered or rewritten except the single tracker status update permitted for a final spec phase.

### Immutability and provenance

1. Every evidence record identifies the exact source commit, dirty state, canonical definition hash when available, lockfile hash, and tested artifact hashes.
2. Evidence is immutable after it is referenced by a phase or release report. A correction creates a new record and marks the previous record superseded; it does not rewrite history.
3. Manual and independent-review records require a verifiable human signature/attestation. Automation MUST NOT create or impersonate that signature.
4. Release evidence is valid only for the exact tested artifact set. Any relevant code, dependency, generated output, test, or configuration change invalidates affected evidence even before its time expiry.
5. The decision record signature is an integrity attestation over user-confirmed decisions, not a substitute for later human accessibility or release review.

### Retention

| Evidence class | Minimum retention | Earlier invalidation |
| --- | --- | --- |
| Program decisions, phase reports, final release manifests, SBOMs, signed reviews | Project lifetime | Never deleted; supersede only |
| Manual AT and independent accessibility evidence | 5 years | Relevant implementation, artifact, script, matrix, or environment change |
| Security, dependency, license, and provenance evidence | 5 years | Dependency/artifact/policy change or shorter policy expiry |
| Automated release-pass evidence and raw semantic traces | 2 years | Relevant source/artifact/tooling change |
| Failure evidence and minimized regression cases | Until defect closure plus 2 years | Never before linked regression exists |
| Non-release development pass artifacts | 90 days | May expire sooner on source/artifact change |

Retention does not imply validity. Expired or invalidated evidence remains historical and cannot satisfy a current gate.

### Redaction

Evidence and reports MUST NOT contain credentials, tokens, secrets, typed passwords, clipboard or file contents, personal records, hostnames, usernames, home-directory paths, or absolute machine paths. Commands and paths are repository-relative. Allowed environment data is limited to sanitized OS family/architecture and product/runtime/browser/AT versions. Failure DOM and traces use deterministic synthetic fixtures and redact arbitrary user content.

## Verification

From the repository root:

```sh
node scripts/verify-uifn-governance.mjs
node --test scripts/verify-uifn-governance.test.mjs
```

The verifier validates the decision signature, ownership coverage, CODEOWNERS, severity/SLA behavior, baseline completeness, positive evidence, every required negative evidence class, and the two `OPS-001` vectors.
