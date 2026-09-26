---
title: Testing with inbox fixtures
description: Use expiring fixtures, deterministic waits, and scoped cleanup.
---

# Testing with inbox fixtures

`@mailfn/testing` provides expiring inbox fixtures, lifecycle hooks, OTP/link waits, and deterministic assertions. A fixture can supply a fresh address to the product workflow, wait with sender/subject/time filters, assert the result, and clean up safely even when called more than once.

```ts
import { withInboxFixture, waitForOtp } from "@mailfn/testing";

await withInboxFixture(client, { testRunId: crypto.randomUUID() }, async ({ inbox }) => {
  // Trigger your product workflow with inbox.address.
  const code = await waitForOtp(client, inbox.id, {
    senderDomain: "example.com",
    subject: "Verify",
    after: new Date().toISOString(),
    timeoutMs: 30_000,
  });
  expect(code.sourceMessageId).toBeTruthy();
});
```

Waits expose timeout and cancellation as normal control flow. Assertions can cover sender, recipient, subject, content, headers, attachment metadata, sizes, and hashes. The [testing package guide](/docs/reference/testing) has the exact API.
