---
title: Providers
description: Inject delivery adapters and keep credentials in your deployment.
---

# Providers

SendFn separates sending from providers. The TypeScript package includes AWS SES email, Meta WhatsApp, APNS/FCM push, and console SMS development paths. Supply the relevant adapter in `sendfn({ ... })`; omit channels the application does not use.

Keep provider credentials in a secret store or deployment environment. Validate required variables before constructing adapters. The SDK's database adapter persists transactions, events, device tokens, and suppressions, so a production deployment needs durable storage.

The package [configuration guide](/docs/reference/typescript) shows imports and settings. Check each provider's delivery prerequisites, sender identity, and test versus production endpoints before sending live traffic.
