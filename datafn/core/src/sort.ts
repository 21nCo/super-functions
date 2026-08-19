export interface SortTerm {
  field: string;
  direction: "asc" | "desc";
}

export type SortInputTerm = string | SortTerm;

function isSortDirection(direction: string): direction is SortTerm["direction"] {
  return direction === "asc" || direction === "desc";
}

/**
 * Parse DFQL sort strings into structured sort terms.
 * Handles "field", "field:asc", "field:desc", "-field".
 * Returns [] for undefined or empty input.
 */
export function parseSortTerms(sort: SortInputTerm[] | undefined): SortTerm[] {
  if (!sort || sort.length === 0) return [];

  return sort.map((term) => {
    if (typeof term === "object" && term !== null) {
      const direction = term.direction ?? "asc";
      if (!isSortDirection(direction)) {
        throw new Error(`Invalid sort direction "${direction}" for field "${term.field}"`);
      }
      return { field: term.field, direction };
    }
    if (term.startsWith("-")) {
      return { field: term.slice(1), direction: "desc" };
    }
    const colonIdx = term.indexOf(":");
    if (colonIdx !== -1) {
      const field = term.slice(0, colonIdx);
      const direction = term.slice(colonIdx + 1);
      if (!isSortDirection(direction)) {
        throw new Error(`Invalid sort direction "${direction}" for term "${term}"`);
      }
      return { field, direction };
    }
    return { field: term, direction: "asc" };
  });
}

/**
 * Sort records by the given terms with a stable id tie-breaker.
 * Null values sort after non-null in ascending order (before in descending).
 */
export function sortRecords(
  records: Record<string, unknown>[],
  terms: SortTerm[],
): Record<string, unknown>[] {
  return [...records].sort((a, b) => {
    for (const term of terms) {
      const aVal = a[term.field];
      const bVal = b[term.field];

      if (aVal === bVal) continue;

      let cmp: number;
      if (aVal === null || aVal === undefined) {
        cmp = 1; // nulls after non-null in ascending
      } else if (bVal === null || bVal === undefined) {
        cmp = -1;
      } else if (typeof aVal === "string" && typeof bVal === "string") {
        cmp = aVal.localeCompare(bVal);
      } else if (typeof aVal === "number" && typeof bVal === "number") {
        cmp = aVal - bVal;
      } else {
        cmp = String(aVal).localeCompare(String(bVal));
      }

      if (cmp !== 0) return term.direction === "asc" ? cmp : -cmp;
    }

    // Stable id tie-breaker
    return String(a.id ?? "").localeCompare(String(b.id ?? ""));
  });
}
