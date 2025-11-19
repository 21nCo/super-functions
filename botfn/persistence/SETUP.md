# Persistence Service Setup Guide

## What Was Created

The persistence service is a tRPC-based API that stores relationships between GitHub/Linear issues and Discord threads using Cloudflare D1.

### Files Created

```
services/persistence/
├── src/
│   ├── core.ts                    # tRPC router with business logic
│   ├── index.cloudflare.ts       # Cloudflare Workers entry point
│   └── client.ts                  # tRPC client helper
├── schema.sql                     # D1 database schema
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

### 2. Create Cloudflare D1 Database

```bash
cd services/persistence
wrangler d1 create botfn-db
```

This will output a `database_id`. Copy it and update `wrangler.toml`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "botfn-db"
database_id = "YOUR_D1_DATABASE_ID"  # Replace this
```

### 3. Initialize Database Schema

**For production (remote database):**
```bash
wrangler d1 execute botfn-db --remote --file=./schema.sql
```

**For local development:**
```bash
wrangler d1 execute botfn-db --local --file=./schema.sql
```

### 4. Deploy to Cloudflare Workers

```bash
npm run deploy
```

After deployment, you'll get a URL like:
```
https://botfn-persistence-service.YOUR-SUBDOMAIN.workers.dev
```

### 5. Update Discord Bot Configuration

Update `bots/discord-bot/wrangler.toml` with your actual persistence service URL:

```toml
[vars]
PERSISTENCE_SERVICE_URL = "https://botfn-persistence-service.YOUR-SUBDOMAIN.workers.dev"
```

### 6. Install Discord Bot Dependencies

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
cd services/persistence
npm run dev
```

The service will be available at `http://localhost:8787`.

**Start discord-bot:**
```bash
cd bots/discord-bot
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

**Issue: Database not found**
- Run `npm run db:init` (production) or `npm run db:init-local` (dev)
- Verify `database_id` in `wrangler.toml` matches D1 database

**Issue: Persistence failures in discord-bot**
- Check Cloudflare Workers logs: `wrangler tail`
- Persistence errors are logged but don't fail commands
