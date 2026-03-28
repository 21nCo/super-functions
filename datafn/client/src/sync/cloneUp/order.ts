import { dfqlKey } from "@datafn/core";

export function sortRecordsById(
  records: Record<string, unknown>[]
): Record<string, unknown>[] {
  return [...records].sort((a, b) =>
    String(a.id).localeCompare(String(b.id))
  );
}

export function sortJoinRows(
  rows: Record<string, unknown>[]
): Record<string, unknown>[] {
  return [...rows].sort((a, b) => {
    const fromCmp = String(a.from).localeCompare(String(b.from));
    if (fromCmp !== 0) return fromCmp;

    const toCmp = String(a.to).localeCompare(String(b.to));
    if (toCmp !== 0) return toCmp;

    const aMeta = extractMeta(a);
    const bMeta = extractMeta(b);
    return dfqlKey(aMeta).localeCompare(dfqlKey(bMeta));
  });
}

function extractMeta(
  row: Record<string, unknown>
): Record<string, unknown> {
  const { from, to, ...meta } = row;
  return meta;
}
