# OAuth Incident Runbook

## Purpose

Respond to OAuth outages or security failures affecting `plugfn` connection flows and `authfn` social sign-in flows that reuse shared OAuth packages.

## Trigger Conditions

- Spike in `OAUTH_STATE_INVALID`, `OAUTH_STATE_REPLAYED`, `OAUTH_CALLBACK_MISMATCH`, or `OAUTH_TOKEN_EXCHANGE_FAILED`.
- Connection create/refresh success rate drops below release SLO.
- Provider callback traffic rises but completed connections fall.

## Detection

1. Check application logs for OAuth error codes grouped by provider.
2. Check callback latency and token exchange failure-rate dashboards.
3. Confirm shared package versions in deployment (`@superfunctions/oauth-core`, `@superfunctions/oauth-http`, `@superfunctions/oauth-storage`).
4. Verify provider auth app status pages (Google, Microsoft, Yahoo, Apple, GitHub) for incidents.

## Immediate Containment (0-15 minutes)

1. Freeze rollout of new OAuth-related releases.
2. Keep state consume semantics strict; do not disable replay protections.
3. If one provider is degraded, disable new connect attempts for that provider via policy gate and keep existing connections intact.
4. Escalate security on-call immediately if callback mismatch patterns suggest abuse.

## Mitigation (15-60 minutes)

1. Validate redirect URI allowlists and provider IDs in runtime config.
2. Verify OAuth state TTL and cleanup jobs are healthy.
3. Confirm token endpoint auth method and content-type serialization for the affected provider.
4. Retry failed token exchanges only through bounded retry policy.
5. For provider-side failure, switch UX to degraded mode and instruct users to retry later.

## Rollback And Recovery

1. Roll back to the last release where matrix gate passed:
   - `turbo run build test --filter=@superfunctions/oauth-core --filter=@superfunctions/oauth-http --filter=@superfunctions/oauth-storage --filter=@superfunctions/oauth-providers --filter=plugfn --filter=@authfn/core`
2. Re-run OAuth integration tests for affected providers.
3. Validate new connection creation, callback completion, refresh, and disconnect-revoke paths.
4. Resume rollout only after all checks pass for at least one full callback TTL window.

## Communication

- Internal update template:
  - Impact: affected providers, affected tenants/users, user-visible symptoms.
  - Scope: new connections only vs existing refresh impact.
  - Mitigation status: containment active, rollback state, ETA.
  - Next update: every 30 minutes until stable.
- External user note should include provider-specific impact and safe retry guidance.

## Post-Incident

1. Attach timeline, root cause, and corrective actions.
2. Add regression test if issue was code-induced.
3. Record policy/config updates and key decisions in release artifacts.
4. Link incident ID in the next release gate evidence.

## Simulation Checklist

- Scenario: token exchange endpoint returns elevated 400/500 for one provider.
- Expected actions: provider-specific connect gate, rollback decision, communication cadence.
- Validation: recovery confirmed by OAuth e2e tests and stable error-rate trend.
