/**
 * In-memory storage adapter for testing and development.
 * Implements deterministic ordering and changelog deduplication.
 */

import type {
  DatafnStorageAdapter,
  DatafnHydrationState,
  DatafnChangelogEntry,
} from "../storage.js";

function validateHydrationState(state: string): DatafnHydrationState {
  if (state !== "notStarted" && state !== "hydrating" && state !== "ready") {
    throw new Error(`Invalid hydration state: ${state}`);
  }
  return state as DatafnHydrationState;
}

function validateTransition(
  from: DatafnHydrationState,
  to: DatafnHydrationState,
): void {
  // Valid transitions:
  // notStarted -> hydrating
  // hydrating -> ready
  // ready -> hydrating (re-sync)
  // notStarted -> ready (maybe? usually via hydrating) - let's stick to strict graph if possible, but usually notStarted->ready might happen if loaded from cache?
  // The spec says: "Valid transitions: notStarted→hydrating, hydrating→ready, ready→hydrating (re-sync)"
  // "Invalid: ready→notStarted, hydrating→notStarted"

  if (from === to) return;

  if (from === "notStarted" && to === "hydrating") return;
  if (from === "hydrating" && to === "ready") return;
  if (from === "ready" && to === "hydrating") return;

  // Additional valid path: initial load might go notStarted -> ready directly if using optimistic?
  // But strictly following spec:
  throw new Error(`Invalid hydration state transition: ${from} -> ${to}`);
}

function validateCursor(cursor: unknown): void {
  if (cursor !== null && typeof cursor !== "string") {
    throw new Error("Invalid cursor format");
  }
}

function validateMutation(mutation: any): void {
  if (!mutation.clientId) throw new Error("Missing clientId in mutation");
  if (!mutation.mutationId) throw new Error("Missing mutationId in mutation");
}

export class MemoryStorageAdapter implements DatafnStorageAdapter {
  private records = new Map<string, Map<string, Record<string, unknown>>>();
  private joinRows = new Map<string, Map<string, Record<string, unknown>>>();
  private cursors = new Map<string, string>();
  private hydration = new Map<string, DatafnHydrationState>();
  private changelog: DatafnChangelogEntry[] = [];
  private changelogSeq = 1;
  private validResources?: Set<string>;

  constructor(resources?: string[]) {
    if (resources) {
      this.validResources = new Set(resources);
    }
  }

  private validateTableName(table: string) {
    if (this.validResources && !this.validResources.has(table)) {
      throw new Error(`Unknown table: ${table}`);
    }
  }

  // --- Records ---

  async getRecord(
    resource: string,
    id: string,
  ): Promise<Record<string, unknown> | null> {
    this.validateTableName(resource);
    const table = this.records.get(resource);
    return table?.get(id) || null;
  }

  async listRecords(resource: string): Promise<Record<string, unknown>[]> {
    this.validateTableName(resource);
    const table = this.records.get(resource);
    if (!table) return [];

    // STORAGE-MEM-001: Deterministic ordering by id:asc
    return Array.from(table.values()).sort((a, b) => {
      const idA = (a.id as string) || "";
      const idB = (b.id as string) || "";
      return idA < idB ? -1 : idA > idB ? 1 : 0;
    });
  }

  async upsertRecord(
    resource: string,
    record: Record<string, unknown>,
  ): Promise<void> {
    this.validateTableName(resource);
    if (!this.records.has(resource)) {
      this.records.set(resource, new Map());
    }
    const id = record.id as string;
    if (!id) throw new Error("Record missing id");
    this.records.get(resource)!.set(id, record);
  }

  async deleteRecord(resource: string, id: string): Promise<void> {
    this.validateTableName(resource);
    const table = this.records.get(resource);
    if (table) {
      table.delete(id);
    }
  }

  // --- Join Rows ---

  async listJoinRows(
    relationKey: string,
  ): Promise<Array<Record<string, unknown>>> {
    // Validate relationKey? It is "Resource.relation".
    // We could validate the resource part if we parse it.
    // But requirement says "validate table names". Join tables are internal?
    // Let's skip strict validation for relationKey for now unless we enforce schema awareness for relations too.
    const table = this.joinRows.get(relationKey);
    if (!table) return [];

    // Deterministic sort by from, to
    return Array.from(table.values()).sort((a, b) => {
      const keyA = `${a.from}:${a.to}`;
      const keyB = `${b.from}:${b.to}`;
      return keyA < keyB ? -1 : keyA > keyB ? 1 : 0;
    });
  }

