-- Run against a dedicated application schema using the migration role.
CREATE EXTENSION IF NOT EXISTS vector;
CREATE TABLE IF NOT EXISTS memories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id text NOT NULL, container_tags text[] NOT NULL,
  type text NOT NULL, content text NOT NULL, embedding vector(1536), metadata jsonb NOT NULL DEFAULT '{}',
  is_latest boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_memories_tenant ON memories (tenant_id);
CREATE INDEX IF NOT EXISTS idx_memories_type ON memories (type);
CREATE INDEX IF NOT EXISTS idx_memories_is_latest ON memories (is_latest);
CREATE INDEX IF NOT EXISTS idx_memories_container_tags ON memories USING gin(container_tags);
CREATE TABLE IF NOT EXISTS memory_relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), from_id uuid NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
  to_id uuid NOT NULL REFERENCES memories(id) ON DELETE CASCADE, type text NOT NULL, confidence real NOT NULL,
  reasoning text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_relationships_from ON memory_relationships (from_id);
CREATE INDEX IF NOT EXISTS idx_relationships_to ON memory_relationships (to_id);
CREATE INDEX IF NOT EXISTS idx_relationships_type ON memory_relationships (type);
CREATE TABLE IF NOT EXISTS ingest_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id text NOT NULL, source text NOT NULL,
  payload_ref text, status text NOT NULL, error text, progress jsonb, result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ingest_events_tenant ON ingest_events (tenant_id);
CREATE INDEX IF NOT EXISTS idx_ingest_events_status ON ingest_events (status);
-- Add/tune approximate vector indexes after loading representative data; exact search is the default.
