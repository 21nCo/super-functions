import type { Adapter, InternalColumnDef } from "@superfunctions/db";

const META_COLUMNS: InternalColumnDef[] = [
  { name: "id", type: "text", primaryKey: true },
  { name: "namespace", type: "text" },
  { name: "next_server_seq", type: "integer" },
];

const CHANGES_COLUMNS: InternalColumnDef[] = [
  { name: "id", type: "text", primaryKey: true },
  { name: "namespace", type: "text" },
  { name: "server_seq", type: "integer" },
  { name: "resource", type: "text" },
  { name: "record_id", type: "text" },
  { name: "op", type: "text" },
  { name: "record", type: "text" },
  { name: "created_at", type: "text" },
];

const IDEMPOTENCY_COLUMNS: InternalColumnDef[] = [
  { name: "id", type: "text", primaryKey: true },
  { name: "namespace", type: "text" },
  { name: "client_id", type: "text" },
  { name: "mutation_id", type: "text" },
  { name: "result", type: "text" },
  { name: "created_at", type: "text" },
];

const SEED_COLUMNS: InternalColumnDef[] = [
  { name: "id", type: "text", primaryKey: true },
  { name: "namespace", type: "text" },
  { name: "seed_id", type: "text" },
  { name: "status", type: "text" },
  { name: "created_at", type: "text" },
];

/**
 * LOW-012: Internal table schemas — index specifications:
 * - __datafn_meta: PK on (id). Used for namespace-scoped sequence tracking.
 * - __datafn_changes: PK on (id). Index on (namespace, server_seq) for sync pull range queries.
 * - __datafn_idempotency: PK on (id). Index on (namespace, client_id, mutation_id) for dedup lookups.
 * - __datafn_seed: PK on (id). Index on (namespace, seed_id) for seed status lookups.
 */
export const INTERNAL_TABLE_SCHEMAS: Record<string, InternalColumnDef[]> = {
  __datafn_meta: META_COLUMNS,
  __datafn_changes: CHANGES_COLUMNS,
  __datafn_idempotency: IDEMPOTENCY_COLUMNS,
  __datafn_seed: SEED_COLUMNS,
};

export async function ensureInternalTable(
  adapter: Adapter,
  tableName: string,
): Promise<void> {
  const columns = INTERNAL_TABLE_SCHEMAS[tableName];
  if (!columns) {
    throw new Error(
      `Unknown internal table: "${tableName}". Expected one of: ${Object.keys(INTERNAL_TABLE_SCHEMAS).join(", ")}`,
    );
  }
  await adapter.internal.ensureTable(tableName, columns);
}
