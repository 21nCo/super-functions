---
title: Mail adapters
description: authfn never bundles a mail provider. Implement the delivery contract for the provider you already use.
---

# Mail adapters

authfn doesn't ship a mail SDK. Instead, the email-OTP plugin (`authFnEmailOtpPlugin`) takes a `delivery` provider with a single `send` method:

```ts
interface AuthFnDeliveryProvider {
  send(input: AuthFnDeliveryRequest): Promise<AuthFnDeliveryResult> | AuthFnDeliveryResult;
  emit?(event: AuthFnOtpChallengeLifecycleEvent): Promise<void> | void;
}

interface AuthFnDeliveryRequest {
  channel: 'email';
  challengeId: string;
  purpose: 'verify-email' | 'sign-in' | 'sign-up' | 'reset-password';
  email: string;
  code: string;
  metadata?: Record<string, unknown>;
}

interface AuthFnDeliveryResult {
  sent: boolean;
  metadata?: Record<string, unknown>;
}
```

Pick the provider you already use — the recipes below are 1-file integrations.

| Provider | Page |
| --- | --- |
| Resend | [Resend](./resend) |
| Postmark | [Postmark](./postmark) |
| SendGrid | [SendGrid](./sendgrid) |
| AWS SES | [SES](./ses) |
| Anything else | [Custom](./custom) |

## Templating

authfn passes you the OTP `code`, the `purpose`, and any `metadata` you supplied. The email body is yours to template — give different copy per `purpose`:

```ts
const subjects = {
  'verify-email': 'Verify your email',
  'sign-in': 'Your sign-in code',
  'sign-up': 'Welcome — your sign-up code',
  'reset-password': 'Reset your password',
};
```

## Delivery failure

If `send` throws, the kernel responds with `AUTHFN_DELIVERY_FAILED` (HTTP 503, retryable). The OTP challenge row is *not* deleted — the user can ask for a resend without colliding with a stale challenge. Make sure your `send` returns sane errors so the kernel doesn't see a swallowed failure.

## Idempotency

Don't send the same OTP twice. The kernel only calls `send` once per challenge; if your delivery provider has a "send" + "queue" model, route through the queue and let it deduplicate.

## Best practices

- **Set the `From` address to a domain you control** with SPF / DKIM / DMARC. Otherwise mailbox providers will quietly drop the message.
- **Don't include the user's password** anywhere in the email body. Yes, this seems obvious; a surprising number of templates leak.
- **Keep the OTP visible at the top.** Many users glance at preview text only.
- **Include a "didn't request this?" line** with a way to report.
