---
title: Messages and evidence
description: Understand raw MIME, normalized messages, attachments, and retention.
---

MailFn stores original MIME in object storage before the message row and parse job. The parse consumer normalizes content, writes attachment bytes, and resolves threading. The typed client exposes message list, read, search, raw download, attachments, labels, threads, and explicit OTP/link extraction. `readRaw` returns `Uint8Array` directly. `downloadAttachment` returns `{ attachment: AttachmentDescriptor, data: Uint8Array }`; use `result.data` for the bytes.

The delivery identity is a SHA-256 fingerprint over normalized envelope plus raw evidence rather than sender-controlled `Message-ID`. A parse Queue failure leaves a recoverable `queue_failed` row. Scheduled work expires inboxes and independently enforces raw, attachment, message, and audit retention. Set those policies according to the application's evidence and privacy requirements.

The client retries reads and explicitly idempotent writes within a bound; unsafe writes are not retried. Use idempotency keys on create or outbound flows, and keep an `AbortSignal` for cancellation. See the [client contract](/docs/reference/client), [operations](/docs/reference/operations), and [specification](/docs/reference/spec).
