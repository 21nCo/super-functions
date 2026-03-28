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
 * Parse cursor to number
 */
export function parseCursor(cursor: string): number {
  return parseInt(cursor, 10);
}
