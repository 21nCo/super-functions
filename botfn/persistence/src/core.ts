import { Hono } from 'hono';
import { initTRPC } from '@trpc/server';
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { issues, discordThreads } from './schema';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

// Environment interface
export interface PersistenceEnv {
  DATABASE_URL: string;
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

type PersistenceDb = ReturnType<typeof drizzle<typeof schema>>;

const dbByUrl = new Map<string, PersistenceDb>();

function getDatabase(databaseUrl: string): PersistenceDb {
  let db = dbByUrl.get(databaseUrl);
  if (!db) {
    const client = postgres(databaseUrl);
    db = drizzle(client, { schema });
    dbByUrl.set(databaseUrl, db);
  }

  return db;
}

// Create tRPC context
const createContext = (env: PersistenceEnv) => {
  if (!env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required for BotFn persistence');
  }

  return { db: getDatabase(env.DATABASE_URL) };
};

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

      await ctx.db.transaction(async (tx) => {
        await tx.insert(issues).values({
          id: issueId,
          githubIssueId: input.githubIssueId,
          linearIssueId: input.linearIssueId,
          status: input.status,
          createdAt: now,
          updatedAt: now,
          isLiveStatusNotifiedOnDiscord: false
        });

        await tx.insert(discordThreads).values({
          id: threadId,
          issueId: issueId,
          guildId: input.guildId,
          channelId: input.channelId,
          threadUrl: threadUrl,
          createdAt: now
        });
      });

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
      const updates: any = {};

      if (input.githubIssueId !== undefined) updates.githubIssueId = input.githubIssueId;
      if (input.linearIssueId !== undefined) updates.linearIssueId = input.linearIssueId;
      if (input.status !== undefined) updates.status = input.status;
      if (input.isLiveStatusNotifiedOnDiscord !== undefined) updates.isLiveStatusNotifiedOnDiscord = input.isLiveStatusNotifiedOnDiscord;

      if (Object.keys(updates).length === 0) {
        throw new Error('No fields to update');
      }

      updates.updatedAt = Math.floor(Date.now() / 1000);

      await ctx.db.update(issues)
        .set(updates)
        .where(eq(issues.id, input.id));

      // Fetch and return updated issue with threads
      const issue = await ctx.db.select().from(issues).where(eq(issues.id, input.id)).limit(1).then(r => r[0]);

      if (!issue) {
        throw new Error('Issue not found');
      }

      const threads = await ctx.db.select().from(discordThreads).where(eq(discordThreads.issueId, input.id));

