-- Issues table
-- Stores main issue information linking GitHub/Linear issues
CREATE TABLE IF NOT EXISTS issues (
  id TEXT PRIMARY KEY,
  github_issue_id TEXT,
  linear_issue_id TEXT,
  status TEXT NOT NULL CHECK(status IN ('Backlog', 'InProgress', 'Live')) DEFAULT 'Backlog',
  is_live_status_notified_on_discord INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

-- Discord threads table
-- Many-to-many relationship: one issue can be in multiple threads
CREATE TABLE IF NOT EXISTS discord_threads (
  id TEXT PRIMARY KEY,
  issue_id TEXT NOT NULL,
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  thread_url TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  FOREIGN KEY (issue_id) REFERENCES issues(id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_issues_github_id ON issues(github_issue_id);
CREATE INDEX IF NOT EXISTS idx_issues_linear_id ON issues(linear_issue_id);
CREATE INDEX IF NOT EXISTS idx_issues_status ON issues(status);
CREATE INDEX IF NOT EXISTS idx_discord_threads_issue_id ON discord_threads(issue_id);
CREATE INDEX IF NOT EXISTS idx_discord_threads_guild_channel ON discord_threads(guild_id, channel_id);

-- Trigger to update updated_at timestamp
CREATE TRIGGER IF NOT EXISTS update_issues_timestamp 
AFTER UPDATE ON issues
BEGIN
  UPDATE issues SET updated_at = strftime('%s', 'now') WHERE id = NEW.id;
END;
