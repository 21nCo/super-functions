import type { DataStore, JoinRow } from "../store.js";

/**
 * DataStore implementation for guard evaluation
 * EXE-011: Supports multiple resources via addRecords/addJoinRows for cross-resource guard conditions
 */
export class GuardDataStore implements DataStore {
  private recordsByResource: Map<string, Record<string, unknown>[]> = new Map();
  private joinRowsByKey: Map<string, JoinRow[]> = new Map();

  constructor(resource: string, record: Record<string, unknown>) {
    this.recordsByResource.set(resource, [record]);
  }

  /** Add records for a related resource (EXE-011: cross-resource guard evaluation) */
  addRecords(resource: string, records: Record<string, unknown>[]): void {
    this.recordsByResource.set(resource, records);
  }

  /** Add join rows for a relation key (EXE-011: cross-resource guard evaluation) */
  addJoinRows(key: string, rows: JoinRow[]): void {
    this.joinRowsByKey.set(key, rows);
  }

  getRecords(resource: string): Record<string, unknown>[] {
    return this.recordsByResource.get(resource) ?? [];
  }

  getRecord(resource: string, id: string): Record<string, unknown> | null {
    const records = this.recordsByResource.get(resource);
    if (!records) return null;
    return records.find((r) => r.id === id) ?? null;
  }

  getJoinRows(relationKey: string): JoinRow[] {
    return this.joinRowsByKey.get(relationKey) ?? [];
  }

  findRecords(resource: string, field: string, value: unknown): Record<string, unknown>[] {
    const records = this.recordsByResource.get(resource);
    if (!records) return [];
    return records.filter((r) => r[field] === value);
  }
}
