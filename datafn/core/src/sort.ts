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
export function parseSortTerm(term: unknown): SortTerm {
  if (typeof term === "object" && term !== null && !Array.isArray(term)) {
    const field = (term as { field?: unknown }).field;
    const direction = (term as { direction?: unknown }).direction ?? "asc";
    if (typeof field !== "string" || field.length === 0) {
      throw new Error("Invalid sort field");
    }
    if (typeof direction !== "string" || !isSortDirection(direction)) {
      throw new Error(`Invalid sort direction "${String(direction)}" for field "${field}"`);
    }
    return { field, direction };
  }
  if (typeof term !== "string" || term.length === 0) {
    throw new Error("Invalid sort term");
  }
  if (term.startsWith("-")) {
    if (term.length === 1) throw new Error("Invalid sort field");
    return { field: term.slice(1), direction: "desc" };
  }
  const colonIdx = term.indexOf(":");
  if (colonIdx !== -1) {
    const field = term.slice(0, colonIdx);
    const direction = term.slice(colonIdx + 1);
    if (!field) throw new Error("Invalid sort field");
    if (!isSortDirection(direction)) {
      throw new Error(`Invalid sort direction "${direction}" for term "${term}"`);
    }
    return { field, direction };
  }
  return { field: term, direction: "asc" };
}

export function parseSortTerms(sort: SortInputTerm[] | undefined): SortTerm[] {
  if (!sort || sort.length === 0) return [];
  return sort.map(parseSortTerm);
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
