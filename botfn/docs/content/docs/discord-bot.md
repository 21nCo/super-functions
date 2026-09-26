---
title: Discord bot
description: Configure signed interactions, issue commands, and the Worker.
---

`@botfn/discord-bot` exposes a Hono app through `src/index.cloudflare.ts`. Discord sends `POST /interactions`; the app verifies the Ed25519 signature using `DISCORD_PUBLIC_KEY` before parsing or handling the interaction. Invalid signatures return 401. PING returns a PONG response. Application commands return a deferred response while the Worker completes the operation and edits the interaction response.

## Set up

1. Create a Discord application and obtain its application ID, public key, and bot token. Set the interaction endpoint to the deployed Worker's `/interactions` route.
2. Create and install a GitHub App for the repositories to expose. Provide `GITHUB_APP_ID`, `GITHUB_INSTALLATION_ID`, and `GITHUB_PRIVATE_KEY` to the Worker as secrets. A Linear API key is needed for Linear commands.
3. Deploy the [persistence service](/docs/persistence) if issue-to-thread records are required. Set `PERSISTENCE_SERVICE_URL` to its actual reachable URL; the checked-in `wrangler.toml` value is only a deployment-specific setting.
4. Set `DISCORD_PUBLIC_KEY`, `DISCORD_CLIENT_ID`, GitHub credentials, and `LINEAR_API_KEY` as Worker secrets as applicable. Use `botfn/bot-discord/.env.example` for local command registration credentials.
5. Run `npm --workspace @botfn/discord-bot run register-commands`, then `npm --workspace @botfn/discord-bot run deploy` from the repository root.

The registered commands are `link-github-issue`, `create-github-issue`, `link-linear-issue`, and `create-linear-issue`. Autocomplete fetches repositories or issues from GitHub and teams or issues from Linear. Commands add a Discord thread link to the external issue or create an issue with that link.

The command handler catches persistence failures, logs them, and still reports the external issue operation as successful. Reconcile missing issue-to-thread records if persistence is essential to your workflow. The GitHub and Linear API operations themselves can fail after Discord has acknowledged the command; the Worker then edits the response with an error. Review the [command reference](/docs/reference/commands-and-routes) and [source app](https://github.com/21nCo/super-functions/blob/dev/botfn/bot-discord/src/core.ts) for exact behavior.
