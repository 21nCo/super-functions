# Persistence Service

tRPC-based persistence service for bot data using Hono, PostgreSQL, and Drizzle.

## Features

- **Type-safe API** with tRPC
- **Runtime validation** with Zod
- **PostgreSQL + Drizzle** database access
- **Issue tracking** with GitHub/Linear integration
- **Discord thread management** with many-to-many relationships

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Provision PostgreSQL

Create a PostgreSQL database and apply the DDL in [SETUP.md](./SETUP.md), which
is kept in sync with `src/schema.ts`.

For local development, create `botfn/persistence/.dev.vars`:

```dotenv
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DATABASE
```

### 3. Configure the production secret

```bash
npx wrangler secret put DATABASE_URL --config botfn/persistence/wrangler.toml
```

## Development

```bash
npm --workspace @botfn/persistence-service run dev
```

The service will be available at `http://localhost:8787`.

## Deployment

```bash
npm --workspace @botfn/persistence-service run deploy
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

See the discord-bot integration for examples of using the tRPC client.

## Database Schema

The service uses two main tables:

- **issues** - Stores issue metadata (GitHub/Linear IDs, status, notification state)
- **discord_threads** - Many-to-many relationship between issues and Discord threads

See `src/schema.ts` for the Drizzle schema and [SETUP.md](./SETUP.md) for the
corresponding PostgreSQL DDL.
