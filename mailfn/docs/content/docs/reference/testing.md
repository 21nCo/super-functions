---
title: "@mailfn/testing"
description: Source package guide for MailFn testing.
---

Deterministic test primitives for MailFn.

```ts
import { withInboxFixture, waitForOtp } from '@mailfn/testing';

await withInboxFixture(client, { testRunId: crypto.randomUUID() }, async ({ inbox }) => {
  const after = new Date(Date.now() - 1).toISOString(); // Strict receivedAfter boundary.
  // Trigger the product workflow with inbox.address.
  const code = await waitForOtp(client, inbox.id, {
    senderDomain: 'example.com',
    subject: 'Verify',
    after,
    timeoutMs: 30_000,
  });
  expect(code.sourceMessageId).toBeTruthy();
});
```

Fixtures are expiring and idempotent, and cleanup is safe to call more than once. `waitForOtp` and `waitForVerificationLink` throw `MailFnAssertionError` on timeout. Use `client.waitForMessages` for result-based timeout handling; cancellation rejects. Helpers provide deterministic assertions for sender, recipient, subject, content, headers, attachment metadata, sizes, and hashes.
