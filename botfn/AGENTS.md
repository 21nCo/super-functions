# bot architecture

This monorepo contains bot implementations (Discord, Slack, Telegram, etc.) using a shared, platform-agnostic architecture.

## technology stack

- **Framework**: [Hono](https://hono.dev/) - lightweight, fast web framework
- **Validation**: [Zod](https://zod.dev/) - TypeScript-first schema validation
- **Monorepo**: [Turborepo](https://turbo.build/) - high-performance build system

## architecture principles

### multi-platform deployment

Each bot separates platform-specific code from core business logic, enabling deployment to multiple hosting providers.

**File structure**:
```
bots/[bot-name]/
├── src/
│   ├── core.ts              # Platform-agnostic business logic
│   ├── index.cloudflare.ts  # Cloudflare Workers entry point
│   ├── index.digitalocean.ts # DigitalOcean Functions entry point
│   └── index.vercel.ts      # Vercel Serverless entry point
├── package.json
└── tsconfig.json
```

### core logic separation

**`core.ts`** contains:
- Bot interaction handlers (Discord, Slack, etc.)
- Business logic (e.g., API integrations)
- Validation schemas (Zod)
- Utility functions
- All code that is platform-independent

**Platform-specific files** (`index.*.ts`) contain:
- Environment variable access patterns
- Platform-specific Hono app initialization
- Request/response adapters if needed
- Deployment configuration

## shared packages

### packages/discord-core
Discord-specific utilities:
- Discord signature verification
- Interaction type constants
- Response builders
- Crypto utilities for Ed25519 verification

**Note**: Platform-specific packages (like `discord-core`) are only dependencies for bots that need them. Create similar packages for other platforms (e.g., `slack-core`, `telegram-core`) as needed.

### packages/github-integration
GitHub API helpers:
- GitHub App authentication (JWT generation)
- GitHub API request wrapper
- Common GitHub operations

### packages/shared-types
Shared TypeScript types and Zod schemas:
- Common bot interaction types
- API response types
- Validation schemas for commands and options

## creating a new bot

1. Create directory structure:
```bash
mkdir -p bots/my-bot/src
cd bots/my-bot
```

2. Initialize package.json:
```json
{
  "name": "@botfn/my-bot",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "wrangler dev src/index.cloudflare.ts",
    "deploy:cloudflare": "wrangler deploy src/index.cloudflare.ts",
    "deploy:vercel": "vercel",
    "build": "tsc"
  },
  "dependencies": {
    "hono": "^4.0.0",
    "zod": "^3.22.0",
    "@botfn/discord-core": "workspace:*",
    "@botfn/shared-types": "workspace:*"
  }
}
```

3. Create `src/core.ts` with business logic:
```typescript
import { Hono } from 'hono';
import { z } from 'zod';
// Import platform-specific utilities as needed
// import { verifyDiscordRequest } from '@botfn/discord-core';
// import { verifySlackRequest } from '@botfn/slack-core';

// Define schemas
const CommandOptionsSchema = z.object({
  // your command options
});

// Define handlers
export function createBotHandlers(env: any) {
  return {
    async handleCommand(interaction: any) {
      // Business logic here
    }
  };
}

// Export core app factory
export function createBotApp() {
  const app = new Hono();
  
  app.post('/interactions', async (c) => {
    const env = c.env;
    const handlers = createBotHandlers(env);
    
    // Handle bot interactions
    // ...
    
    return c.json({ type: 1 }); // Response format depends on platform
  });
  
  return app;
}
```

4. Create platform-specific entry points:

**`src/index.cloudflare.ts`**:
```typescript
import { createBotApp } from './core';

const app = createBotApp();

export default app;
```

**`src/index.digitalocean.ts`**:
```typescript
import { createBotApp } from './core';

const app = createBotApp();

// DigitalOcean Functions use Node.js runtime
// Export the handler for the serverless function
export const main = app.fetch;
```

**`src/index.vercel.ts`**:
```typescript
import { handle } from '@hono/vercel';
import { createBotApp } from './core';

const app = createBotApp();

export default handle(app);
```

## validation with Zod

Always validate bot interaction data and external inputs:

```typescript
import { z } from 'zod';

const LinkCommandSchema = z.object({
  repository: z.string().min(1),
  search: z.string().min(1),
});

// In handler
const options = interaction.data.options;
const parsed = LinkCommandSchema.safeParse({
  repository: options.find(opt => opt.name === 'repository')?.value,
  search: options.find(opt => opt.name === 'search')?.value,
});

if (!parsed.success) {
  return { content: '❌ Invalid command options' };
}

const { repository, search } = parsed.data;
```

## environment variables

Each platform has different patterns for accessing environment variables:

- **Cloudflare**: `c.env.VARIABLE_NAME`
- **DigitalOcean**: `process.env.VARIABLE_NAME`
- **Vercel**: `process.env.VARIABLE_NAME`

Handle this in platform-specific files or create an env adapter in core.ts.

## deployment

### Cloudflare Workers
```bash
cd bots/my-bot
npm run deploy:cloudflare
```

Requires `wrangler.toml`:
```toml
name = "my-bot"
main = "src/index.cloudflare.ts"
compatibility_date = "2024-01-01"

[vars]
# Non-secret variables
```

### Digital Ocean Functions
```bash
cd bots/my-bot
doctl serverless deploy
```

Requires `.do/app.yaml`:
```yaml
functions:
  - name: my-bot
    runtime: nodejs:18
    source_dir: src
    entry_point: index.digitalocean.ts
```

### Vercel
```bash
cd bots/my-bot
npm run deploy:vercel
```

Requires `vercel.json`:
```json
{
  "functions": {
    "src/index.vercel.ts": {
      "runtime": "@vercel/node@3"
    }
  }
}
```

## development workflow

1. Make changes in `core.ts` or shared packages
2. Test locally: `npm run dev` (runs Cloudflare dev by default)
3. Build all bots: `npm run build` (from repo root)
4. Deploy to target platform: `npm run deploy:[platform]`

## best practices

1. **Keep core.ts platform-agnostic** - No platform-specific APIs
2. **Validate all inputs** - Use Zod schemas for type safety
3. **Use workspace dependencies** - Reference shared packages with `workspace:*`
4. **Handle errors gracefully** - Always return user-friendly error messages
5. **Test with multiple platforms** - Ensure compatibility across all targets
6. **Document environment variables** - List all required env vars in bot README


# Conduct Agent Instructions

## Overview

This repository uses **Conduct v0.1** - an AI agent orchestration platform with persistent memory. This file provides instructions for AI coding agents to work effectively with Conduct's workflow.

## Directory Structure

```
_conduct/
├── specs/              # Specification files
│   ├── 1.v0.spec.md   # Single-file spec
│   └── 2/             # Multi-file spec (for complex projects)
│       ├── spec.md
│       ├── architecture.md
│       ├── database.md
│       └── api.md
├── runs/               # Execution logs
│   ├── 1.v0.run.md    # Single-phase run
│   └── 2/             # Multi-phase run (for complex implementations)
│       ├── index.md
│       ├── 1-phase.md
│       └── 2-phase.md
├── checks/             # Verification reports
├── designs/            # UI designs (optional)
├── operations/         # SQL files for memory operations
├── logs/               # Log files
└── templates/          # Agent command templates

conduct.json            # Configuration
conduct.track.json      # Fast local tracker
```

## Agent Commands

Conduct provides specialized agent commands for different workflows. These commands are available in your agent's command directory:

### 🎯 conduct-spec
Transform user intent into detailed, actionable specification.

**Usage:**
```bash
conduct-spec "Add user authentication with OAuth"
conduct-spec path/to/requirements.md
conduct-spec https://github.com/owner/repo/issues/123
```

**What it does:**
- Elaborates user intent with clarifying questions
- Consults memory database for similar past work
- Generates structured specification in `_conduct/specs/`
- Determines Level of Effort (LOE)
- Updates tracker and memory database
- Supports remote sources (GitHub issues, Linear tickets)

### 🚀 conduct-run
Execute a specification and document the implementation.

**Usage:**
```bash
conduct-run 1                    # By spec ID
conduct-run _conduct/specs/1.v0.spec.md  # By path
conduct-run https://github.com/owner/repo/issues/123  # By URL
```

**What it does:**
- Loads specification from tracker or creates one if needed
- Checks for existing designs (if available, copies them first)
- Creates execution plan based on LOE
- Implements the solution
- Identifies impacted features automatically
- Documents everything in `_conduct/runs/`
- Updates tracker and memory database

### ✅ conduct-check
Verify implementation against specification.

**Usage:**
```bash
conduct-check 1  # Check run 1
```

**What it does:**
- Loads spec and run from tracker
- Verifies all requirements are addressed
- Checks code exists and tests pass
- Creates verification report in `_conduct/checks/`
- Updates tracker with check results

### 🎨 conduct-design (Optional)
Create UI designs with real project styles before implementation.

**Usage:**
```bash
conduct-design 1  # Create design for spec 1
```

**What it does:**
- Detects project framework (React, Svelte, Vue, etc.)
- Creates design workspace in `_conduct/designs/`
- Symlinks to real project styles
- Provides live preview server
- When approved, `conduct-run` auto-copies designs to `src/`

### 📦 conduct-index
Discover and index features from codebase.

**Usage:**
```bash
conduct-index           # Index entire codebase
conduct-index src/      # Index specific directory
```

**What it does:**
- Scans codebase for feature boundaries
- Uses directory structure, exports, and package.json hints
- Confirms discoveries with user
- Generates SQL and saves to memory via `conduct save`

### 🔄 conduct-reconcile
Sync memory database with actual codebase state.

**Usage:**
```bash
conduct-reconcile
conduct-reconcile --package frontend
```

**What it does:**
- Checks all active features against codebase
- Marks features as removed/moved/renamed if needed
- Updates relevancy scores for runs
- Generates reconciliation report
- Keeps memory in sync with reality

### ⚡ conduct (Lightweight)
Execute quick changes without full spec/run ceremony.

**Usage:**
```bash
conduct "Fix login button alignment"
conduct "Update README with installation steps"
```

**What it does:**
- For simple bug fixes, tweaks, and documentation updates
- Modifies code directly
- Logs to tracker (lightweight mode)
- Updates memory database
- NO spec/run files created

### 🧪 conduct-dry-run
Generate execution plan without implementing.

**Usage:**
```bash
conduct-dry-run 1
```

**What it does:**
- Creates run plan without code changes
- Shows files that WOULD be modified
- Allows review before execution
- Continue with: `conduct-run-execute {run-id}`

### 🧪 conduct-dry-check
Verify plan against spec without checking code.

**Usage:**
```bash
conduct-dry-check 1
```

**What it does:**
- Checks if plan covers all spec requirements
- Identifies gaps in plan
- Use with `conduct-dry-run` to approve before execution

## Memory Database

Conduct uses **libSQL** (SQLite-compatible) for persistent memory:

- **Local mode:** `_conduct/memory.db` (for solo development)
- **Remote mode:** Turso/libSQL server (for team collaboration)
- **Configuration:** `conduct.json` → `memory.profile`
- **Credentials:** `~/.conduct/credentials` (AWS CLI style)

### What's Stored

- **Packages:** For monorepos (defaults to "root")
- **Features:** Code features with paths and status
- **Specs:** Specifications with metadata
- **Runs:** Execution logs with feature links
- **Checks:** Verification results
- **Issue Connections:** Links to GitHub/Linear issues

### Memory Operations

Agents can query and update memory using SQL:

1. Agent generates SQL in `_conduct/operations/{name}.sql`
2. Run: `conduct save _conduct/operations/{name}.sql`
3. CLI validates and executes SQL securely

**Security:** Only INSERT and UPDATE allowed, whitelist validation

## Tracker (conduct.track.json)

Fast local cache for quick lookups without hitting the database:

```json
{
  "version": 1,
  "specs": [
    {
      "id": "1",
      "location": "_conduct/specs/1.v0.spec.md",
      "type": "file",
      "status": "completed",
      "agent": "claude",
      "createdAt": "2025-11-03T10:00:00Z"
    }
  ],
  "runs": [
    {
      "id": "1",
      "specId": "1",
      "location": "_conduct/runs/1.v0.run.md",
      "status": "completed",
      "agent": "claude",
      "completedAt": "2025-11-03T12:00:00Z"
    }
  ],
  "checks": [],
  "lightweight": []
}
```

## Remote Sources

Agent commands support fetching from remote issue trackers:

### GitHub Issues
```bash
conduct-spec https://github.com/owner/repo/issues/123
conduct-run https://github.com/owner/repo/issues/123
```

### Linear Tickets
```bash
conduct-spec https://linear.app/team/issue/PROJ-456
```

**Configuration:** Set API tokens via:
```bash
conduct config tracker add github
conduct config tracker add linear
```

## Workflow Examples

### Simple Bug Fix
```bash
conduct "Fix login button not responding on mobile"
# → Implements fix directly
# → Updates memory and tracker
```

### New Feature (Full Workflow)
```bash
# 1. Create specification
conduct-spec "Add user profile page with avatar and bio"

# 2. Optional: Create design first
conduct-design 1

# 3. Implement
conduct-run 1

# 4. Verify
conduct-check 1
```

### From GitHub Issue
```bash
conduct-spec https://github.com/acme/app/issues/456
conduct-run 1
conduct-check 1
```

### Greenfield Project
```bash
# Creates multi-file spec and multi-phase run
conduct-spec "Implement complete e-commerce platform from scratch"
# → Creates _conduct/specs/1/ with multiple files
# → Architecture, database, API, UI docs

conduct-run 1
# → Creates _conduct/runs/1/ with phases
# → Resumable execution
```

## Best Practices

### 1. Choose the Right Command
- **conduct-spec + conduct-run:** New features, complex changes
- **conduct:** Bug fixes, quick tweaks, documentation
- **conduct-design:** UI-heavy features (optional)

### 2. Use Memory Consultation
- Commands automatically check memory for similar past work
- Leverage context from previous implementations
- Avoid duplicating unfulfilled specs

### 3. Multi-File for Complexity
- Single spec file works for most cases
- Use multi-file structure for:
  - Greenfield projects
  - 1000+ line specs
  - Multiple architectural concerns

### 4. Keep Memory in Sync
- Run `conduct-index` after major refactoring
- Run `conduct-reconcile` periodically
- Features stay up-to-date with codebase

### 5. Remote Issue Integration
- Link specs to GitHub/Linear issues
- Bidirectional sync keeps everything in sync
- Automatic PR creation on run completion

## CLI Commands Reference

These commands are run from your terminal (not agent commands):

- `conduct init` - Initialize Conduct in repository
- `conduct health` - Check system health
- `conduct save <file>` - Execute SQL operations
- `conduct list` - List specs, runs, checks, features
- `conduct config` - Manage configuration
- `conduct sync` - Sync with external trackers
- `conduct discover` - Auto-discover features
- `conduct reconcile` - Detect codebase drift
- `conduct relevancy` - Manage relevancy scores
- `conduct archive` - Archive old runs

## Getting Started

1. **Initialize:** `conduct init` (already done if you're reading this)
2. **Index codebase:** Use `conduct-index` agent command
3. **Start working:** Use agent commands for your tasks
4. **Keep in sync:** Run `conduct-reconcile` periodically

## Help & Documentation

- **Agent Templates:** Check `.cursor/commands/`, `.claude/commands/`, or `.warp/commands/`
- **Configuration:** Review `conduct.json`
- **Credentials:** Check `~/.conduct/credentials`
- **CLI Help:** `conduct --help`

---

**Version:** 0.1.0  
**Last Updated:** 2025-11-04T13:24:27.607Z
