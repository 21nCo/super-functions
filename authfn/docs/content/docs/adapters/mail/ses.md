---
title: AWS SES
description: Use AWS SES as your authfn email provider.
---

# AWS SES

```bash
npm install @aws-sdk/client-ses
```

```ts
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import type { AuthFnDeliveryProvider } from '@authfn/core';

const ses = new SESClient({ region: process.env.AWS_REGION });

export const sesDelivery: AuthFnDeliveryProvider = {
  async send({ email, code, purpose }) {
    const result = await ses.send(new SendEmailCommand({
      Source: 'auth@acme.example',
      Destination: { ToAddresses: [email] },
      Message: {
        Subject: { Data: subjectFor(purpose) },
        Body: { Html: { Data: bodyFor(purpose, code) } },
      },
    }));
    return {
      sent: !!result.MessageId,
      metadata: { provider: 'ses', messageId: result.MessageId },
    };
  },
};
```

For high volume, use **SES v2** (`@aws-sdk/client-sesv2`) and configuration sets to track bounces/complaints. Configure DKIM and a custom MAIL FROM domain on your verified identity.
