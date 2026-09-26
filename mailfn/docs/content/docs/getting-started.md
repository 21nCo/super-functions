---
title: Getting started
description: Create a scoped inbox, wait for mail, and extract a verification value.
---

# Getting started

The `mailfn` facade exports `MailFnClient` and public core types. Point the client at a deployed MailFn `/v1` API using a token with the needed project scope. Creating an inbox returns its address and a one-time scoped credential; use that credential for subsequent inbox access.

```ts
import { MailFnClient } from "mailfn";

const admin = new MailFnClient({
  baseUrl: process.env.MAILFN_URL!,
  token: process.env.MAILFN_TOKEN!,
});

const { inbox, credential } = await admin.createInbox({
  kind: "expiring",
  expirySeconds: 3600,
  idempotencyKey: `signup:${crypto.randomUUID()}`,
});

const scoped = new MailFnClient({
  baseUrl: process.env.MAILFN_URL!,
  token: credential.token,
});

const result = await scoped.waitForMessages(inbox.id, {
  senderDomain: "example.com",
  subject: "Verify",
  after: new Date().toISOString(),
  timeoutMs: 30_000,
});
```

`waitForMessages` returns a normal `{ status: "timeout", retryable: true }` result on timeout. Cancellation uses `AbortSignal`. Filter by sender, subject, time, and expected count when multiple messages may arrive. On a matched result, call `extractVerification` explicitly to retrieve an OTP or link. The [client guide](/docs/reference/client) lists the rest of the API.
