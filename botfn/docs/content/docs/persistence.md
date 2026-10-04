---
title: Persistence service
description: Store issue and Discord thread relationships through tRPC.
---

`@superfunctions/botfn-persistence-service` exposes a Hono Worker with a root health text response and tRPC procedures under `/trpc/*`. The service needs `DATABASE_URL` and a PostgreSQL schema matching `src/schema.ts`. The [source setup guide](https://github.com/21nCo/super-functions/blob/dev/botfn/persistence/SETUP.md) provides the DDL for `issues`, `discord_threads`, and the `issue_status` enum.

For local development, set `DATABASE_URL` in `botfn/persistence/.dev.vars`. Set a production Worker secret for deployment. Run `npm --workspace @superfunctions/botfn-persistence-service run dev` or `npm --workspace @superfunctions/botfn-persistence-service run deploy` from the repository root. Provision and migrate the database before starting the Worker; the package does not apply schema changes on startup.

```ts
import { createPersistenceClient } from "@superfunctions/botfn-persistence-service/client";

const client = createPersistenceClient(env.PERSISTENCE_SERVICE_URL);
const issue = await client.createIssue.mutate({
  githubIssueId: "owner/repo#123",
  guildId: "guild-id",
  channelId: "thread-id",
  status: "Backlog",
});
```

The public `/client` export loads the compiled client without the server runtime.
The `/core` export provides `createPersistenceApp(database?)`; when supplying a
`PersistenceDatabase`, the caller owns its connection and lifecycle. Ordinary
Worker startup instead uses the `DATABASE_URL` request binding.

The procedures include `createIssue`, `updateIssue`, `addDiscordThread`, `getIssue`, `getIssueByGithubId`, `getIssueByLinearId`, and `getUnnotifiedLiveIssues`. `createIssue` inserts its issue and initial thread in a database transaction. `addDiscordThread` ignores a duplicate `(issueId, guildId, channelId)` and returns the existing row. Status values are `Backlog`, `InProgress`, and `Live`.

The current tRPC service has no application authentication or tenant scoping in its route. Put it behind a trusted network or add authentication and authorization before exposing it to untrusted callers. The Discord bot calls this service after GitHub or Linear operations and logs persistence errors without failing the user command. Consult the [source router](https://github.com/21nCo/super-functions/blob/dev/botfn/persistence/src/core.ts) for exact procedure inputs.
