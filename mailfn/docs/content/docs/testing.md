---
title: Testing with inbox fixtures
description: Use expiring fixtures, deterministic waits, and scoped cleanup.
---

`@mailfn/testing` provides expiring inbox fixtures, lifecycle hooks, OTP/link waits, and deterministic assertions. A fixture can supply a fresh address to the product workflow, wait with sender/subject/time filters, assert the result, and clean up safely even when called more than once.

```ts
import { withInboxFixture, waitForOtp } from "@mailfn/testing";

await withInboxFixture(client, { testRunId: crypto.randomUUID() }, async ({ inbox }) => {
  const after = new Date(Date.now() - 1).toISOString(); // Strict receivedAfter boundary.
  // Trigger your product workflow with inbox.address.
  const code = await waitForOtp(client, inbox.id, {
    senderDomain: "example.com",
    subject: "Verify",
    after,
    timeoutMs: 30_000,
  });
  expect(code.sourceMessageId).toBeTruthy();
});
```

`waitForOtp` and `waitForVerificationLink` throw `MailFnAssertionError` on timeout or missing verification data. Use `client.waitForMessages` when you need to inspect a timeout result instead; cancellation still rejects. Assertions can cover sender, recipient, subject, content, headers, attachment metadata, sizes, and hashes. The [testing package guide](/docs/reference/testing) has the exact API.
