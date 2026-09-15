# Persistence Service Setup Guide

The persistence service is a tRPC-based API that stores relationships between GitHub/Linear issues and Discord threads in Postgres. It deploys as a Cloudflare Worker; it does not use D1.

### Files

```
botfn/persistence/
├── src/
│   ├── core.ts                    # tRPC router with business logic
│   ├── index.cloudflare.ts        # Cloudflare Workers entry point
│   ├── schema.ts                  # Drizzle Postgres schema
│   └── client.ts                  # tRPC client helper
├── package.json                   # Dependencies and scripts
├── wrangler.toml                  # Cloudflare Workers config
├── tsconfig.json                  # TypeScript config
├── README.md                      # API documentation
└── SETUP.md                       # This file
```

### Database Schema

**issues** table:

- `id` - Primary key
- `github_issue_id` - GitHub issue identifier (e.g., "owner/repo#123")
- `linear_issue_id` - Linear issue ID
- `status` - Issue status: "Backlog", "InProgress", or "Live"
- `is_live_status_notified_on_discord` - Boolean flag
- `created_at` - Unix timestamp
- `updated_at` - Unix timestamp

**discord_threads** table:

- `id` - Primary key
- `issue_id` - Foreign key to issues table
- `guild_id` - Discord guild ID
- `channel_id` - Discord channel ID
- `thread_url` - Discord thread URL
- `created_at` - Unix timestamp

**Relationship**: One issue can have multiple Discord threads.

## Setup Instructions

### 1. Install Dependencies

From the Superfunctions repository root:

```bash
npm install
```

### 2. Configure Postgres

Provide a Postgres connection string as `DATABASE_URL`. For Cloudflare:

```bash
cd botfn/persistence
wrangler secret put DATABASE_URL
```

For local Wrangler, put `DATABASE_URL=postgres://...` in `.dev.vars`. Wrangler loads that file; `db:env:check` does not.

Apply the Drizzle schema in `src/schema.ts` to the database (equivalent Postgres DDL). Confirm the URL is exported in the shell:

```bash
export DATABASE_URL=postgres://...
npm run db:env:check
```

`wrangler.toml` does not bind a D1 database.

### 3. Deploy to Cloudflare Workers

```bash
npm run deploy
```

After deployment, you'll get a URL like:

```
https://botfn-persistence-service.YOUR-SUBDOMAIN.workers.dev
```

### 4. Update Discord Bot Configuration

Update `botfn/bot-discord/wrangler.toml` with the persistence service URL:

```toml
[vars]
PERSISTENCE_SERVICE_URL = "https://botfn-persistence-service.YOUR-SUBDOMAIN.workers.dev"
```

## Discord Bot Integration

`botfn/bot-discord` persists issues when:

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
cd botfn/persistence
npm run dev
```

The service will be available at `http://localhost:8787`.

**Start discord-bot:**

```bash
cd botfn/bot-discord
npm run dev
```

Update the discord-bot local `.dev.vars` file:

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

**Issue: Database connection errors**

- Confirm `DATABASE_URL` is set (`npm run db:env:check`)
- Confirm the Postgres schema from `src/schema.ts` has been applied

**Issue: Persistence failures in discord-bot**

- Check Cloudflare Workers logs: `wrangler tail`
- Persistence errors are logged but don't fail commands
