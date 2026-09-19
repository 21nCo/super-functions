# BotFn

BotFn is the Superfunctions workspace for Discord and Slack bots. Packages live at `botfn/<pkg>` in this repository — not a standalone Turborepo, and not a `bots/` + `packages/` tree.

Bots deploy to **Cloudflare Workers** only.

## Packages

| Path | Package | Purpose |
| --- | --- | --- |
| `botfn/bot-discord` | `@botfn/discord-bot` | Discord slash commands (GitHub/Linear) on Cloudflare Workers |
| `botfn/bot-slack` | `@botfn/bot-slack` | Slack events endpoint on Cloudflare Workers |
| `botfn/discord-core` | `@botfn/discord-core` | Discord signature verification and interaction helpers |
| `botfn/slack-core` | `@botfn/slack-core` | Slack request verification |
| `botfn/github-integration` | `@botfn/github-integration` | GitHub App auth and API helpers |
| `botfn/linear-integration` | `@botfn/linear-integration` | Linear API helpers |
| `botfn/shared-types` | `@botfn/shared-types` | Shared Zod schemas and types |
| `botfn/persistence` | `@botfn/persistence-service` | tRPC issue/thread persistence on Postgres |
| `botfn/admin` | `@botfn/admin` | Optional Super Console operator surface |

See [AGENTS.md](./AGENTS.md) for layout and Cloudflare entrypoints.

## Development

Install from the repository root (`npm install`). BotFn is a `botfn/*` workspace of Superfunctions.

```bash
# Discord bot local Worker
npm run dev --workspace @botfn/discord-bot

# Slack bot local Worker
npm run dev --workspace @botfn/bot-slack

# Package tests
npx turbo run test --filter='./botfn/*'

# Package builds
npx turbo run build --filter='./botfn/*'
```

Discord setup and slash-command registration: [bot-discord/README.md](./bot-discord/README.md). Persistence (Postgres `DATABASE_URL`): [persistence/README.md](./persistence/README.md).
