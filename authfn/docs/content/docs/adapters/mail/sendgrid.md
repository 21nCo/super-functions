---
title: SendGrid
description: Use SendGrid as your authfn email provider.
---

# SendGrid

```bash
npm install @sendgrid/mail
```

```ts
import sgMail from '@sendgrid/mail';
import type { AuthFnDeliveryProvider } from '@authfn/core';

sgMail.setApiKey(process.env.SENDGRID_API_KEY!);

export const sendgridDelivery: AuthFnDeliveryProvider = {
  async send({ email, code, purpose }) {
    const [response] = await sgMail.send({
      from: 'auth@acme.example',
      to: email,
      subject: subjectFor(purpose),
      html: bodyFor(purpose, code),
    });
    return {
      sent: response.statusCode >= 200 && response.statusCode < 300,
      metadata: { provider: 'sendgrid', messageId: response.headers['x-message-id'] },
    };
  },
};
```
