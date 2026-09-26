---
title: Administration capability
description: Integrate BotFn operator resources with Super Console.
---

# Administration capability

`@botfn/admin` exports an optional Super Console capability for project-owned bot identities and verified platform channel bindings. It has `bots` and `channels` resources with eight operations: list, get, upsert, and delete bots; list, get, connect, and disconnect channels. Use `createBotFnAdminClient(adminClient)` for typed calls and `createBotFnAdminAdapter(service)` to bind the capability to BotFn's operator service.

`createBotFnOperatorService({ store, verifyChannel, now? })` requires a durable `BotFnOperatorStore` implementation and a `verifyChannel` callback. The included `MemoryBotFnOperatorStore` is for tests and local development. The service requires installation, workspace, and project identifiers in the operation context. It strips `credentialRef` from channel views and returns `credentialConfigured: true` instead.

The capability declares project minimum scope and separate read, write, and delete permissions. Connecting a channel requires recent authentication confirmation and runs `verifyChannel` before persistence. Deleting a bot requires its channels to be disconnected. Provide durable store semantics and audit infrastructure at the host boundary; the capability package does not deploy a database or a console by itself.

See the [admin source](https://github.com/21nCo/super-functions/blob/dev/botfn/admin/src/index.ts) and [operator service](https://github.com/21nCo/super-functions/blob/dev/botfn/admin/src/operator-service.ts) for operation schemas and store methods.
