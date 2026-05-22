---
title: Resend
description: Use Resend as your authfn email provider.
---

# Resend

```bash
npm install resend
```

```ts
import { Resend } from 'resend';
import type { AuthFnDeliveryProvider } from '@authfn/core';

const resend = new Resend(process.env.RESEND_API_KEY!);

export const resendDelivery: AuthFnDeliveryProvider = {
  async send({ email, code, purpose }) {
    const { error } = await resend.emails.send({
      from: 'AcmeApp <auth@acme.example>',
      to: email,
      subject: subjectFor(purpose),
      html: bodyFor(purpose, code),
    });
    if (error) {
      throw new Error(`Resend send failed: ${error.message}`);
    }
    return { sent: true, metadata: { provider: 'resend' } };
  },
};

function subjectFor(purpose: string) {
  return {
    'verify-email': 'Verify your email',
    'sign-in': `Your sign-in code`,
    'sign-up': 'Welcome to AcmeApp',
    'reset-password': 'Reset your password',
  }[purpose] ?? 'Your code';
}

function bodyFor(purpose: string, code: string) {
  return `<p>Your code: <strong>${code}</strong></p>
          <p>This code expires in 10 minutes.</p>`;
}
```

Pass `resendDelivery` to `authFnEmailOtpPlugin({ delivery: resendDelivery })`.
