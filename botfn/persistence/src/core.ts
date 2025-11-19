import { Hono } from 'hono';
import { initTRPC } from '@trpc/server';
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { z } from 'zod';

// Environment interface
export interface PersistenceEnv {
  DB: D1Database;
}

// Zod schemas
const IssueStatusSchema = z.enum(['Backlog', 'InProgress', 'Live']);

const CreateIssueSchema = z.object({
  githubIssueId: z.string().optional(),
  linearIssueId: z.string().optional(),
  guildId: z.string(),
  channelId: z.string(),
  status: IssueStatusSchema.default('Backlog'),
});

const UpdateIssueSchema = z.object({
  id: z.string(),
  githubIssueId: z.string().optional(),
  linearIssueId: z.string().optional(),
  status: IssueStatusSchema.optional(),
  isLiveStatusNotifiedOnDiscord: z.boolean().optional(),
});

const AddDiscordThreadSchema = z.object({
  issueId: z.string(),
  guildId: z.string(),
  channelId: z.string(),
});

const GetIssueByGithubIdSchema = z.object({
  githubIssueId: z.string(),
});

const GetIssueByLinearIdSchema = z.object({
  linearIssueId: z.string(),
});

const GetIssueSchema = z.object({
  id: z.string(),
});

// Types
export type IssueStatus = z.infer<typeof IssueStatusSchema>;

