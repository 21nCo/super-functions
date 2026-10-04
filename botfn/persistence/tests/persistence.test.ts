import { readFile } from 'node:fs/promises';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { createTRPCProxyClient, httpLink } from '@trpc/client';
import { createPersistenceApp, type AppRouter } from '../src/core.js';
import type { PersistenceClient } from '../src/client.js';
import * as schema from '../src/schema.js';

let storage: PGlite;
let client: PersistenceClient;

beforeEach(async () => {
  storage = new PGlite();
  const setup = await readFile(new URL('../SETUP.md', import.meta.url), 'utf8');
  const ddl = setup.match(/```sql\n([\s\S]*?)```/)?.[1];
  if (!ddl) throw new Error('SETUP.md must contain the production schema DDL');
  await storage.exec(ddl);
  const database = drizzle(storage, { schema });
  const app = createPersistenceApp(database);
  client = createTRPCProxyClient<AppRouter>({
    links: [httpLink({
      url: 'http://persistence.test/trpc',
      fetch: (input, init) => app.fetch(new Request(input, init), { DATABASE_URL: '' }),
    })],
  });
  vi.spyOn(Date, 'now').mockReturnValue(1_800_000_000_000);
});

afterEach(async () => {
  vi.restoreAllMocks();
  await storage.close();
});

describe('persistence HTTP API against PostgreSQL storage', () => {
  it('stores issue defaults, timestamps, identifiers and the initial thread', async () => {
    const created = await client.createIssue.mutate({
      githubIssueId: 'owner/repo#17', linearIssueId: 'linear-17',
      guildId: 'guild', channelId: 'channel',
    });
    expect(created).toMatchObject({
      githubIssueId: 'owner/repo#17', linearIssueId: 'linear-17', status: 'Backlog',
      isLiveStatusNotifiedOnDiscord: false, createdAt: 1_800_000_000, updatedAt: 1_800_000_000,
      discordThreads: [{ issueId: created.id, guildId: 'guild', channelId: 'channel',
        threadUrl: 'https://discord.com/channels/guild/channel', createdAt: 1_800_000_000 }],
    });
    expect(await client.getIssue.query({ id: created.id })).toEqual(created);
    expect(await client.getIssueByGithubId.query({ githubIssueId: 'owner/repo#17' })).toEqual(created);
    expect(await client.getIssueByLinearId.query({ linearIssueId: 'linear-17' })).toEqual(created);
    const rows = await storage.query<{ id: string }>('SELECT id FROM issues');
    expect(rows.rows).toEqual([{ id: created.id }]);
  });

  it('updates only supplied fields and filters Live issues by notification state', async () => {
    const first = await client.createIssue.mutate({ guildId: 'g', channelId: 'c' });
    const second = await client.createIssue.mutate({ guildId: 'g', channelId: 'd', status: 'Live' });
    vi.mocked(Date.now).mockReturnValue(1_800_000_100_000);
    const updated = await client.updateIssue.mutate({ id: first.id, status: 'Live', githubIssueId: 'repo#1' });
    expect(updated).toMatchObject({
      status: 'Live', githubIssueId: 'repo#1', linearIssueId: null,
      createdAt: first.createdAt, updatedAt: 1_800_000_100,
      discordThreads: first.discordThreads,
    });
    expect((await client.getUnnotifiedLiveIssues.query()).map(issue => issue.id).sort())
      .toEqual([first.id, second.id].sort());
    await client.updateIssue.mutate({ id: first.id, isLiveStatusNotifiedOnDiscord: true });
    expect(await client.getUnnotifiedLiveIssues.query()).toEqual([second]);
    await client.updateIssue.mutate({ id: first.id, isLiveStatusNotifiedOnDiscord: false });
    expect((await client.getUnnotifiedLiveIssues.query()).map(issue => issue.id)).toContain(first.id);
  });

  it('deduplicates threads by issue, guild and channel, not channel alone', async () => {
    const issue = await client.createIssue.mutate({ guildId: 'g', channelId: 'c' });
    const initial = issue.discordThreads[0];
    expect(await client.addDiscordThread.mutate({ issueId: issue.id, guildId: 'g', channelId: 'c' })).toEqual(initial);
    const additional = await client.addDiscordThread.mutate({ issueId: issue.id, guildId: 'other', channelId: 'c' });
    expect(additional.threadUrl).toBe('https://discord.com/channels/other/c');
    const fetched = await client.getIssue.query({ id: issue.id });
    expect(fetched?.discordThreads).toHaveLength(2);
    expect(fetched?.discordThreads).toEqual(expect.arrayContaining([initial, additional]));
  });

  it('returns null for absent queries and rejects invalid, empty or absent updates', async () => {
    expect(await client.getIssue.query({ id: 'missing' })).toBeNull();
    expect(await client.getIssueByGithubId.query({ githubIssueId: 'missing' })).toBeNull();
    expect(await client.getIssueByLinearId.query({ linearIssueId: 'missing' })).toBeNull();
    await expect(client.updateIssue.mutate({ id: 'missing' })).rejects.toThrow('No fields to update');
    await expect(client.updateIssue.mutate({ id: 'missing', status: 'Live' })).rejects.toThrow('Issue not found');
    await expect(client.createIssue.mutate({ guildId: 'g', channelId: 'c', status: 'invalid' as 'Live' }))
      .rejects.toMatchObject({ data: { code: 'BAD_REQUEST' } });
    await expect(client.addDiscordThread.mutate({ issueId: 'missing', guildId: 'g', channelId: 'c' })).rejects.toThrow();
    expect((await storage.query('SELECT * FROM discord_threads')).rows).toEqual([]);
  });

  it('rolls back issue creation when storing the initial thread fails', async () => {
    await storage.exec("ALTER TABLE discord_threads ADD CHECK (channel_id <> 'blocked')");
    await expect(client.createIssue.mutate({ githubIssueId: 'rollback#1', guildId: 'g', channelId: 'blocked' }))
      .rejects.toThrow();
    expect(await client.getIssueByGithubId.query({ githubIssueId: 'rollback#1' })).toBeNull();
    expect((await storage.query('SELECT * FROM issues')).rows).toEqual([]);
    expect((await storage.query('SELECT * FROM discord_threads')).rows).toEqual([]);
  });
});
