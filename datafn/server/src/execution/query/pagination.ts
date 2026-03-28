/**
 * DFQL pagination logic
 */

import type { SortTerm } from "./sort.js";

/**
 * Apply limit and offset pagination
 */
export function applyLimitOffset(
  records: Record<string, unknown>[],
  limit?: number,
  offset?: number
): Record<string, unknown>[] {
  const start = offset || 0;
  const end = limit == null ? undefined : start + limit;
  return records.slice(start, end);
}

/**
 * Compute nextCursor from results
 */
export function computeNextCursor(
  results: Record<string, unknown>[],
  sortTerms: SortTerm[],
  limit?: number,
): Record<string, unknown> | null {
  if (!limit || results.length === 0) {
    return null;
  }

  // Check if we fetched one extra row (limit + 1)
  // If we did, it means there are more pages.
  // BUT the caller (execute.ts) needs to handle fetching extra row.
  // Here we assume `results` is the full set fetched.
  // Wait, if `execute.ts` fetches `limit + 1`, then `results` here has `limit + 1` items?
  // Or `execute.ts` slices it?
  // `computeNextCursor` usually takes the *sliced* results and a flag "hasMore"?
  // Or it takes raw results and limit.
  // Let's adopt the strategy: Caller fetches limit + 1. Passes all to here.
  // We check length.

  if (results.length > limit) {
    // More pages exist.
    // The cursor is the sort values of the LAST item of the *page* (item at index limit - 1).
    const lastItem = results[limit - 1];
    const cursor: Record<string, unknown> = {};
    for (const term of sortTerms) {
      cursor[term.field] = lastItem[term.field];
    }
    return cursor;
  }

  return null;
}
/**
 * LOW-016: Binary search to efficiently find the first record strictly after `cursor`.
 * Since records are already sorted by `sortTerms`, the predicate isAfterCursor is
 * monotonically non-decreasing: once true, all subsequent records are also true.
 * Time complexity: O(log n) vs the previous O(n) linear scan.
 */
function findFirstAfterCursor(
  records: Record<string, unknown>[],
  cursor: Record<string, unknown>,
  sortTerms: SortTerm[],
): number {
  let lo = 0;
  let hi = records.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (isAfterCursor(records[mid], cursor, sortTerms)) {
      hi = mid;
    } else {
      lo = mid + 1;
    }
  }
  return lo;
}

export function applyCursorAfter(
  records: Record<string, unknown>[],
  cursor: Record<string, unknown>,
  sortTerms: SortTerm[]
): Record<string, unknown>[] {
  const startIdx = findFirstAfterCursor(records, cursor, sortTerms);
  return records.slice(startIdx);
}

/**
 * Check if a record is strictly after the cursor based on sort terms.
 *
 * LOW-017: Null/undefined ordering:
 * - null/undefined record value sorts BEFORE any non-null cursor value (cmp = -1)
 *   so a null record field is "before" any cursor that has a value for that field.
 * - null/undefined cursor value sorts AFTER any non-null record value (cmp = 1)
 *   so a non-null record value is "after" a null cursor position.
 * This matches SQL NULL FIRST (ASC) / NULL LAST (DESC) defaults for most engines.
 */
function isAfterCursor(
  record: Record<string, unknown>,
  cursor: Record<string, unknown>,
  sortTerms: SortTerm[]
): boolean {
  for (const term of sortTerms) {
    const recordVal = record[term.field];
    const cursorVal = cursor[term.field];

    if (recordVal === cursorVal) {
      continue;
    }

    // Compare values
    let cmp = 0;
    if (recordVal === null || recordVal === undefined) {
      // Null record value sorts before any non-null cursor value
      cmp = -1;
    } else if (cursorVal === null || cursorVal === undefined) {
      // Non-null record value sorts after null cursor position
      cmp = 1;
    } else if (typeof recordVal === "string" && typeof cursorVal === "string") {
      cmp = recordVal.localeCompare(cursorVal);
    } else if (typeof recordVal === "number" && typeof cursorVal === "number") {
      cmp = recordVal - cursorVal;
    } else {
      cmp = String(recordVal).localeCompare(String(cursorVal));
    }

    if (cmp !== 0) {
      // For "after" cursor, we want records that come after in sort order
      return term.direction === "asc" ? cmp > 0 : cmp < 0;
    }
  }

  // All values equal - not strictly after
  return false;
}
