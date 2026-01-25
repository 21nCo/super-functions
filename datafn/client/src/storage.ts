/**
 * Storage adapter types for local persistence
 */

export type DatafnHydrationState = "notStarted" | "hydrating" | "ready";

export type DatafnChangelogEntry = {
  /** Monotonic local sequence (assigned by storage adapter). */
  seq: number;
  clientId: string;
  mutationId: string;
  mutation: Record<string, unknown>;
  timestampMs: number;
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

  // Join rows (many-many)
  listJoinRows(relationKey: string): Promise<Array<Record<string, unknown>>>;
  getJoinRows(
    relationKey: string,
    fromId: string,
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
}
