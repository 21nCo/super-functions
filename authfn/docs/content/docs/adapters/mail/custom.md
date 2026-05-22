---
title: Custom mail adapter
description: The delivery contract is one method — drop in any mailer.
---

# Custom mail adapter

The delivery contract is *just* `send(input) → { sent, metadata? }`. Anything that can deliver an email implements it in five lines:

```ts
import type { AuthFnDeliveryProvider } from '@authfn/core';

export const myDelivery: AuthFnDeliveryProvider = {
  async send({ email, code, purpose, challengeId, metadata }) {
    await myMailer.deliver(email, render(purpose, code));
    return { sent: true, metadata: { challengeId } };
  },
};
```

You can compose / fan out:

```ts
const compose = (...providers: AuthFnDeliveryProvider[]): AuthFnDeliveryProvider => ({
  async send(input) {
    let lastError: unknown;
    for (const provider of providers) {
      try {
        const result = await provider.send(input);
        if (result.sent) return result;
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError ?? new Error('all providers failed');
  },
});

const delivery = compose(resendDelivery, sesDelivery);
```

…and you can wrap your own queue / job runner:

```ts
export const queuedDelivery: AuthFnDeliveryProvider = {
  async send(input) {
    await jobQueue.enqueue('send-otp', input);
    return { sent: true, metadata: { queued: true } };
  },
};
```

The `metadata` you return is persisted to the OTP challenge's `deliveryMetadata` and surfaced via observability events. Useful for debugging delivery issues.

## Lifecycle hook

Optionally, implement `emit` to react to OTP-specific lifecycle events without setting up a kernel-wide observability sink:

```ts
const myDelivery: AuthFnDeliveryProvider = {
  async send(input) { /* ... */ },
  async emit(event) {
    metrics.increment(`otp.${event.outcome}`, { purpose: event.purpose });
  },
};
```

`emit` fires for `authfn.otp.sent` and `authfn.otp.verified` events and carries the `outcome` (`'sent'`, `'verified'`).
