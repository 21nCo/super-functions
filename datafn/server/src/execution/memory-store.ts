/**
 * In-memory data store implementation
 */

import type { DataStore, JoinRow } from "./store.js";

export interface MemoryStoreData {
  records: Record<string, Record<string, Record<string, unknown>>>; // table -> id -> record
  joins: Record<string, JoinRow[]>; // "table.relation" -> join rows
}

export class MemoryStore implements DataStore {
  private data: MemoryStoreData;
  // SRV-014: Cache sorted key arrays; invalidated on every write to that resource
  private sortedKeysCaches: Map<string, string[]> = new Map();
  // EXE-002: Map-based join store for O(1) setJoinRow; outer key = relationKey
  private joinStore: Map<string, Map<string, JoinRow>> = new Map();

  constructor(data: MemoryStoreData) {
    this.data = data;
    // Initialise joinStore from any pre-existing data.joins
    for (const [key, rows] of Object.entries(data.joins)) {
      const rowMap = new Map<string, JoinRow>();
      for (const row of rows) {
        rowMap.set(`${row.from}:${row.to}`, row);
      }
      this.joinStore.set(key, rowMap);
    }
  }

  getRecords(resource: string): Record<string, unknown>[] {
    const table = this.data.records[resource];
    if (!table) return [];

    // SRV-014: Use cached sorted keys; rebuild only after a write
    let ids = this.sortedKeysCaches.get(resource);
    if (!ids) {
      ids = Object.keys(table).sort();
      this.sortedKeysCaches.set(resource, ids);
    }
    return ids.map((id) => table[id]);
  }

  getRecord(resource: string, id: string): Record<string, unknown> | null {
    const table = this.data.records[resource];
    if (!table) return null;
    return table[id] ?? null;
  }

  getJoinRows(relationKey: string): JoinRow[] {
    const rowMap = this.joinStore.get(relationKey);
    if (rowMap) return Array.from(rowMap.values());
    return this.data.joins[relationKey] ?? [];
  }

  /**
   * PER-005: Targeted lookup — find records where record[field] === value.
   */
  findRecords(resource: string, field: string, value: unknown): Record<string, unknown>[] {
    const table = this.data.records[resource];
    if (!table) return [];
    return Object.values(table).filter(r => r[field] === value);
  }

  /**
   * Set/update a record
   */
  setRecord(
    resource: string,
    id: string,
    record: Record<string, unknown>
  ): void {
    if (!this.data.records[resource]) {
      this.data.records[resource] = {};
    }
    this.data.records[resource][id] = record;
    // SRV-014: Invalidate sorted key cache on write
    this.sortedKeysCaches.delete(resource);
  }

  /**
   * Delete a record
   */
  deleteRecord(resource: string, id: string): void {
    if (this.data.records[resource]) {
      delete this.data.records[resource][id];
      // SRV-014: Invalidate sorted key cache on write
      this.sortedKeysCaches.delete(resource);
    }
  }

  /**
   * Set/insert a join row
   * EXE-002: O(1) via Map index instead of O(n) findIndex
   */
  setJoinRow(
    relationKey: string,
    from: string,
    to: string,
    metadata: Record<string, unknown>
  ): void {
    if (!this.joinStore.has(relationKey)) {
      this.joinStore.set(relationKey, new Map());
    }
    const rowMap = this.joinStore.get(relationKey)!;
    const compositeKey = `${from}:${to}`;
    const joinRow: JoinRow = { from, to, ...metadata };
    rowMap.set(compositeKey, joinRow);
    // Keep data.joins in sync for snapshot/fromSnapshot round-trip
    this.data.joins[relationKey] = Array.from(rowMap.values());
  }

  /**
   * Update join row metadata
   */
  updateJoinRow(
    relationKey: string,
    from: string,
    to: string,
    metadata: Record<string, unknown>
  ): void {
    const rowMap = this.joinStore.get(relationKey);
    if (!rowMap) return;
    const compositeKey = `${from}:${to}`;
    const existing = rowMap.get(compositeKey);
    if (existing) {
      Object.assign(existing, metadata);
      // Sync to data.joins
      this.data.joins[relationKey] = Array.from(rowMap.values());
    }
  }

  /**
   * Delete a join row
   * EXE-002: O(1) via Map deletion; also keeps data.joins in sync
   */
  deleteJoinRow(relationKey: string, from: string, to: string): void {
    const rowMap = this.joinStore.get(relationKey);
    if (rowMap) {
      rowMap.delete(`${from}:${to}`);
      this.data.joins[relationKey] = Array.from(rowMap.values());
    } else if (this.data.joins[relationKey]) {
      this.data.joins[relationKey] = this.data.joins[relationKey].filter(
        (j) => !(j.from === from && j.to === to)
      );
    }
  }

  /**
   * Create a snapshot of current store state
   */
  snapshot(): MemoryStoreData {
    // Deep clone the data
    return {
      records: structuredClone(this.data.records),
      joins: structuredClone(this.data.joins),
    };
  }

  /**
   * Create a new store from a snapshot
   */
  static fromSnapshot(snapshot: MemoryStoreData): MemoryStore {
    return new MemoryStore({
      records: structuredClone(snapshot.records),
      joins: structuredClone(snapshot.joins),
    });
  }

  /**
   * Commit a snapshot to this store
   */
  commitSnapshot(snapshot: MemoryStoreData): void {
    this.data.records = structuredClone(snapshot.records);
    this.data.joins = structuredClone(snapshot.joins);
  }

  /**
   * Helper to create a store from fixture data
   */
  static fromFixture(fixture: {
    records: Record<string, Array<Record<string, unknown>>>;
    joins: Record<string, JoinRow[]>;
  }): MemoryStore {
    const records: Record<string, Record<string, Record<string, unknown>>> = {};

    // Convert array of records to id-keyed maps
    for (const [table, rows] of Object.entries(fixture.records)) {
      records[table] = {};
      for (const row of rows) {
        const id = row.id as string;
        records[table][id] = row;
      }
    }

    return new MemoryStore({
      records,
      joins: fixture.joins,
    });
  }
}
