/**
 * Shared aggregation computation.
 * Used by both server and client offline aggregate query execution.
 */

/**
 * Calculate an aggregation over a set of records for a given op and field.
 * Null-safe: null/undefined values are excluded from sum/min/max/avg.
 * Returns null for empty sets (SQL semantics).
 */
export function calculateAggregation(
  op: string,
  field: string,
  records: Record<string, unknown>[],
): unknown {
  if (op === "count") {
    // LOW-007 (intentional): count() always returns the total number of records,
    // regardless of the `field` parameter. This matches the client's expectation
    // ("count is not null-filtered — it counts records, not values").
    // If SQL COUNT(field) semantics (null-excluded) are needed in future,
    // add a separate `countNonNull` operation rather than changing this behaviour.
    return records.length;
  }

  const values = records
    .map((r) => r[field])
    .filter((v) => v !== null && v !== undefined);

  if (values.length === 0) return null;

  if (op === "sum") {
    return values.reduce((a, b) => (Number(a) || 0) + (Number(b) || 0), 0);
  }
  if (op === "min") {
    let min = values[0];
    for (const v of values) {
      if (v < min) min = v;
    }
    return min;
  }
  if (op === "max") {
    let max = values[0];
    for (const v of values) {
      if (v > max) max = v;
    }
    return max;
  }
  if (op === "avg") {
    const sum = values.reduce((a, b) => (Number(a) || 0) + (Number(b) || 0), 0);
    return (sum as number) / values.length;
  }
  return null;
}
