---
title: SES webhooks
description: Verify SNS messages before changing delivery state.
---

Configure `awsSns.topicArns` with every SNS topic allowed to deliver SES lifecycle events. The built-in route and handler are unavailable with an empty allowlist. Mount `/webhooks/aws-ses` only after setting the allowlist.

Pass the complete SNS notification JSON to `client.getWebhookHandlers().awsSes.handleSnsNotification`. Preserve signature fields and the original envelope; reshaping it before verification can break validation. Signature verification must complete before bounce or complaint data changes state.

See [AWS SES webhooks in the TypeScript guide](/docs/reference/typescript#aws-ses-webhooks) for setup and a handler example.
