/**
 * In-memory storage adapter for testing and development.
 * Implements deterministic ordering and changelog deduplication.
 */

import type {
  DatafnStorageAdapter,
  DatafnHydrationState,
  DatafnChangelogEntry,
} from "../storage.js";
import { KV_RESOURCE_NAME, TIMEZONE_CHANGE_RESOURCE_NAME } from "@datafn/core";
import {
  validateHydrationState,
  validateTransition,
  validateCursor,
} from "./shared.js";

function validateMutation(mutation: any): void {
  if (!mutation.clientId) throw new Error("Missing clientId in mutation");
  if (!mutation.mutationId) throw new Error("Missing mutationId in mutation");
}

function isInternalCursorKey(resource: string): boolean {
  return resource === "__global_cursor__" || resource === "__datafn_actor_feed__";
}

export class MemoryStorageAdapter implements DatafnStorageAdapter {
  readonly capabilities = { atomicMergeIfMissing: true } as const;
  private records = new Map<string, Map<string, Record<string, unknown>>>();
  private joinRows = new Map<string, Map<string, Record<string, unknown>>>();
  private cursors = new Map<string, string>();
  private hydration = new Map<string, DatafnHydrationState>();
  private changelog: DatafnChangelogEntry[] = [];
  private changelogSeq = 1;
  // PER-006: O(1) dedup index keyed by "clientId:mutationId"
  private changelogIndex = new Map<string, DatafnChangelogEntry>();
  private validResources?: Set<string>;

  constructor(resources?: string[]) {
    if (resources) {
      this.validResources = new Set(resources);
      // Ensure built-in KV resource is always valid (KV-001)
      this.validResources.add(KV_RESOURCE_NAME);
      this.validResources.add(TIMEZONE_CHANGE_RESOURCE_NAME);
    }
    // Always create KV store (KV-001)
    this.records.set("kv", new Map());
    this.records.set(TIMEZONE_CHANGE_RESOURCE_NAME, new Map());
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

  /**
   * Atomic read-modify-write merge using one-level-deep merge.
   */
  async mergeRecord(
    resource: string,
    id: string,
    partial: Record<string, unknown>,
    options?: { ifMissing?: Record<string, unknown> },
  ): Promise<Record<string, unknown>> {
    this.validateTableName(resource);
    if (!id) throw new Error("Record missing id");
    let table = this.records.get(resource);
    if (!table) {
      table = new Map();
      this.records.set(resource, table);
    }
    const existing = table.get(id);
    
    // One-level deep merge
    const merged = existing
      ? this.deepMergeOneLevel(existing, partial)
      : { ...(options?.ifMissing ?? partial), id };
    
    merged.id = id;
    table.set(id, merged);
    return merged;
  }

  private deepMergeOneLevel(
    target: Record<string, unknown>,
    source: Record<string, unknown>,
  ): Record<string, unknown> {
    const result = { ...target };
    for (const key of Object.keys(source)) {
      const sv = source[key];
      const tv = target[key];
      if (
        sv !== null &&
        typeof sv === "object" &&
        !Array.isArray(sv) &&
        tv !== null &&
        typeof tv === "object" &&
        !Array.isArray(tv)
      ) {
        // One-level deep merge for objects
        result[key] = { ...tv, ...sv };
      } else {
        // Overwrite for everything else
        result[key] = sv;
      }
    }
    return result;
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

  async getJoinRowsInverse(
    relationKey: string,
    toId: string,
  ): Promise<Array<Record<string, unknown>>> {
    const table = this.joinRows.get(relationKey);
    if (!table) return [];

    // Filter by toId and sort by from
    return Array.from(table.values())
      .filter((row) => row.to === toId)
      .sort((a, b) => {
        const idA = (a.from as string) || "";
        const idB = (b.from as string) || "";
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
    // Skip validation for internal cursor keys (SYNC-CURSOR-001)
    if (!isInternalCursorKey(resource)) {
      this.validateTableName(resource);
    }
    return this.cursors.get(resource) || null;
  }

  async setCursor(resource: string, cursor: string | null): Promise<void> {
    // Skip validation for internal cursor keys (SYNC-CURSOR-001)
    if (!isInternalCursorKey(resource)) {
      this.validateTableName(resource);
    }
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
    // PER-006: O(1) lookup via Map index instead of O(n) .find()
    const dedupeKey = `${entry.clientId}:${entry.mutationId}`;
    const existing = this.changelogIndex.get(dedupeKey);
    if (existing) {
      return existing;
    }

    const newEntry: DatafnChangelogEntry = {
      ...entry,
      seq: this.changelogSeq++,
    };
    this.changelog.push(newEntry);
    this.changelogIndex.set(dedupeKey, newEntry);
    return newEntry;
  }

  async changelogList(
    options: { limit?: number } = {},
  ): Promise<DatafnChangelogEntry[]> {
    const limit = options.limit || 100;
    return this.changelog.slice(0, limit); // Already sorted by insertion/seq
  }

  async changelogAck(options: { throughSeq: number }): Promise<void> {
    // Remove acked entries from both array and index
    const removed = this.changelog.filter((e) => e.seq <= options.throughSeq);
    for (const entry of removed) {
      this.changelogIndex.delete(`${entry.clientId}:${entry.mutationId}`);
    }
    this.changelog = this.changelog.filter((e) => e.seq > options.throughSeq);
  }

  // --- Counts for reconcile (SYNC-007) ---

  async countRecords(resource: string): Promise<number> {
    this.validateTableName(resource);
    const table = this.records.get(resource);
    return table ? table.size : 0;
  }

  async countJoinRows(relationKey: string): Promise<number> {
    const table = this.joinRows.get(relationKey);
    return table ? table.size : 0;
  }

  // --- Lifecycle (CLN-001, CLN-002) ---

  async close(): Promise<void> {
    // Memory adapter has no connections to close
    return Promise.resolve();
  }

  async clearAll(): Promise<void> {
    this.records.clear();
    this.joinRows.clear();
    this.cursors.clear();
    this.hydration.clear();
    this.changelog = [];
    this.changelogSeq = 1;
    this.changelogIndex.clear();
    // Always recreate KV store (KV-001)
    this.records.set("kv", new Map());
  }

  // --- Health Check (HEAL-001) ---

  async healthCheck(): Promise<{ ok: boolean; issues: string[] }> {
    // Memory adapter is always healthy (no external dependencies)
    return { ok: true, issues: [] };
  }
}