      return {
        id: issue.id,
        githubIssueId: issue.githubIssueId,
        linearIssueId: issue.linearIssueId,
        status: issue.status as IssueStatus,
        isLiveStatusNotifiedOnDiscord: Boolean(issue.isLiveStatusNotifiedOnDiscord),
        createdAt: issue.createdAt,
        updatedAt: issue.updatedAt,
        discordThreads: threads.map((t) => ({
          id: t.id,
          issueId: t.issueId,
          guildId: t.guildId,
          channelId: t.channelId,
          threadUrl: t.threadUrl,
          createdAt: t.createdAt,
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

      await ctx.db.insert(discordThreads).values({
        id: threadId,
        issueId: input.issueId,
        guildId: input.guildId,
        channelId: input.channelId,
        threadUrl: threadUrl,
        createdAt: now
      }).onConflictDoNothing({
        target: [discordThreads.issueId, discordThreads.guildId, discordThreads.channelId],
      });

      const thread = await ctx.db.select().from(discordThreads)
        .where(and(
          eq(discordThreads.issueId, input.issueId),
          eq(discordThreads.guildId, input.guildId),
          eq(discordThreads.channelId, input.channelId)
        ))
        .limit(1)
        .then(r => r[0]);

      if (!thread) {
        throw new Error('Failed to create discord thread');
      }

      return {
        id: thread.id,
        issueId: thread.issueId,
        guildId: thread.guildId,
        channelId: thread.channelId,
        threadUrl: thread.threadUrl,
        createdAt: thread.createdAt,
      };
    }),

  // Get issue by ID
  getIssue: t.procedure
    .input(GetIssueSchema)
    .query(async ({ input, ctx }) => {
      const issue = await ctx.db.select().from(issues).where(eq(issues.id, input.id)).limit(1).then(r => r[0]);

      if (!issue) {
        return null;
      }

      const threads = await ctx.db.select().from(discordThreads).where(eq(discordThreads.issueId, input.id));

      return {
        id: issue.id,
        githubIssueId: issue.githubIssueId,
        linearIssueId: issue.linearIssueId,
        status: issue.status as IssueStatus,
        isLiveStatusNotifiedOnDiscord: Boolean(issue.isLiveStatusNotifiedOnDiscord),
        createdAt: issue.createdAt,
        updatedAt: issue.updatedAt,
        discordThreads: threads.map((t) => ({
          id: t.id,
          issueId: t.issueId,
          guildId: t.guildId,
          channelId: t.channelId,
          threadUrl: t.threadUrl,
          createdAt: t.createdAt,
        })),
      };
    }),

  // Get issue by GitHub ID
  getIssueByGithubId: t.procedure
    .input(GetIssueByGithubIdSchema)
    .query(async ({ input, ctx }) => {
      const issue = await ctx.db.select().from(issues).where(eq(issues.githubIssueId, input.githubIssueId)).limit(1).then(r => r[0]);

      if (!issue) {
        return null;
      }

      const threads = await ctx.db.select().from(discordThreads).where(eq(discordThreads.issueId, issue.id));

      return {
        id: issue.id,
        githubIssueId: issue.githubIssueId,
        linearIssueId: issue.linearIssueId,
        status: issue.status as IssueStatus,
        isLiveStatusNotifiedOnDiscord: Boolean(issue.isLiveStatusNotifiedOnDiscord),
        createdAt: issue.createdAt,
        updatedAt: issue.updatedAt,
        discordThreads: threads.map((t) => ({
          id: t.id,
          issueId: t.issueId,
          guildId: t.guildId,
          channelId: t.channelId,
          threadUrl: t.threadUrl,
          createdAt: t.createdAt,
        })),
      };
    }),

  // Get issue by Linear ID
  getIssueByLinearId: t.procedure
    .input(GetIssueByLinearIdSchema)
    .query(async ({ input, ctx }) => {
      const issue = await ctx.db.select().from(issues).where(eq(issues.linearIssueId, input.linearIssueId)).limit(1).then(r => r[0]);

      if (!issue) {
        return null;
      }

      const threads = await ctx.db.select().from(discordThreads).where(eq(discordThreads.issueId, issue.id));

      return {
        id: issue.id,
        githubIssueId: issue.githubIssueId,
        linearIssueId: issue.linearIssueId,
        status: issue.status as IssueStatus,
        isLiveStatusNotifiedOnDiscord: Boolean(issue.isLiveStatusNotifiedOnDiscord),
        createdAt: issue.createdAt,
        updatedAt: issue.updatedAt,
        discordThreads: threads.map((t) => ({
          id: t.id,
          issueId: t.issueId,
          guildId: t.guildId,
          channelId: t.channelId,
          threadUrl: t.threadUrl,
          createdAt: t.createdAt,
        })),
      };
    }),

  // Get all issues with status "Live" that haven't been notified
  getUnnotifiedLiveIssues: t.procedure
    .query(async ({ ctx }) => {
      const results = await ctx.db.select().from(issues)
        .where(and(
          eq(issues.status, 'Live'),
          eq(issues.isLiveStatusNotifiedOnDiscord, false)
        ));

      return await Promise.all(
        results.map(async (issue) => {
          const threads = await ctx.db.select().from(discordThreads).where(eq(discordThreads.issueId, issue.id));

          return {
            id: issue.id,
            githubIssueId: issue.githubIssueId,
            linearIssueId: issue.linearIssueId,
            status: issue.status as IssueStatus,
            isLiveStatusNotifiedOnDiscord: Boolean(issue.isLiveStatusNotifiedOnDiscord),
            createdAt: issue.createdAt,
            updatedAt: issue.updatedAt,
            discordThreads: threads.map((t) => ({
              id: t.id,
              issueId: t.issueId,
              guildId: t.guildId,
              channelId: t.channelId,
              threadUrl: t.threadUrl,
              createdAt: t.createdAt,
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
