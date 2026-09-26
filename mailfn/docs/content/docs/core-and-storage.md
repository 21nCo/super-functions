---
title: Core and storage
description: Embed the provider-neutral service and supply durable adapters.
---

# Core and storage

`@mailfn/core` owns projects, inboxes, scoped credentials, inbound orchestration, normalized MIME results, raw and attachment evidence, waits, extraction, threads, labels, search, drafts, webhooks, domains, retention, audit, quotas, and operational controls. It has no Cloudflare dependency.

```ts
import {
  MailFn,
  MemoryMailFnObjectStore,
  MemoryMailFnStore,
  noOpSecretProtector,
} from "@mailfn/core";

const mailfn = new MailFn({
  store: new MemoryMailFnStore(),
  objects: new MemoryMailFnObjectStore(),
  defaultDomain: "inbound.example.com",
  secretProtector: noOpSecretProtector, // tests only
});
```

The memory stores and no-op secret protector are for tests and local examples. A production host supplies durable `MailFnStore` and `MailFnObjectStore` implementations and an encrypted `MailFnSecretProtector`, plus appropriate Queue, MIME, webhook, domain, and SendFn adapters. The [core source guide](/docs/reference/core) and [specification](/docs/reference/spec) describe the domain contract.
