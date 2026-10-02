---
title: Getting started
description: Initialize a TypeScript client with a database and provider.
---

Install the TypeScript SDK and shared adapters:

```sh
npm install sendfn @superfunctions/db @superfunctions/http
```

Supply a real `@superfunctions/db` adapter and at least the provider for the channel you send. The following uses the console SMS adapter for local development:

```ts
import { sendfn, consoleSmsAdapter } from "sendfn";
import type { Adapter } from "@superfunctions/db";

const database = /* your persistent adapter */ {} as Adapter;
const client = sendfn({ database, smsProvider: consoleSmsAdapter() });

await client.sms({ userId: "user-123", to: "+1234567890", message: "Hello" });
```

The empty cast above is a placeholder; configure a real adapter before running the example. Console SMS logs instead of delivering. For email, use a configured provider such as `awsSesAdapter` and set `email.fromEmail`. See the [TypeScript source guide](/docs/reference/typescript) for complete configuration and examples.
