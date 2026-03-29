import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { drizzleAdapter } from "@superfunctions/db/adapters";
import { schema } from "./datafn-schema.drizzle.js";
import { mkdirSync } from "node:fs";

mkdirSync("./data", { recursive: true });

const sqlite = new Database("./data/sharing-app.db");
sqlite.pragma("journal_mode = WAL");

// Create tables if they don't exist (auto-setup for demo app)
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS documents (
    __ns TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    created_by TEXT,
    id TEXT NOT NULL,
    title TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    updated_by TEXT,
    visibility TEXT,
    PRIMARY KEY (__ns, id)
  );
  CREATE INDEX IF NOT EXISTS idx_documents___ns ON documents (__ns);
  CREATE INDEX IF NOT EXISTS documents_title_idx ON documents (title);
  CREATE INDEX IF NOT EXISTS idx_documents_visibility ON documents (visibility);
  CREATE INDEX IF NOT EXISTS idx_documents_created_by_visibility ON documents (created_by, visibility);

  CREATE TABLE IF NOT EXISTS kv (
    __ns TEXT NOT NULL,
    id TEXT NOT NULL,
    value TEXT,
    PRIMARY KEY (__ns, id)
  );
  CREATE INDEX IF NOT EXISTS idx_kv___ns ON kv (__ns);

  CREATE TABLE IF NOT EXISTS __datafn_permissions_global (
    __ns TEXT,
    id TEXT NOT NULL PRIMARY KEY,
    resource_type TEXT NOT NULL,
    resource_ns TEXT NOT NULL,
    resource_id TEXT,
    principal_id TEXT NOT NULL,
    level TEXT NOT NULL,
    grant_kind TEXT NOT NULL,
    source_ref TEXT,
    granted_by TEXT NOT NULL,
    granted_at INTEGER NOT NULL,
    revoked_at INTEGER
  );
  CREATE UNIQUE INDEX IF NOT EXISTS __datafn_permissions_global_resource_record_idx ON __datafn_permissions_global (resource_type, resource_ns, resource_id, principal_id);
  CREATE UNIQUE INDEX IF NOT EXISTS __datafn_permissions_global_scope_idx ON __datafn_permissions_global (resource_type, resource_ns, principal_id, grant_kind);
  CREATE INDEX IF NOT EXISTS idx_perm_principal ON __datafn_permissions_global (principal_id);
  CREATE INDEX IF NOT EXISTS idx_perm_resource_ns_principal ON __datafn_permissions_global (resource_ns, principal_id);
  CREATE INDEX IF NOT EXISTS idx_perm_resource_lookup ON __datafn_permissions_global (resource_type, resource_ns, resource_id);
  CREATE INDEX IF NOT EXISTS idx_perm_active_lookup ON __datafn_permissions_global (resource_type, resource_ns, principal_id, revoked_at);

  CREATE TABLE IF NOT EXISTS __datafn_principal_memberships (
    __ns TEXT,
    id TEXT NOT NULL PRIMARY KEY,
    namespace TEXT NOT NULL,
    actor_id TEXT NOT NULL,
    principal_id TEXT NOT NULL,
    granted_at INTEGER NOT NULL,
    revoked_at INTEGER
  );
  CREATE UNIQUE INDEX IF NOT EXISTS __datafn_principal_memberships_namespace_actor_principal_idx ON __datafn_principal_memberships (namespace, actor_id, principal_id);
  CREATE INDEX IF NOT EXISTS idx_membership_actor ON __datafn_principal_memberships (namespace, actor_id);
  CREATE INDEX IF NOT EXISTS idx_membership_principal ON __datafn_principal_memberships (namespace, principal_id);
  CREATE INDEX IF NOT EXISTS idx_membership_active ON __datafn_principal_memberships (namespace, actor_id, revoked_at);

  CREATE TABLE IF NOT EXISTS __datafn_principal_hierarchy (
    __ns TEXT,
    id TEXT NOT NULL PRIMARY KEY,
    namespace TEXT NOT NULL,
    principal_id TEXT NOT NULL,
    parent_principal_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    revoked_at INTEGER
  );
  CREATE UNIQUE INDEX IF NOT EXISTS __datafn_principal_hierarchy_namespace_principal_parent_idx ON __datafn_principal_hierarchy (namespace, principal_id, parent_principal_id);
  CREATE INDEX IF NOT EXISTS idx_hierarchy_principal ON __datafn_principal_hierarchy (namespace, principal_id);
  CREATE INDEX IF NOT EXISTS idx_hierarchy_parent ON __datafn_principal_hierarchy (namespace, parent_principal_id);
  CREATE INDEX IF NOT EXISTS idx_hierarchy_active ON __datafn_principal_hierarchy (namespace, principal_id, revoked_at);
`);

export const db = drizzle(sqlite, { schema });

export const adapter = drizzleAdapter({
  db,
  dialect: "sqlite",
  debug: false,
});
