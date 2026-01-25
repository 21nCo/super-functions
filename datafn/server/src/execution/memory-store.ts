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

  constructor(data: MemoryStoreData) {
    this.data = data;
  }

  getRecords(resource: string): Record<string, unknown>[] {
    const table = this.data.records[resource];
    if (!table) return [];

    // Return records sorted by id for deterministic ordering
    const ids = Object.keys(table).sort();
    return ids.map((id) => table[id]);
  }

  getRecord(resource: string, id: string): Record<string, unknown> | null {
    const table = this.data.records[resource];
    if (!table) return null;
    return table[id] ?? null;
  }

  getJoinRows(relationKey: string): JoinRow[] {
    return this.data.joins[relationKey] ?? [];
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
  }

  /**
   * Delete a record
   */
  deleteRecord(resource: string, id: string): void {
    if (this.data.records[resource]) {
      delete this.data.records[resource][id];
    }
  }

  /**
   * Set/insert a join row
   */
  setJoinRow(
    relationKey: string,
    from: string,
    to: string,
    metadata: Record<string, unknown>
  ): void {
    if (!this.data.joins[relationKey]) {
      this.data.joins[relationKey] = [];
    }

    // Check if join row already exists
    const existingIndex = this.data.joins[relationKey].findIndex(
      (j) => j.from === from && j.to === to
    );

    const joinRow: JoinRow = { from, to, ...metadata };

    if (existingIndex >= 0) {
      // Update existing
      this.data.joins[relationKey][existingIndex] = joinRow;
    } else {
      // Insert new
      this.data.joins[relationKey].push(joinRow);
    }
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
    if (!this.data.joins[relationKey]) {
      return;
    }

    const joinRow = this.data.joins[relationKey].find(
      (j) => j.from === from && j.to === to
    );

    if (joinRow) {
      // Update metadata
      Object.assign(joinRow, metadata);
    }
  }

  /**
   * Delete a join row
   */
  deleteJoinRow(relationKey: string, from: string, to: string): void {
    if (!this.data.joins[relationKey]) {
      return;
    }

    this.data.joins[relationKey] = this.data.joins[relationKey].filter(
      (j) => !(j.from === from && j.to === to)
    );
  }

  /**
   * Create a snapshot of current store state
   */
  snapshot(): MemoryStoreData {
    // Deep clone the data
    return {
      records: JSON.parse(JSON.stringify(this.data.records)),
      joins: JSON.parse(JSON.stringify(this.data.joins)),
    };
  }

  /**
   * Create a new store from a snapshot
   */
  static fromSnapshot(snapshot: MemoryStoreData): MemoryStore {
    return new MemoryStore({
      records: JSON.parse(JSON.stringify(snapshot.records)),
      joins: JSON.parse(JSON.stringify(snapshot.joins)),
    });
  }

  /**
   * Commit a snapshot to this store
   */
  commitSnapshot(snapshot: MemoryStoreData): void {
    this.data.records = JSON.parse(JSON.stringify(snapshot.records));
    this.data.joins = JSON.parse(JSON.stringify(snapshot.joins));
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
