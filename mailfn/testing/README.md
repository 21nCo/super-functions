# `@mailfn/testing`

Deterministic test primitives for MailFn.

```ts
import { withInboxFixture, waitForOtp } from '@mailfn/testing';

await withInboxFixture(client, { testRunId: crypto.randomUUID() }, async ({ inbox }) => {
  // Trigger the product workflow with inbox.address.
  const code = await waitForOtp(client, inbox.id, {
    senderDomain: 'example.com',
    subject: 'Verify',
    after: new Date().toISOString(),
    timeoutMs: 30_000,
  });
  expect(code.sourceMessageId).toBeTruthy();
});
```

Fixtures are expiring and idempotent, and cleanup is safe to call more than once. Helpers expose normal timeout/cancellation behavior and deterministic assertions for sender, recipient, subject, content, headers, attachment metadata, sizes, and hashes.
