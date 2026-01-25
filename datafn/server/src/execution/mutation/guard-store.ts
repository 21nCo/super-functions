import type { DataStore, JoinRow } from "../store.js";

/**
 * DataStore implementation for guard evaluation
 * Holds a single primary record and provides minimal support for others
 */
export class GuardDataStore implements DataStore {
  private record: Record<string, unknown>;
  private resource: string;

  constructor(resource: string, record: Record<string, unknown>) {
    this.resource = resource;
    this.record = record;
  }

  getRecords(resource: string): Record<string, unknown>[] {
    // If requesting the resource we have, return it
    if (resource === this.resource) {
      return [this.record];
    }
    // For other resources, we don't have them loaded
    return [];
  }

  getRecord(resource: string, id: string): Record<string, unknown> | null {
    if (resource === this.resource && id === this.record.id) {
      return this.record;
    }
    return null;
  }

  getJoinRows(relationKey: string): JoinRow[] {
    // Join rows not supported in simple GuardDataStore
    return [];
  }
}
