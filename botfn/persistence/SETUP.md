# Persistence Service Setup Guide

## What Was Created

The persistence service is a tRPC-based API that stores relationships between GitHub/Linear issues and Discord threads in PostgreSQL through Drizzle.

### Files Created

```
botfn/persistence/
├── src/
│   ├── core.ts                    # tRPC router with business logic
│   ├── index.cloudflare.ts       # Cloudflare Workers entry point
│   └── client.ts                  # tRPC client helper
├── package.json                   # Dependencies and scripts
├── wrangler.toml                  # Cloudflare Workers config
├── tsconfig.json                  # TypeScript config
├── README.md                      # API documentation
└── SETUP.md                       # This file
```

### Database Schema

**issues** table:
- `id` - Primary key (auto-generated)
- `github_issue_id` - GitHub issue identifier (e.g., "owner/repo#123")
- `linear_issue_id` - Linear issue ID
- `status` - Issue status: "Backlog", "InProgress", or "Live"
- `is_live_status_notified_on_discord` - Boolean flag
- `created_at` - Unix timestamp
- `updated_at` - Unix timestamp (auto-updated)

**discord_threads** table:
- `id` - Primary key (auto-generated)
- `issue_id` - Foreign key to issues table
- `guild_id` - Discord guild ID
- `channel_id` - Discord channel ID
- `thread_url` - Discord thread URL
- `created_at` - Unix timestamp

**Relationship**: One issue can have multiple Discord threads (many-to-many).

## Setup Instructions

### 1. Install Dependencies

From the monorepo root:

```bash
npm install
```

### 2. Provision PostgreSQL

Create a PostgreSQL database, set `DATABASE_URL`, and apply the schema represented
by `src/schema.ts`:

```sql
CREATE TYPE issue_status AS ENUM ('Backlog', 'InProgress', 'Live');

CREATE TABLE issues (
  id text PRIMARY KEY,
  github_issue_id text,
  linear_issue_id text,
  status issue_status NOT NULL,
  is_live_status_notified_on_discord boolean NOT NULL DEFAULT false,
  created_at integer NOT NULL,
  updated_at integer NOT NULL
);

CREATE TABLE discord_threads (
  id text PRIMARY KEY,
  issue_id text NOT NULL REFERENCES issues(id),
  guild_id text NOT NULL,
  channel_id text NOT NULL,
  thread_url text NOT NULL,
  created_at integer NOT NULL,
  CONSTRAINT discord_threads_issue_guild_channel_unique
    UNIQUE (issue_id, guild_id, channel_id)
);
```

For local development, create `botfn/persistence/.dev.vars`:

```dotenv
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DATABASE
```

### 3. Configure the production secret and deploy

From the monorepo root:

```bash
npx wrangler secret put DATABASE_URL --config botfn/persistence/wrangler.toml
npm --workspace @botfn/persistence-service run deploy
```

After deployment, you'll get a URL like:
```
https://botfn-persistence-service.YOUR-SUBDOMAIN.workers.dev
```

### 4. Update Discord Bot Configuration

Update `botfn/bot-discord/wrangler.toml` with your actual persistence service URL:

```toml
[vars]
PERSISTENCE_SERVICE_URL = "https://botfn-persistence-service.YOUR-SUBDOMAIN.workers.dev"
```

### 5. Install Discord Bot Dependencies

From monorepo root:

```bash
npm install
```

## Discord Bot Integration

The discord-bot now automatically persists issues when:

1. **Creating GitHub issues** (`/create-github-issue`)
   - Creates issue in persistence DB with `githubIssueId` and initial Discord thread

2. **Linking GitHub issues** (`/link-github-issue`)
   - If issue exists: adds new Discord thread
   - If issue doesn't exist: creates issue with this Discord thread

3. **Creating Linear issues** (`/create-linear-issue`)
   - Creates issue in persistence DB with `linearIssueId` and initial Discord thread

4. **Linking Linear issues** (`/link-linear-issue`)
   - If issue exists: adds new Discord thread
   - If issue doesn't exist: creates issue with this Discord thread

## API Reference

### tRPC Procedures

**Mutations:**
- `createIssue` - Create new issue with Discord thread
- `updateIssue` - Update issue fields (status, IDs, notification flag)
- `addDiscordThread` - Add Discord thread to existing issue

**Queries:**
- `getIssue` - Get issue by internal ID
- `getIssueByGithubId` - Get issue by GitHub issue ID
- `getIssueByLinearId` - Get issue by Linear issue ID
- `getUnnotifiedLiveIssues` - Get all "Live" issues not yet notified on Discord

## Local Development

**Start persistence service:**
```bash
npm --workspace @botfn/persistence-service run dev
```

The service will be available at `http://localhost:8787`.

**Start discord-bot:**
```bash
cd botfn/bot-discord
npm run dev
```

Update discord-bot's local `.dev.vars` file:
```
PERSISTENCE_SERVICE_URL=http://localhost:8787
```

## Example Usage

```typescript
import { createPersistenceClient } from '@botfn/persistence-service/src/client';

const client = createPersistenceClient(env.PERSISTENCE_SERVICE_URL);

// Create issue
const issue = await client.createIssue.mutate({
  githubIssueId: 'owner/repo#123',
  guildId: '123456789',
  channelId: '987654321',
  status: 'Backlog',
});

// Get issue by GitHub ID
const found = await client.getIssueByGithubId.query({
  githubIssueId: 'owner/repo#123',
});

// Update status
await client.updateIssue.mutate({
  id: issue.id,
  status: 'Live',
});
```

## Troubleshooting

**Issue: tRPC client errors**
- Ensure `PERSISTENCE_SERVICE_URL` is correctly set
- Check that persistence service is deployed and accessible

**Issue: Database connection or missing-table errors**
- Ensure `DATABASE_URL` is set in `.dev.vars` locally or as a Wrangler secret in production
- Apply the PostgreSQL schema above before starting or deploying the service

**Issue: Persistence failures in discord-bot**
- Check Cloudflare Workers logs: `wrangler tail`
- Persistence errors are logged but don't fail commands
