/**
 * DFQL sorting logic — delegates to @datafn/core with server-specific default sort.
 */

import {
  parseSortTerms as coreParseSort,
  sortRecords as coreSortRecords,
} from "@datafn/core";
import type { SortTerm } from "../../core-types.js";

export type { SortTerm };

export { coreSortRecords as sortRecords };

/**
 * Parse sort terms, defaulting to id:asc when sort is undefined or empty
 * (server requirement: queries always have a deterministic default order).
 */
export function parseSortTerms(sort: string[] | undefined): SortTerm[] {
  const terms = coreParseSort(sort);
  return terms.length > 0 ? terms : [{ field: "id", direction: "asc" }];
}

/**
 * Validate that sort includes id as final term (required for cursor pagination)
 */
export function validateSortForCursor(sortTerms: SortTerm[]): boolean {
  if (sortTerms.length === 0) return false;
  const lastTerm = sortTerms[sortTerms.length - 1];
  return lastTerm.field === "id";
}
