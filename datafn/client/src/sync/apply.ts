/**
 * Sync Apply Logic
 *
 * Apply clone/pull results into local storage with hydration state management.
 */

import type { DatafnStorageAdapter, DatafnHydrationState } from "../storage.js";

/**
 * Clone result shape from remote
 */
export type CloneResult = {
  ok: boolean;
  data: Record<string, Array<Record<string, unknown>>>;
  cursors: Record<string, string>;
};

/**
 * Pull result shape from remote
 */
export type PullResult = {
  ok: boolean;
  records: Record<string, Array<Record<string, unknown>>>;
  deleted: Record<string, string[]>;
  cursors: Record<string, string>;
};

/**
 * Apply clone result to local storage.
 * Transitions hydration state: notStarted → hydrating → ready
 */
export async function applyCloneResult(
  storage: DatafnStorageAdapter,
  result: CloneResult,
): Promise<void> {
  if (!result.ok) {
    return; // Don't apply failed results
  }

  const { data, cursors } = result;

  // Process each table
  for (const [resource, records] of Object.entries(data)) {
    // Transition to hydrating state before applying
    await storage.setHydrationState(resource, "hydrating");

    // Upsert all records by id
    for (const record of records) {
      await storage.upsertRecord(resource, record);
    }

    // Set cursor
    const cursor = cursors[resource];
    if (cursor !== undefined) {
      await storage.setCursor(resource, cursor);
    }

    // Transition to ready after applying
    await storage.setHydrationState(resource, "ready");
  }
}

/**
 * Apply pull result to local storage.
 * Updates records, deletes removed records, and updates cursors monotonically.
 */
export async function applyPullResult(
  storage: DatafnStorageAdapter,
  result: PullResult,
): Promise<void> {
  if (!result.ok) {
    return; // Don't apply failed results
  }

  const { records, deleted, cursors } = result;

  // Process record updates
  for (const [resource, resourceRecords] of Object.entries(records)) {
    for (const record of resourceRecords) {
      await storage.upsertRecord(resource, record);
    }
  }

  // Process deletions
  for (const [resource, deletedIds] of Object.entries(deleted)) {
    for (const id of deletedIds) {
      await storage.deleteRecord(resource, id);
    }
  }

  // Update cursors monotonically (only forward)
  for (const [resource, newCursor] of Object.entries(cursors)) {
    await setCursorMonotonically(storage, resource, newCursor);
  }
}

/**
 * Set cursor only if new cursor is greater than existing cursor.
 * Cursors are base-10 integer strings representing serverSeq.
 */
async function setCursorMonotonically(
  storage: DatafnStorageAdapter,
  resource: string,
  newCursor: string,
): Promise<void> {
  const existingCursor = await storage.getCursor(resource);

  // If no existing cursor, set the new one
  if (existingCursor === null) {
    await storage.setCursor(resource, newCursor);
    return;
  }

  // Parse as integers for comparison
  const existingSeq = parseInt(existingCursor, 10);
  const newSeq = parseInt(newCursor, 10);

  // Only update if new cursor is greater (monotonic)
  if (newSeq > existingSeq) {
    await storage.setCursor(resource, newCursor);
  }
}
