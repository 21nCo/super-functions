/**
 * Storage adapter types for local persistence
 */

export type DatafnHydrationState = "notStarted" | "hydrating" | "ready";

/**
 * Factory function for creating storage adapters with namespace-based isolation.
 * Used for multi-user/multi-tenant data isolation.
 *
 * @example
 * ```typescript
 * const storageFactory: DatafnStorageFactory = (namespace) => {
 *   return IndexedDbStorageAdapter.createForNamespace("my-app", namespace);
 * };
 * ```
 */
export type DatafnStorageFactory = (
  namespace: string,
) => DatafnStorageAdapter;

export type DatafnChangelogEntry = {
  /** Monotonic local sequence (assigned by storage adapter). */
  seq: number;
  clientId: string;
  mutationId: string;
  mutation: Record<string, unknown>;
  timestampMs: number;
  /** Actor ID for audit attribution (when available) - AUD-001 */
  actorId?: string;
  /** ISO 8601 timestamp - AUD-001 */
  timestamp?: string;
};

export interface DatafnStorageAdapter {
  // Records (by resource)
  getRecord(
    resource: string,
    id: string,
  ): Promise<Record<string, unknown> | null>;
  listRecords(resource: string): Promise<Record<string, unknown>[]>;
  upsertRecord(
    resource: string,
    record: Record<string, unknown>,
  ): Promise<void>;
  deleteRecord(resource: string, id: string): Promise<void>;
  
  /** 
   * Atomic read-modify-write merge. MUST execute in a single transaction.
   * If record doesn't exist, upserts with partial as the full record.
   * Uses one-level-deep merge for object-type fields.
   */
  mergeRecord(
    resource: string, 
    id: string, 
    partial: Record<string, unknown>,
    options?: { ifMissing?: Record<string, unknown> },
  ): Promise<Record<string, unknown>>;

  // Join rows (many-many)
  listJoinRows(relationKey: string): Promise<Array<Record<string, unknown>>>;
  getJoinRows(
    relationKey: string,
    fromId: string,
  ): Promise<Array<Record<string, unknown>>>;
  getJoinRowsInverse(
    relationKey: string,
    toId: string,
  ): Promise<Array<Record<string, unknown>>>;
  upsertJoinRow(
    relationKey: string,
    row: Record<string, unknown>,
  ): Promise<void>;
  setJoinRows(
    relationKey: string,
    rows: Array<Record<string, unknown>>,
  ): Promise<void>;
  deleteJoinRow(relationKey: string, from: string, to: string): Promise<void>;

  // Convenience query
  findRecords(
    resource: string,
    field: string,
    value: unknown,
  ): Promise<Record<string, unknown>[]>;

  // Sync state
  getCursor(resource: string): Promise<string | null>;
  setCursor(resource: string, cursor: string | null): Promise<void>;
  getHydrationState(resource: string): Promise<DatafnHydrationState>;
  setHydrationState(
    resource: string,
    state: DatafnHydrationState,
  ): Promise<void>;

  // Offline change log
  changelogAppend(
    entry: Omit<DatafnChangelogEntry, "seq">,
  ): Promise<DatafnChangelogEntry>;
  changelogList(options?: { limit?: number }): Promise<DatafnChangelogEntry[]>;
  changelogAck(options: { throughSeq: number }): Promise<void>;

  // Counts for reconcile (SYNC-007)
  countRecords(resource: string): Promise<number>;
  countJoinRows(relationKey: string): Promise<number>;

  // Lifecycle (CLN-001, CLN-002)
  /** Close all connections and release resources. */
  close(): Promise<void>;
  /** Delete all data across all stores. */
  clearAll(): Promise<void>;

  // Health check (HEAL-001)
  /** 
   * Health check: verify core stores exist and are accessible.
   * Returns { ok: true, issues: [] } when healthy.
   * Returns { ok: false, issues: [...] } when corrupted or inaccessible.
   */
  healthCheck(): Promise<{ ok: boolean; issues: string[] }>;
}
