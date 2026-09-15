# BotFn architecture

BotFn lives inside Superfunctions as nested workspaces at `botfn/<pkg>`. There is no BotFn-root `package.json` or Turborepo of its own. Do not recreate a `bots/` + `packages/` layout, DigitalOcean/Vercel entrypoints, or badges/CI for a standalone BotFn GitHub repo.

## Technology stack

- **Framework**: [Hono](https://hono.dev/)
- **Validation**: [Zod](https://zod.dev/)
- **Runtime**: Cloudflare Workers (`wrangler`)
- **Persistence**: Postgres via `DATABASE_URL` (Drizzle), not D1

## Layout

```
botfn/
├── bot-discord/          # @botfn/discord-bot — src/core.ts + src/index.cloudflare.ts
├── bot-slack/            # @botfn/bot-slack — Cloudflare Worker
├── discord-core/         # @botfn/discord-core
├── slack-core/           # @botfn/slack-core
├── github-integration/   # @botfn/github-integration
├── linear-integration/   # @botfn/linear-integration
├── shared-types/         # @botfn/shared-types
├── persistence/          # @botfn/persistence-service — Cloudflare Worker + Postgres
└── admin/                # @botfn/admin
```

Bots keep platform-agnostic handlers in `src/core.ts` (or `src/index.ts` for Slack) and a Cloudflare entrypoint (`src/index.cloudflare.ts` or Wrangler `main`). Deploy with `wrangler`; do not add `index.digitalocean.ts` / `index.vercel.ts`.

## Shared packages

- **discord-core**: Ed25519 signature verification, interaction constants, response helpers
- **slack-core**: Slack signing-secret verification (Web Crypto HMAC)
- **github-integration**: GitHub App JWT and API wrapper
- **linear-integration**: Linear GraphQL helpers
- **shared-types**: Zod schemas for command options and env shapes
- **persistence**: tRPC + Hono Worker; Postgres through `DATABASE_URL`

Workspace dependencies use `*` / `workspace` names (`@botfn/...`) from the Superfunctions root.

## Cloudflare deployment

Discord and persistence ship `wrangler.toml` and `npm run deploy`. Slack has no `wrangler.toml`; it deploys the entrypoint directly (`npm run deploy:cloudflare` → `wrangler deploy src/index.ts`). Secrets go in Wrangler (`wrangler secret put ...`), including persistence `DATABASE_URL`. Env access is `c.env.VARIABLE_NAME`.

## Development workflow

1. Change `core.ts` or a shared `botfn/<pkg>` package.
2. Run the Worker locally: `npm run dev --workspace @botfn/discord-bot` (or `@botfn/bot-slack`).
3. Test/build from the Superfunctions root with turbo filters on `./botfn/*`.
4. Deploy the target Worker only.
