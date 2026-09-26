---
title: Webhooks
description: Verify provider events before processing them.
---

# Webhooks

Mount the PlugFn webhook routes under the application's integration path, including `POST /webhooks/:provider` and `POST /webhooks/:provider/:event`. Configure provider-specific signing secrets and route policies before accepting public traffic. Verification must happen before a payload changes connection, workflow, or sync state.

Webhook receipts and delivery attempts are administrative surfaces. Operate with replay controls and incident procedures from the [webhook security runbook](https://github.com/21nCo/super-functions/blob/dev/plugfn/docs/runbooks/webhook-security-incident.md). For provider-specific behavior, consult the [provider docs](https://github.com/21nCo/super-functions/tree/dev/plugfn/docs/providers).
