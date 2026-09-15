# Persistence Service

tRPC-based persistence service for bot data using Hono, Drizzle, and Postgres. It runs as a Cloudflare Worker; the database is Postgres via `DATABASE_URL`, not D1.

## Features

- **Type-safe API** with tRPC
- **Runtime validation** with Zod
- **Postgres** through `DATABASE_URL`
- **Issue tracking** with GitHub/Linear integration
- **Discord thread management** with many-to-many relationships

## Setup

### 1. Install dependencies

From the Superfunctions repository root:

```bash
npm install
```

Remaining commands run from `botfn/persistence` (or `npm run <script> --workspace @botfn/persistence-service` at the repo root).

### 2. Configure Postgres

Set `DATABASE_URL` as a Wrangler secret. For local Wrangler, put it in `.dev.vars` (Wrangler loads that file; Node scripts do not):

```bash
cd botfn/persistence
wrangler secret put DATABASE_URL
```

Schema lives in `src/schema.ts` (Drizzle `pgTable`). Apply equivalent Postgres DDL to the database before serving traffic.

### 3. Check the connection string

`db:env:check` reads `process.env.DATABASE_URL` only. Export it in the shell (`.dev.vars` is not loaded):

```bash
cd botfn/persistence
export DATABASE_URL=postgres://...
npm run db:env:check
```

## Development

```bash
cd botfn/persistence
npm run dev
```

The service will be available at `http://localhost:8787`.

## Deployment

```bash
cd botfn/persistence
npm run deploy
```

## API Endpoints

All tRPC procedures are available at `/trpc/*`:

### Mutations

- **createIssue** - Create a new issue with initial Discord thread
  ```typescript
  {
    githubIssueId?: string;
    linearIssueId?: string;
    guildId: string;
    channelId: string;
    status?: "Backlog" | "InProgress" | "Live";
  }
  ```

- **updateIssue** - Update an existing issue
  ```typescript
  {
    id: string;
    githubIssueId?: string;
    linearIssueId?: string;
    status?: "Backlog" | "InProgress" | "Live";
    isLiveStatusNotifiedOnDiscord?: boolean;
  }
  ```

- **addDiscordThread** - Add a Discord thread to an existing issue
  ```typescript
  {
    issueId: string;
    guildId: string;
    channelId: string;
  }
  ```

### Queries

- **getIssue** - Get issue by ID
- **getIssueByGithubId** - Get issue by GitHub issue ID
- **getIssueByLinearId** - Get issue by Linear issue ID
- **getUnnotifiedLiveIssues** - Get all "Live" issues that haven't been notified on Discord

## Usage from Discord Bot

See `botfn/bot-discord` for examples of using the tRPC client.

## Database Schema

The service uses two main tables:

- **issues** - Stores issue metadata (GitHub/Linear IDs, status, notification state)
- **discord_threads** - Many-to-many relationship between issues and Discord threads

See `src/schema.ts` for the Drizzle/Postgres definition.
