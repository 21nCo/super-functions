---
title: Postmark
description: Use Postmark as your authfn email provider.
---

# Postmark

```bash
npm install postmark
```

```ts
import * as postmark from 'postmark';
import type { AuthFnDeliveryProvider } from '@authfn/core';

const client = new postmark.ServerClient(process.env.POSTMARK_TOKEN!);

export const postmarkDelivery: AuthFnDeliveryProvider = {
  async send({ email, code, purpose }) {
    const result = await client.sendEmail({
      From: 'auth@acme.example',
      To: email,
      Subject: subjectFor(purpose),
      HtmlBody: bodyFor(purpose, code),
      MessageStream: 'transactional',
    });
    return {
      sent: result.ErrorCode === 0,
      metadata: { provider: 'postmark', messageId: result.MessageID },
    };
  },
};
```

Use Postmark **transactional** message streams for OTP, not the broadcast stream — engagement metrics and bounces flow into different reputation buckets.
