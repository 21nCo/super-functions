ALTER TABLE memories ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 1;
ALTER TABLE memories ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_memories_active_tenant ON memories (tenant_id) WHERE deleted_at IS NULL AND is_latest = true;
