/**
 * DFQL sorting logic
 */

export interface SortTerm {
  field: string;
  direction: "asc" | "desc";
}

/**
 * Parse sort terms from string format
 * Formats: "field", "field:asc", "field:desc"
 */
export function parseSortTerms(sort: string[] | undefined): SortTerm[] {
  if (!sort || sort.length === 0) {
    // Default sort: id:asc
    return [{ field: "id", direction: "asc" }];
  }

  return sort.map((term) => {
    const parts = term.split(":");
    const field = parts[0];
    const direction = (parts[1] as "asc" | "desc") || "asc";
    return { field, direction };
  });
}

/**
 * Sort records based on sort terms
 * Ensures stable deterministic ordering by tie-breaking with id
 */
export function sortRecords(
  records: Record<string, unknown>[],
  sortTerms: SortTerm[]
): Record<string, unknown>[] {
  return [...records].sort((a, b) => {
    for (const term of sortTerms) {
      const aVal = a[term.field];
      const bVal = b[term.field];

      let cmp = 0;

      if (aVal === bVal) {
        continue;
      }

      if (aVal === null || aVal === undefined) {
        cmp = -1;
      } else if (bVal === null || bVal === undefined) {
        cmp = 1;
      } else if (typeof aVal === "string" && typeof bVal === "string") {
        cmp = aVal.localeCompare(bVal);
      } else if (typeof aVal === "number" && typeof bVal === "number") {
        cmp = aVal - bVal;
      } else {
        // Fallback to string comparison
        cmp = String(aVal).localeCompare(String(bVal));
      }

      if (cmp !== 0) {
        return term.direction === "asc" ? cmp : -cmp;
      }
    }

    // Final tie-breaker: id (should always be present)
    const aId = String(a.id || "");
    const bId = String(b.id || "");
    return aId.localeCompare(bId);
  });
}

/**
 * Validate that sort includes id as final term (required for cursor pagination)
 */
export function validateSortForCursor(sortTerms: SortTerm[]): boolean {
  if (sortTerms.length === 0) return false;
  const lastTerm = sortTerms[sortTerms.length - 1];
  return lastTerm.field === "id";
}
