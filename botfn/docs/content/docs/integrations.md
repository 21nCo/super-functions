---
title: Integration helpers
description: Reuse Discord, Slack, GitHub, Linear, and schema helpers.
---

`@botfn/discord-core` exports the Discord request verifier, interaction constants, option helper, and response update helper. `verifyDiscordRequest(request, publicKey)` consumes the raw request body, checks Ed25519 signature headers, parses JSON, and validates a basic interaction shape. Pass the returned parsed, Zod-validated `body` to downstream handlers. It is not the original raw body: unknown fields outside the schema are stripped.

`@botfn/slack-core` exports `verifySlackRequest(request, signingSecret)`. It checks timestamp freshness and an HMAC-SHA256 signature over `v0:timestamp:raw-body`. The exported verifier is independent of the Slack Worker route.

`@botfn/github-integration` exports `GitHubClient`, `githubRequest`, and GitHub App token helpers. The client caches an installation token for 55 minutes; `githubRequest` is a one-off helper that fetches a token for each call. Supply App ID, installation ID, and private key. Callers own repository permission checks and must handle external API failures.

`@botfn/linear-integration` exports `LinearClient`, `linearRequest`, `getTeams`, `searchIssues`, `getIssue`, `createIssue`, and `createComment`. These call Linear's GraphQL endpoint using the supplied API key and throw on HTTP or GraphQL errors. Scope the key to the intended workspace and operations.

`@botfn/shared-types` provides Zod schemas and TypeScript types for Discord interactions, GitHub, and Linear structures. These schemas validate shapes; they do not authenticate requests. The [package map](/docs/reference/packages) links each source entry point.
