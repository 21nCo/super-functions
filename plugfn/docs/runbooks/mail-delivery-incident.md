# Mail Delivery Incident Runbook

## Purpose

Respond to outbound send governance failures and critical managed-mailbox delivery incidents affecting finance-related communications.

## Trigger Conditions

- Elevated `MAIL_SEND_BLOCKED` or provider delivery failures.
- Queue retries rising with no successful sends.
- Managed mailbox finance-critical incident raised by policy guardrails.

## Detection

1. Check send success rate by provider, domain, and tenant.
2. Inspect blocked send decisions and policy reasons.
3. Validate idempotency behavior for queued send jobs.
4. Review managed-mailbox incident/backup alert events.

## Immediate Containment (0-15 minutes)

1. Stop new non-critical sends for affected providers.
2. Preserve queued jobs and idempotency keys.
3. Trigger managed-mailbox backup channel alerts for critical incidents.
4. Escalate if finance-critical messages cannot be safely delivered.

## Mitigation (15-60 minutes)

1. Verify provider credentials, scopes, and policy gates.
2. Confirm per-tenant abuse limits are not over-blocking legitimate traffic.
3. Apply provider-specific routing fallback where supported.
4. For managed mailbox, ensure risk acknowledgment and backup channel state are current.

## Rollback And Recovery

1. Roll back recent send policy or transport changes if correlated.
2. Re-queue failed sends with original idempotency keys.
3. Validate replay does not duplicate already delivered messages.
4. Confirm delivery metrics return to baseline and blocked ratios normalize.

## Communication

- Internal update template:
  - Impacted channels/providers, delayed message count, criticality.
  - Backup alert status for managed mailbox tenants.
  - Recovery ETA and current mitigations.
- External communication:
  - Share delay windows and expected delivery recovery.
  - For finance-critical impact, include backup-channel follow-up guidance.

## Post-Incident

1. Capture policy decisions and queue processing timeline.
2. Add regression tests for observed failure pattern.
3. Update managed-mailbox risk documentation if new edge cases surfaced.
4. Record final incident resolution in release artifacts.

## Simulation Checklist

- Scenario: provider outage causes repeated send failures for finance notifications.
- Expected actions: queue preservation, backup-channel notification, safe replay.
- Validation: no duplicate sends, critical alerts delivered through backup channel.
