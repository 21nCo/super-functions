# Persistence Service

tRPC-based persistence service for bot data using Hono and Cloudflare D1.

## Features

- **Type-safe API** with tRPC
- **Runtime validation** with Zod
- **Cloudflare D1** database
- **Issue tracking** with GitHub/Linear integration
- **Discord thread management** with many-to-many relationships

## Setup

### 1. Create D1 Database

```bash
wrangler d1 create botfn-db
```

Copy the `database_id` from the output and update it in `wrangler.toml`.

### 2. Initialize Database Schema

For production:
```bash
npm run db:init
```

For local development:
```bash
npm run db:init-local
```

### 3. Install Dependencies

From the monorepo root:
```bash
npm install
```

## Development

```bash
npm run dev
```

The service will be available at `http://localhost:8787`.

## Deployment

```bash
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

See the discord-bot integration for examples of using the tRPC client.

## Database Schema

The service uses two main tables:

- **issues** - Stores issue metadata (GitHub/Linear IDs, status, notification state)
- **discord_threads** - Many-to-many relationship between issues and Discord threads

See `schema.sql` for full schema definition.
