# Provider Throttle Incident Runbook

## Purpose

Handle sustained provider throttling (HTTP 429 or provider-equivalent quota failures) without violating fairness or causing cascading retries.

## Trigger Conditions

- `PROVIDER_RATE_LIMITED` spikes for any adapter.
- `Retry-After` delays exceed configured SLO budget.
- Tenant starvation observed in send/sync queues.

## Detection

1. Inspect per-provider and per-tenant throttle-hit metrics.
2. Validate queue depth by provider and tenant.
3. Confirm retry scheduler behavior respects `Retry-After` headers.
4. Identify top noisy tenants/domains.

## Immediate Containment (0-15 minutes)

1. Enforce strict max-attempt retry caps.
2. Enable stronger per-tenant fairness limits for affected providers.
3. Pause non-critical sync jobs if they compete with critical flows.
4. Avoid global retry storms by applying jitter and queue backpressure.

## Mitigation (15-60 minutes)

1. Reduce page sizes and poll frequency to provider-safe levels.
2. Rebalance worker concurrency per provider.
3. Segment high-volume tenants into dedicated queues when possible.
4. Verify policy registry does not allow blocked high-cost operations.

## Rollback And Recovery

1. Roll back recent rate-limit config changes if regression is confirmed.
2. Replay deferred jobs in controlled batches.
3. Verify no job exceeds idempotency semantics during replay.
4. Confirm throttle-hit trend returns to baseline for two full windows.

## Communication

- Internal update template:
  - Affected providers and regions.
  - Throughput reduction and tenant impact.
  - Current caps/backoff strategy and ETA.
- Customer messaging:
  - State delayed processing window and no-data-loss posture.
  - Provide expected reprocessing timeline.

## Post-Incident

1. Publish top throttling contributors and fairness outcomes.
2. Add regression tests for observed failure mode.
3. Update provider policy defaults if needed.
4. Attach mitigation evidence to release artifacts.

## Simulation Checklist

- Scenario: Gmail and Outlook both return sustained 429 with variable `Retry-After`.
- Expected actions: fairness enforcement, backpressure, queue stabilization.
- Validation: no infinite retries, no cross-tenant starvation, bounded recovery time.
