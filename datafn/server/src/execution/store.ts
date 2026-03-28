/**
 * Abstract data store interface for query execution
 */

export interface JoinRow {
  from: string;
  to: string;
  [key: string]: unknown; // metadata fields
}

export interface DataStore {
  /**
   * Get all records for a resource, sorted by id
   */
  getRecords(resource: string): Record<string, unknown>[];

  /**
   * Get a single record by id
   */
  getRecord(resource: string, id: string): Record<string, unknown> | null;

  /**
   * Get join rows for a many-many relation
   * Relation name format: "from.relation" (e.g., "task.tags")
   */
  getJoinRows(relationKey: string): JoinRow[];

  /**
   * PER-005: Targeted lookup — find records where record[field] === value.
   * More efficient than getRecords() + filter for relation filter evaluation.
   */
  findRecords(resource: string, field: string, value: unknown): Record<string, unknown>[];
}
