---
title: Operations and limits
description: Release gate, retention, production flags, and live-service proof.
---

# Operations and limits

The MailFn release gate builds, tests, packs, installs, and imports every public package. It runs the Cloudflare adapter in workerd with local D1/R2, Email and Queue handlers, durable webhook replay, and concurrent quota checks, and typechecks Router-shaped and framework-neutral consumers from packed tarballs. Run `npm run gate:mailfn-release` from the repository root for this qualification.

Provision D1, R2, Queues, Email Routing, secrets, migrations, and region settings before deploying. Queue failures require reconciliation; scheduled retention must run; webhook DNS targets must be direct public origins. Public-platform, billing, support, future protocol compatibility, and production-security approval are distinct gates. Outbound stays denied in public-platform mode without explicit production-security approval.

The local gate does not prove live Cloudflare DNS or Email Routing, public production security, package publication, or an operated service. Review the [operations guide](/docs/reference/operations), [threat model](/docs/reference/threat-model), and [specification](/docs/reference/spec) for the full contract.
