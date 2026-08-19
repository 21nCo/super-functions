# PlugFn Inbound Mail Provider Policy Matrix

## Purpose

This document defines PlugFn policy for connecting external email accounts and ingesting inbound messages. PlugFn does not provide managed mailboxes, host forwarding ingress, or deliver outbound email.

## Ownership boundary

- PlugFn: provider authentication, external-account connection state, inbound sync, watches/subscriptions, checkpoints, and normalization.
- MailFn: programmable or managed inboxes, platform-owned forwarding addresses and ingress health, mailbox lifecycle, and mailbox security policy.
- SendFn: outbound transports, queues, retries, idempotency, suppression, quotas, and abuse controls.
- Product code: finance or other domain-specific message parsing and workflows.

Configuring forwarding rules on a connected external provider can remain a PlugFn provider operation. Receiving mail at a platform-owned forwarding endpoint is MailFn scope.

## Policy registry fields

Each inbound provider entry carries:

1. `providerId`: stable provider key.
2. `version`: policy schema version.
3. `status`: `enabled`, `restricted`, or `blocked`.
4. `authModes`: supported authentication pathways.
5. `requiredCapabilities`: capabilities required before activation.
6. `scopeProfiles`: least-privilege scopes keyed by inbound feature.
7. `ingestModes`: `api` or `imap`.
8. `checkpointMode`: incremental cursor and invalidation handling.
9. `pushMode`: watch, subscription, IDLE, or polling behavior.
10. `restrictedOperations`: blocked inbound operations.
11. `setupPrerequisites`: account or tenant requirements.
12. `complianceFlags`: provider-review and restricted-scope markers.
13. `auditTags`: labels emitted with connection and sync decisions.

## Default states

| providerId | status | authModes | ingestModes | checkpointMode | pushMode | restrictedOperations | complianceFlags |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `gmail` | `enabled` | `oauth2` | `api` | Gmail history ID with rebaseline on invalid history | watch with renewal | broad/full-mailbox scope outside approved profiles | `restricted-scope-aware=true` |
| `outlook` | `enabled` | `oauth2` | `api` | Graph delta token with rebaseline on invalid token | Graph subscription with renewal | app-only or unsupported permissions for a user connector | `graph-throttle-aware=true` |
| `yahoo` | `restricted` | `oauth2-imap` | `imap` | IMAP UID with UID-validity guard | polling by default | scopes outside approved inbound profiles | `approval-gated=true` |
| `icloud` | `enabled` | `app-password-imap` | `imap` | IMAP UID with UID-validity guard | polling by default | POP and insecure authentication | `app-password-required=true` |
| `imap-smtp` | `restricted` | `basic`, `oauth2` | `imap` | IMAP UID with UID-validity guard | provider-dependent IDLE or polling | insecure transport without explicit override | `tls-default-on=true` |

The `imap-smtp` provider ID is retained for compatibility, but its PlugFn contract is inbound IMAP only.

## Feature-to-scope profiles

Reserved inbound feature keys are:

1. `mail.read.metadata`
2. `mail.read.body`
3. `mail.sync.push`
4. `mail.account.profile`

Any requested scope outside the declared profile for a feature must return `OAUTH_SCOPE_DISALLOWED`.

## Registry update controls

1. Policy updates must be authenticated admin operations.
2. Every policy decision and version change must emit an audit event with provider ID, version, and decision.
3. Runtime adapters must consult policy before connection or synchronization operations.
4. Outbound operations must not be introduced into this registry; consumers compose with SendFn instead.
