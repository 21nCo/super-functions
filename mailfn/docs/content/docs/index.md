---
title: MailFn
description: Programmable inboxes with durable MIME evidence and scoped APIs.
---

MailFn accepts real email, stores original MIME as evidence, parses normalized messages and attachments, and exposes inbox operations through a provider-neutral core, a Cloudflare runtime, a typed client, a CLI, an MCP server, and test helpers. It composes outbound delivery through SendFn.

Begin with [getting started](/docs/getting-started). Deployment operators should read the [Cloudflare runtime](/docs/cloudflare-runtime), [security boundary](/docs/credentials-and-scope), [threat model](/docs/reference/threat-model), and [operations guide](/docs/reference/operations) before receiving live mail.

The package family targets `0.1.0` and API/event version `v1`. Public-platform mode, billing, support, future IMAP/SMTP/JMAP services, and production-security approval are separate gates that default off. Local build and release-gate results do not prove live DNS or Email Routing behavior.
