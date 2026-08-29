# MailFn

MailFn is a reusable programmable mailbox function for products, agents, and automated tests. It accepts real email, stores the original MIME as evidence, parses normalized messages and attachments, and exposes inbox operations through a provider-neutral core, a Cloudflare runtime, a typed client, a CLI, and an MCP server.

## Packages

| Package | Purpose |
| --- | --- |
| `mailfn` | Small public facade for the client and core types |
| `@mailfn/core` | Domain service, contracts, memory adapters, extraction, retention, auth, threading, drafts, and operational controls |
| `@mailfn/cloudflare` | Email Worker, HTTP Worker, D1, R2, Queue, MIME, webhook, and custom-domain adapters |
| `@mailfn/client` | Typed remote client with cancellation, bounded retries, binary downloads, and typed errors |
| `@mailfn/testing` | Expiring fixtures, lifecycle hooks, OTP/link waits, and deterministic assertions |
| `@mailfn/cli` | Least-privilege command line interface built on `@clifn/core` |
| `@mailfn/mcp` | Narrow, redacted-by-default MCP tools for agents |
| `@mailfn/sendfn` | Outbound adapter that composes with SendFn instead of duplicating delivery providers |

## Quick start

```ts
import { MailFnClient } from 'mailfn';

const mail = new MailFnClient({
  baseUrl: process.env.MAILFN_URL!,
  token: process.env.MAILFN_TOKEN!,
});

const { inbox, credential } = await mail.createInbox({
  kind: 'expiring',
  expirySeconds: 60 * 60,
  idempotencyKey: `signup:${crypto.randomUUID()}`,
});

// Give inbox.address to the system under test. Use the returned scoped
// credential for subsequent inbox access; the token is shown only once.
const scoped = new MailFnClient({ baseUrl: process.env.MAILFN_URL!, token: credential.token });
const result = await scoped.waitForMessages(inbox.id, {
  senderDomain: 'example.com',
  subject: 'Verify',
  after: new Date().toISOString(),
  timeoutMs: 30_000,
});

if (result.status === 'matched') {
  const verification = await scoped.extractVerification(inbox.id, result.messages[0].id, 'otp');
  console.log(verification.value, verification.sourceMessageId);
}
```

Waiting returns a normal `{ status: "timeout", retryable: true }` result. Cancellation uses `AbortSignal`. Filters should include sender, subject, time, and expected count when tests may receive concurrent mail.

## Runtime topology

The Cloudflare adapter implements this acceptance path:

1. Email Routing calls the Email Worker.
2. The Worker validates the recipient and limits, writes raw MIME to R2, inserts a D1 message row, and enqueues a versioned parse job.
3. The Queue consumer parses MIME, writes attachment bytes to R2, normalizes content into D1, resolves the thread, and emits versioned events.
4. The HTTP Worker serves scoped inbox, message, attachment, wait, extraction, thread, draft, webhook, domain, audit, operations, usage, abuse, support, and compliance APIs.
5. The scheduled handler expires inboxes and independently enforces raw, attachment, message, and audit retention.

See [SPEC.md](./SPEC.md), [THREAT_MODEL.md](./THREAT_MODEL.md), and [OPERATIONS.md](./OPERATIONS.md) before deploying.

## Product choices

MailFn adopts selected primitives demonstrated by [MailSlurp](https://www.mailslurp.com/docs/api/) (real inbox APIs and explicit waits), [Mailtrap Inbound Email](https://mailtrap.io/inbound-email/) (custom domains, raw/attachment evidence, webhooks, and threading), and [AgentMail](https://docs.agentmail.to/knowledge-base/inbox-capabilities) (agent-friendly inboxes, drafts, threads, and attachments). It is a self-hosted programmable mailbox function and SDK, not a claim of parity with those operated platforms, their control planes, protocol breadth, analytics, deliverability systems, or support operations. MailFn keeps provider DNS policy in deployment adapters, provides deterministic test helpers, and composes outbound mail through SendFn.

## Release and safety status

The package family is versioned at `0.1.0`, uses API/event version `v1`, and is registered in the repository release manifest. `npm run gate:mailfn-release` builds, tests, packs, installs, and imports every public package. The gate also runs MailFn in workerd with real local D1/R2 bindings and Email/Queue handler invocation, exercises the checked-in SendFn service, and typechecks Router-style plus framework-neutral consumers from the packed tarballs.

Public-platform mode, billing, support, future IMAP/SMTP/JMAP compatibility services, and production-security approval are separate gates. They default off. Outbound is denied when public-platform mode is enabled without explicit production-security approval, and verified sender domains are required by default. This repository work does not deploy infrastructure, modify DNS, publish packages, or approve a public service.
