---
title: "@mailfn/client"
description: Source package guide for MailFn client.
---

Typed TypeScript client for a remote MailFn `/v1` API.

```ts
import { MailFnClient } from '@mailfn/client';

const client = new MailFnClient({
  baseUrl: 'https://mail.example.com',
  token: () => loadScopedToken(),
  timeoutMs: 30_000,
  retries: 2,
});
```

The client supports inbox/token lifecycle, message list/read/raw/attachments/wait/search/extraction/labels, threads, drafts/reply/forward/send, webhooks, custom domains, audit, operations, usage, abuse/reputation/support management, and compliance export. Reads and explicitly idempotent writes receive bounded retry; unsafe writes do not. `AbortSignal` cancellation and typed `MailFnClientError` metadata are preserved. `readRaw` returns `Uint8Array` directly. `downloadAttachment` returns `{ attachment: AttachmentDescriptor, data: Uint8Array }`; read its `data` field for bytes.
