---
title: Commands and routes
description: BotFn's registered commands, Worker routes, and tRPC procedures.
---

# Commands and routes

| Surface | Entry | Behavior |
| --- | --- | --- |
| Discord | `POST /interactions` | Verifies signed Discord requests, handles PING, autocomplete, and registered commands. |
| Discord | `/link-github-issue` | Adds a Discord thread comment to an existing GitHub issue. |
| Discord | `/create-github-issue` | Creates a GitHub issue with a Discord thread link. |
| Discord | `/link-linear-issue` | Adds a Discord thread comment to an existing Linear issue. |
| Discord | `/create-linear-issue` | Creates a Linear issue with a Discord thread link. |
| Slack | `POST /slack/events` | Verifies Slack signature; answers URL challenge or acknowledges an event. |
| Persistence | `GET /` | Returns a plain text service response. |
| Persistence | `/trpc/*` | Serves typed issue and thread procedures. |

Persistence mutations are `createIssue`, `updateIssue`, and `addDiscordThread`. Queries are `getIssue`, `getIssueByGithubId`, `getIssueByLinearId`, and `getUnnotifiedLiveIssues`. The tRPC route itself has no application authentication in the current source.

The optional admin capability exposes `botfn.bots.list`, `.get`, `.upsert`, `.delete` and `botfn.channels.list`, `.get`, `.connect`, `.disconnect`. These are capability operations, not routes on the Discord or persistence Worker.
