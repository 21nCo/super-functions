# `@mailfn/core`

Provider-neutral MailFn domain service and contracts. It includes projects, stable/expiring inboxes, scoped credentials, inbound durability orchestration, MIME result normalization, raw/attachment evidence, waits, OTP/link extraction, threads, labels, search, drafts, SendFn-compatible outbound contracts, webhooks, custom domains, retention, audit, usage, quotas, abuse/support/compliance controls, and deterministic memory adapters.

```ts
import { MailFn, MemoryMailFnObjectStore, MemoryMailFnStore, noOpSecretProtector } from '@mailfn/core';

const mailfn = new MailFn({
  store: new MemoryMailFnStore(),
  objects: new MemoryMailFnObjectStore(),
  defaultDomain: 'inbound.example.com',
  secretProtector: noOpSecretProtector, // tests only
});

const bootstrap = await mailfn.bootstrapProject({ slug: 'app', displayName: 'App' });
```

Production runtimes must provide durable `MailFnStore` and `MailFnObjectStore` implementations, an encrypted `MailFnSecretProtector`, and usually Queue, MIME, webhook, domain, and SendFn adapters. The core has no Cloudflare dependency.
