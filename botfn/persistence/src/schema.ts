import { pgEnum, pgTable, text, integer, boolean, unique } from 'drizzle-orm/pg-core';

export const issueStatus = pgEnum('issue_status', ['Backlog', 'InProgress', 'Live']);

export const issues = pgTable('issues', {
  id: text('id').primaryKey(),
  githubIssueId: text('github_issue_id'),
  linearIssueId: text('linear_issue_id'),
  status: issueStatus('status').notNull(),
  isLiveStatusNotifiedOnDiscord: boolean('is_live_status_notified_on_discord').notNull().default(false),
  createdAt: integer('created_at').notNull(), // Unix timestamp
  updatedAt: integer('updated_at').notNull(),
});

export const discordThreads = pgTable('discord_threads', {
  id: text('id').primaryKey(),
  issueId: text('issue_id').notNull().references(() => issues.id),
  guildId: text('guild_id').notNull(),
  channelId: text('channel_id').notNull(),
  threadUrl: text('thread_url').notNull(),
  createdAt: integer('created_at').notNull(),
}, (table) => {
  return {
    uniqueThreadKey: unique('discord_threads_issue_guild_channel_unique')
      .on(table.issueId, table.guildId, table.channelId),
  };
});
