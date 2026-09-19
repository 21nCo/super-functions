import { pgTable, text, integer, boolean, timestamp, jsonb, real, uuid, index, vector } from 'drizzle-orm/pg-core';

// Enable pgvector extension - this usually needs to be done in a migration
// CREATE EXTENSION IF NOT EXISTS vector;

export const memories = pgTable('memories', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: text('tenant_id').notNull(),
  containerTags: text('container_tags').array().notNull(), // using Postgres array for tags
  type: text('type').notNull(),
  content: text('content').notNull(),
  // 1536 is default for OpenAI text-embedding-3-small/ada-002
  embedding: vector('embedding', { dimensions: 1536 }),
  metadata: jsonb('metadata').default('{}').notNull(),
  revision: integer('revision').default(1).notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  isLatest: boolean('is_latest').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  tenantIdx: index('idx_memories_tenant').on(t.tenantId),
  typeIdx: index('idx_memories_type').on(t.type),
  latestIdx: index('idx_memories_is_latest').on(t.isLatest),
  // Gin index for tags would be ideal, but requires specific operator class support in drizzle definition
  // containerTagsIdx: index('idx_memories_container_tags').on(t.containerTags), 
  embeddingIdx: index('idx_memories_embedding').using('ivfflat', t.embedding.op('vector_cosine_ops')),
}));

export const memoryRelationships = pgTable('memory_relationships', {
  id: uuid('id').defaultRandom().primaryKey(),
  fromId: uuid('from_id').references(() => memories.id, { onDelete: 'cascade' }).notNull(),
  toId: uuid('to_id').references(() => memories.id, { onDelete: 'cascade' }).notNull(),
  type: text('type').notNull(),
  confidence: real('confidence').notNull(),
  reasoning: text('reasoning'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  fromIdx: index('idx_relationships_from').on(t.fromId),
  toIdx: index('idx_relationships_to').on(t.toId),
  typeIdx: index('idx_relationships_type').on(t.type),
}));

export const ingestEvents = pgTable('ingest_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: text('tenant_id').notNull(),
  source: text('source').notNull(),
  payloadRef: text('payload_ref'),
  status: text('status').notNull(),
  error: text('error'),
  progress: jsonb('progress'),
  result: jsonb('result'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  tenantIdx: index('idx_ingest_events_tenant').on(t.tenantId),
  statusIdx: index('idx_ingest_events_status').on(t.status),
}));
