/**
 * Cursor management for sync operations
 */

/**
 * Validate cursor is an integer string
 */
export function validateCursor(cursor: unknown): cursor is string {
  if (typeof cursor !== "string") return false;
  // Must be a valid integer string
  return /^\d+$/.test(cursor);
}

/**
 * Generate cursor for a table based on record count
 * For simple implementation, use record count as cursor
 */
export function generateCursor(recordCount: number): string {
  return String(recordCount);
}

/**
 * Generate cursors for all tables
 */
export function generateCursors(
  data: Record<string, unknown[]>
): Record<string, string> {
  const cursors: Record<string, string> = {};

  for (const [tableName, records] of Object.entries(data)) {
    cursors[tableName] = generateCursor(records.length);
  }

  return cursors;
}

/**
 * Parse cursor to number
 */
export function parseCursor(cursor: string): number {
  return parseInt(cursor, 10);
}
