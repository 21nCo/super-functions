---
title: Channels
description: Send email, SMS, WhatsApp, and push with the TypeScript SDK.
---

# Channels

The TypeScript client exposes `email`, `sms`, `whatsapp`, and `push`. Each channel requires its provider and channel-specific credentials. Associate sends with a `userId` so transaction and event records can be queried.

```ts
await client.email({ userId: "user-123", to: "user@example.com", subject: "Welcome", html: "<p>Hello</p>" });
await client.sms({ userId: "user-123", to: "+1234567890", message: "Your code is 554433" });
await client.whatsapp({ userId: "user-123", to: "+1234567890", message: "Reminder" });
```

For push, register a device token before calling `client.push`. The package includes templates, suppression handling, and event tracking. See [providers](/docs/providers) and the [TypeScript guide](/docs/reference/typescript) for exact channel parameters.