  async getJoinRows(
    relationKey: string,
    fromId: string,
  ): Promise<Array<Record<string, unknown>>> {
    const table = this.joinRows.get(relationKey);
    if (!table) return [];

    // Filter by fromId and sort by to
    return Array.from(table.values())
      .filter((row) => row.from === fromId)
      .sort((a, b) => {
        const idA = (a.to as string) || "";
        const idB = (b.to as string) || "";
        return idA < idB ? -1 : idA > idB ? 1 : 0;
      });
  }

  async upsertJoinRow(
    relationKey: string,
    row: Record<string, unknown>,
  ): Promise<void> {
    if (!this.joinRows.has(relationKey)) {
      this.joinRows.set(relationKey, new Map());
    }
    // Composite key for storage
    const key = `${row.from}:${row.to}`;
    this.joinRows.get(relationKey)!.set(key, row);
  }

  async setJoinRows(
    relationKey: string,
    rows: Array<Record<string, unknown>>,
  ): Promise<void> {
    if (!this.joinRows.has(relationKey)) {
      this.joinRows.set(relationKey, new Map());
    }
    const table = this.joinRows.get(relationKey)!;
    // This is "set" (replace for these rows? or replace all? "stores join rows")
    // Usually used for syncing/bulk update.
    // Assuming upsert semantics for the provided rows.
    for (const row of rows) {
      const key = `${row.from}:${row.to}`;
      table.set(key, row);
    }
  }

  async deleteJoinRow(
    relationKey: string,
    from: string,
    to: string,
  ): Promise<void> {
    const table = this.joinRows.get(relationKey);
    if (table) {
      table.delete(`${from}:${to}`);
    }
  }

  async findRecords(
    resource: string,
    field: string,
    value: unknown,
  ): Promise<Record<string, unknown>[]> {
    this.validateTableName(resource);
    const table = this.records.get(resource);
    if (!table) return [];

    return Array.from(table.values())
      .filter((r) => r[field] === value)
      .sort((a, b) => {
        const idA = (a.id as string) || "";
        const idB = (b.id as string) || "";
        return idA < idB ? -1 : idA > idB ? 1 : 0;
      });
  }

  // --- Sync State ---

  async getCursor(resource: string): Promise<string | null> {
    this.validateTableName(resource);
    return this.cursors.get(resource) || null;
  }

  async setCursor(resource: string, cursor: string | null): Promise<void> {
    this.validateTableName(resource);
    validateCursor(cursor);
    if (cursor === null) {
      this.cursors.delete(resource);
    } else {
      this.cursors.set(resource, cursor);
    }
  }

  async getHydrationState(resource: string): Promise<DatafnHydrationState> {
    this.validateTableName(resource);
    return this.hydration.get(resource) || "notStarted";
  }

  async setHydrationState(
    resource: string,
    state: DatafnHydrationState,
  ): Promise<void> {
    this.validateTableName(resource);
    validateHydrationState(state);
    const current = this.hydration.get(resource) || "notStarted";
    validateTransition(current, state);
    this.hydration.set(resource, state);
  }

  // --- Changelog ---

  async changelogAppend(
    entry: Omit<DatafnChangelogEntry, "seq">,
  ): Promise<DatafnChangelogEntry> {
    validateMutation(entry);
    // CLIENT-CHANGELOG-001: Deduplicate by (clientId, mutationId)
    const existing = this.changelog.find(
      (e) => e.clientId === entry.clientId && e.mutationId === entry.mutationId,
    );
    if (existing) {
      return existing;
    }

    const newEntry: DatafnChangelogEntry = {
      ...entry,
      seq: this.changelogSeq++,
    };
    this.changelog.push(newEntry);
    return newEntry;
  }

  async changelogList(
    options: { limit?: number } = {},
  ): Promise<DatafnChangelogEntry[]> {
    const limit = options.limit || 100;
    return this.changelog.slice(0, limit); // Already sorted by insertion/seq
  }

  async changelogAck(options: { throughSeq: number }): Promise<void> {
    // Remove acked entries
    this.changelog = this.changelog.filter((e) => e.seq > options.throughSeq);
  }

  // Test helper to clear state
  clear() {
    this.records.clear();
    this.joinRows.clear();
    this.cursors.clear();
    this.hydration.clear();
    this.changelog = [];
    this.changelogSeq = 1;
  }
}
