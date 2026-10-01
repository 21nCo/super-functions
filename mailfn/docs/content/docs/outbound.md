---
title: Outbound through SendFn
description: Compose drafts, replies, and forwards with a delivery adapter.
---

`@mailfn/sendfn` adapts an existing SendFn service to MailFn outbound contracts. It prefers modern `sendEmail` and supports the legacy `email` method. MailFn does not embed delivery provider implementations.

```ts
import { createSendFnAdapter } from "@mailfn/sendfn";

const sendAdapter = createSendFnAdapter(sendfn);
```

The adapter passes a stable draft idempotency key, reply `In-Reply-To` and `References`, attachment IDs, MailFn project/inbox metadata, and the logical sender address. The underlying SendFn implementation must honor idempotency keys. Public-platform outbound is gated by production-security approval, domain verification, scope, and daily quotas. See [SendFn adapter reference](/docs/reference/sendfn) and [operations](/docs/reference/operations).
