# Webhook Security Incident Runbook

## Purpose

Contain and remediate webhook signature verification failures, forged webhook attempts, or duplicate event abuse.

## Trigger Conditions

- `WEBHOOK_SECRET_NOT_FOUND` or `WEBHOOK_SIGNATURE_INVALID` increases beyond baseline.
- Unexpected provider/event path combinations or malformed signature headers.
- Duplicate event IDs outside expected replay window.

## Detection

1. Review webhook verification logs by provider, route, and secret lookup result.
2. Validate route-to-event mapping against declared provider trigger registry.
3. Check dedupe store for abnormal event ID replay patterns.
4. Confirm provider secret rotation history and deployment timing.

## Immediate Containment (0-15 minutes)

1. Keep fail-closed behavior enabled for all signature-validated providers.
2. Temporarily disable affected webhook routes if exploit risk is high.
3. Rotate compromised or missing webhook secrets immediately.
4. Restrict source traffic using provider IP guidance where available.

## Mitigation (15-60 minutes)

1. Reconcile webhook secret config across environments.
2. Re-validate signature algorithm and header normalization logic.
3. Confirm event ID dedupe persistence is healthy.
4. Re-enable routes gradually with focused monitoring.

## Rollback And Recovery

1. Roll back webhook verification changes if a regression is confirmed.
2. Reprocess trusted provider events from durable provider APIs if needed.
3. Verify every resumed webhook path maps to the expected internal event.
4. Confirm no unsigned or invalid signature payloads were processed.

## Communication

- Internal update template:
  - Attack signal or config regression summary.
  - Affected providers/events/routes.
  - Containment state and secret rotation status.
- External communication:
  - Notify users only if event processing delays or integrity concerns impact them.

## Post-Incident

1. Produce an incident timeline with verification/failure samples.
2. Add regression tests for discovered bypass vectors.
3. Document secret rotation cadence and ownership updates.
4. Link this runbook and incident notes in release records.

## Simulation Checklist

- Scenario: provider sends invalid signatures after secret rotation drift.
- Expected actions: fail-closed, secret reconciliation, safe replay.
- Validation: only valid signatures accepted; duplicate/forged events rejected.