export interface Issue {
  id: string;
  githubIssueId: string | null;
  linearIssueId: string | null;
  status: IssueStatus;
  isLiveStatusNotifiedOnDiscord: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface DiscordThread {
  id: string;
  issueId: string;
  guildId: string;
  channelId: string;
  threadUrl: string;
  createdAt: number;
}

export interface IssueWithThreads extends Issue {
  discordThreads: DiscordThread[];
}

// Database helpers
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function generateThreadUrl(guildId: string, channelId: string): string {
  return `https://discord.com/channels/${guildId}/${channelId}`;
}

// Create tRPC context
const createContext = (env: PersistenceEnv) => ({ db: env.DB });
type Context = ReturnType<typeof createContext>;

// Initialize tRPC
const t = initTRPC.context<Context>().create();

// tRPC router
const appRouter = t.router({
  // Create a new issue with initial discord thread
  createIssue: t.procedure
    .input(CreateIssueSchema)
    .mutation(async ({ input, ctx }) => {
      const issueId = generateId();
      const threadId = generateId();
      const threadUrl = generateThreadUrl(input.guildId, input.channelId);
      const now = Math.floor(Date.now() / 1000);

      // Insert issue
      await ctx.db
        .prepare(
          `INSERT INTO issues (id, github_issue_id, linear_issue_id, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .bind(
          issueId,
          input.githubIssueId || null,
          input.linearIssueId || null,
          input.status,
          now,
          now
        )
        .run();

      // Insert discord thread
      await ctx.db
        .prepare(
          `INSERT INTO discord_threads (id, issue_id, guild_id, channel_id, thread_url, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .bind(threadId, issueId, input.guildId, input.channelId, threadUrl, now)
        .run();

      return {
        id: issueId,
        githubIssueId: input.githubIssueId || null,
        linearIssueId: input.linearIssueId || null,
        status: input.status,
        isLiveStatusNotifiedOnDiscord: false,
        createdAt: now,
        updatedAt: now,
        discordThreads: [
          {
            id: threadId,
            issueId,
            guildId: input.guildId,
            channelId: input.channelId,
            threadUrl,
            createdAt: now,
          },
        ],
      };
    }),

  // Update an existing issue
  updateIssue: t.procedure
    .input(UpdateIssueSchema)
    .mutation(async ({ input, ctx }) => {
      const updates: string[] = [];
      const bindings: any[] = [];

      if (input.githubIssueId !== undefined) {
        updates.push('github_issue_id = ?');
        bindings.push(input.githubIssueId);
      }
      if (input.linearIssueId !== undefined) {
        updates.push('linear_issue_id = ?');
        bindings.push(input.linearIssueId);
      }
      if (input.status !== undefined) {
        updates.push('status = ?');
        bindings.push(input.status);
      }
      if (input.isLiveStatusNotifiedOnDiscord !== undefined) {
        updates.push('is_live_status_notified_on_discord = ?');
        bindings.push(input.isLiveStatusNotifiedOnDiscord ? 1 : 0);
      }

      if (updates.length === 0) {
        throw new Error('No fields to update');
      }

      bindings.push(input.id);

      await ctx.db
        .prepare(`UPDATE issues SET ${updates.join(', ')} WHERE id = ?`)
        .bind(...bindings)
        .run();

      // Fetch and return updated issue with threads
      const issue = await ctx.db
        .prepare('SELECT * FROM issues WHERE id = ?')
        .bind(input.id)
        .first<any>();

      if (!issue) {
        throw new Error('Issue not found');
      }

      const threads = await ctx.db
        .prepare('SELECT * FROM discord_threads WHERE issue_id = ?')
        .bind(input.id)
        .all<any>();

      return {
        id: issue.id,
        githubIssueId: issue.github_issue_id,
        linearIssueId: issue.linear_issue_id,
        status: issue.status as IssueStatus,
        isLiveStatusNotifiedOnDiscord: Boolean(issue.is_live_status_notified_on_discord),
        createdAt: issue.created_at,
        updatedAt: issue.updated_at,
        discordThreads: threads.results.map((t) => ({
          id: t.id,
          issueId: t.issue_id,
          guildId: t.guild_id,
          channelId: t.channel_id,
          threadUrl: t.thread_url,
          createdAt: t.created_at,
        })),
      };
    }),

  // Add a discord thread to an existing issue
  addDiscordThread: t.procedure
    .input(AddDiscordThreadSchema)
    .mutation(async ({ input, ctx }) => {
      const threadId = generateId();
      const threadUrl = generateThreadUrl(input.guildId, input.channelId);
      const now = Math.floor(Date.now() / 1000);

      // Check if thread already exists
      const existing = await ctx.db
        .prepare(
          'SELECT * FROM discord_threads WHERE issue_id = ? AND guild_id = ? AND channel_id = ?'
        )
        .bind(input.issueId, input.guildId, input.channelId)
        .first<any>();

      if (existing) {
        return {
          id: existing.id,
          issueId: existing.issue_id,
          guildId: existing.guild_id,
          channelId: existing.channel_id,
          threadUrl: existing.thread_url,
          createdAt: existing.created_at,
        };
      }

      await ctx.db
        .prepare(
          `INSERT INTO discord_threads (id, issue_id, guild_id, channel_id, thread_url, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .bind(threadId, input.issueId, input.guildId, input.channelId, threadUrl, now)
        .run();

      return {
        id: threadId,
        issueId: input.issueId,
        guildId: input.guildId,
        channelId: input.channelId,
        threadUrl,
        createdAt: now,
      };
    }),

  // Get issue by ID
  getIssue: t.procedure
    .input(GetIssueSchema)
    .query(async ({ input, ctx }) => {
      const issue = await ctx.db
        .prepare('SELECT * FROM issues WHERE id = ?')
        .bind(input.id)
        .first<any>();

      if (!issue) {
        return null;
      }

      const threads = await ctx.db
        .prepare('SELECT * FROM discord_threads WHERE issue_id = ?')
        .bind(input.id)
        .all<any>();

      return {
        id: issue.id,
        githubIssueId: issue.github_issue_id,
        linearIssueId: issue.linear_issue_id,
        status: issue.status as IssueStatus,
        isLiveStatusNotifiedOnDiscord: Boolean(issue.is_live_status_notified_on_discord),
        createdAt: issue.created_at,
        updatedAt: issue.updated_at,
        discordThreads: threads.results.map((t) => ({
          id: t.id,
          issueId: t.issue_id,
          guildId: t.guild_id,
          channelId: t.channel_id,
          threadUrl: t.thread_url,
          createdAt: t.created_at,
        })),
      };
    }),

  // Get issue by GitHub ID
  getIssueByGithubId: t.procedure
    .input(GetIssueByGithubIdSchema)
    .query(async ({ input, ctx }) => {
      const issue = await ctx.db
        .prepare('SELECT * FROM issues WHERE github_issue_id = ?')
        .bind(input.githubIssueId)
        .first<any>();

      if (!issue) {
        return null;
      }

      const threads = await ctx.db
        .prepare('SELECT * FROM discord_threads WHERE issue_id = ?')
        .bind(issue.id)
        .all<any>();

      return {
        id: issue.id,
        githubIssueId: issue.github_issue_id,
        linearIssueId: issue.linear_issue_id,
        status: issue.status as IssueStatus,
        isLiveStatusNotifiedOnDiscord: Boolean(issue.is_live_status_notified_on_discord),
        createdAt: issue.created_at,
        updatedAt: issue.updated_at,
        discordThreads: threads.results.map((t) => ({
          id: t.id,
          issueId: t.issue_id,
          guildId: t.guild_id,
          channelId: t.channel_id,
          threadUrl: t.thread_url,
          createdAt: t.created_at,
        })),
      };
    }),

  // Get issue by Linear ID
  getIssueByLinearId: t.procedure
    .input(GetIssueByLinearIdSchema)
    .query(async ({ input, ctx }) => {
      const issue = await ctx.db
        .prepare('SELECT * FROM issues WHERE linear_issue_id = ?')
        .bind(input.linearIssueId)
        .first<any>();

      if (!issue) {
        return null;
      }

      const threads = await ctx.db
        .prepare('SELECT * FROM discord_threads WHERE issue_id = ?')
        .bind(issue.id)
        .all<any>();

      return {
        id: issue.id,
        githubIssueId: issue.github_issue_id,
        linearIssueId: issue.linear_issue_id,
        status: issue.status as IssueStatus,
        isLiveStatusNotifiedOnDiscord: Boolean(issue.is_live_status_notified_on_discord),
        createdAt: issue.created_at,
        updatedAt: issue.updated_at,
        discordThreads: threads.results.map((t) => ({
          id: t.id,
          issueId: t.issue_id,
          guildId: t.guild_id,
          channelId: t.channel_id,
          threadUrl: t.thread_url,
          createdAt: t.created_at,
        })),
      };
    }),

  // Get all issues with status "Live" that haven't been notified
  getUnnotifiedLiveIssues: t.procedure
    .query(async ({ ctx }) => {
      const issues = await ctx.db
        .prepare(
          'SELECT * FROM issues WHERE status = ? AND is_live_status_notified_on_discord = 0'
        )
        .bind('Live')
        .all<any>();

      return await Promise.all(
        issues.results.map(async (issue) => {
          const threads = await ctx.db
            .prepare('SELECT * FROM discord_threads WHERE issue_id = ?')
            .bind(issue.id)
            .all<any>();

          return {
            id: issue.id,
            githubIssueId: issue.github_issue_id,
            linearIssueId: issue.linear_issue_id,
            status: issue.status as IssueStatus,
            isLiveStatusNotifiedOnDiscord: Boolean(issue.is_live_status_notified_on_discord),
            createdAt: issue.created_at,
            updatedAt: issue.updated_at,
            discordThreads: threads.results.map((t) => ({
              id: t.id,
              issueId: t.issue_id,
              guildId: t.guild_id,
              channelId: t.channel_id,
              threadUrl: t.thread_url,
              createdAt: t.created_at,
            })),
          };
        })
      );
    }),
});

export type AppRouter = typeof appRouter;

// Create Hono app
export function createPersistenceApp() {
  const app = new Hono<{ Bindings: PersistenceEnv }>();

  app.get('/', (c) => {
    return c.text('Persistence Service - tRPC API running');
  });

  app.all('/trpc/*', (c) => {
    return fetchRequestHandler({
      endpoint: '/trpc',
      req: c.req.raw,
      router: appRouter,
      createContext: () => createContext(c.env),
    });
  });

  return app;
}
