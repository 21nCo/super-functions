---
title: Webhooks and domains
description: Configure durable delivery and verified inbound domain routing.
---

MailFn persists events and pending webhook deliveries before enqueueing delivery work. A separate Queue binding and consumer handle webhook dispatch; scheduled reconciliation recovers unsent or abandoned jobs. Webhook handlers need signed delivery verification and idempotent processing in the receiving application.

Webhook targets must resolve directly to public origin IP addresses. Cloudflare-proxied targets are rejected at creation because the Workers TCP socket API cannot connect to Cloudflare IP ranges. Use a non-proxied DNS record or direct-origin endpoint for webhook delivery.

Custom domains require an exact Cloudflare zone ID and zone name, plus DNS and Email Routing setup owned by the deployment operator. Local workerd integration does not prove live DNS, provider routing, or mailbox deliverability. See the [Cloudflare guide](/docs/reference/cloudflare) and [operations reference](/docs/reference/operations).
