# PlugFn Provider Policy Matrix (Phase 00 Draft)

## Purpose

This document defines the initial policy registry fields and default policy states for required email providers in the spec (`gmail`, `outlook`, `yahoo`, `icloud`, `imap-smtp`) and product modes (`forwarding`, `managed-mail`).

## Policy registry fields (initial)

Each provider entry must carry these fields:

1. `providerId`: unique provider key.
2. `version`: policy schema version.
3. `status`: `enabled` | `restricted` | `blocked`.
4. `authModes`: supported auth pathways.
5. `requiredCapabilities`: capability flags required for connector activation.
6. `scopeProfiles`: allowed scope sets keyed by product feature.
7. `ingestModes`: `api`, `imap`, `forwarding`, `managed-mail`.
8. `sendModes`: allowed outbound pathways.
9. `checkpointMode`: checkpoint primitive type and invalidation handling policy.
10. `pushMode`: webhook/push support and renewal requirements.
11. `rateLimitPolicy`: throttle dimensions and retry hints.
12. `dataHandlingPolicy`: body retention and attachment handling defaults.
13. `restrictedOperations`: operations that must be blocked by default.
14. `setupPrerequisites`: required account or tenant conditions.
15. `complianceFlags`: policy markers such as restricted-scope, external-review-required.
16. `fallbackModes`: allowed fallback connectors.
17. `auditTags`: audit labels emitted on policy decisions.

## Default states (Phase 00)

| providerId | status | authModes | ingestModes | sendModes | checkpointMode | pushMode | restrictedOperations (default blocked) | fallbackModes | complianceFlags |
|---|---|---|---|---|---|---|---|---|---|
| `gmail` | `enabled` | `oauth2` | `api`, `forwarding` | `api` | `history-id` incremental + rebaseline on invalid history | watch + renewal required | broad/full-mailbox scope outside approved scopeProfiles | `forwarding` | `restricted-scope-aware=true` |
| `outlook` | `enabled` | `oauth2` | `api` | `api` | `delta-token` incremental + rebaseline on invalid token | Graph subscriptions + renewal required | app-only or unsupported permission sets for user-mode connector | none | `graph-throttle-aware=true` |
| `yahoo` | `restricted` | `oauth2-imap`, `oauth2-smtp` | `imap` | `smtp` | IMAP UID checkpoint + UID validity guards | no first-class push baseline; polling default | any non-approved or policy-disallowed OAuth profile | none | `approval-gated=true` |
| `icloud` | `enabled` | `app-password-imap`, `app-password-smtp` | `imap` | `smtp` | IMAP UID checkpoint + UID validity guards | no push baseline; polling default | POP mode, insecure auth modes | none | `app-password-required=true` |
| `imap-smtp` | `restricted` | `basic`, `oauth2` | `imap` | `smtp` | IMAP UID checkpoint + UID validity guards | provider-dependent; polling default | insecure transport unless explicit override | `forwarding` | `tls-default-on=true` |
| `forwarding` | `enabled` | `none` | `forwarding` | none | message-id dedupe checkpoint | inbound SMTP/MTA ingress only | outbound send, mandatory-only setup path | none | `inbound-only=true` |
| `managed-mail` | `restricted` | `managed-auth` | `managed-mail` | `managed-mail` | internal mailbox checkpoint model | internal event bus | finance-critical mode without risk acknowledgment and backup channel | none | `explicit-opt-in-required=true` |

## Feature-to-scope profile placeholders

These profile keys are reserved for Phase 03 implementation:

1. `mail.read.metadata`
2. `mail.read.body`
3. `mail.send`
4. `mail.sync.push`
5. `mail.account.profile`

Policy rule:

- Any requested scope outside declared profile for feature must return `OAUTH_SCOPE_DISALLOWED`.

## Default policy decisions

1. `gmail`: metadata-read profile is preferred default for initial onboarding.
2. `outlook`: least-privilege Graph permission profile is preferred default.
3. `yahoo`: remains `restricted` until approval prerequisites are explicitly satisfied.
4. `icloud`: POP configuration is always denied.
5. `imap-smtp`: insecure mode denied unless tenant-level explicit override and audit entry.
6. `forwarding`: optional fallback only; setup flows cannot force it as sole path.
7. `managed-mail`: finance-critical setup requires explicit opt-in, risk acknowledgment, and backup notification channel.

## Registry update controls

1. Policy updates must be authenticated admin operations.
2. Every policy decision and policy version change must emit audit event with `providerId`, `version`, and `decision`.
3. Runtime adapters must consult policy before connect/sync/send operations.
