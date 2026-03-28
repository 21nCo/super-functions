/**
 * DFQL filter evaluation — server wrapper around @datafn/core evaluateFilter.
 * Handles $any/$all/$none relation quantifiers (server-specific) and
 * normalizes non-$-prefixed operator names before delegating to core.
 */

import { evaluateFilter as coreEvaluateFilter, OP_REMAP, findRelationBidirectional } from "@datafn/core";

function normalizeOps(value: unknown): unknown {
  if (typeof value !== "object" || value === null) return value;
  // Array shorthand: ["a", "b"] → { $in: ["a", "b"] }
  if (Array.isArray(value)) return { $in: value };
  const ops = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [op, opVal] of Object.entries(ops)) {
    out[OP_REMAP[op] ?? op] = opVal;
  }
  return out;
}

function buildResolver(schema: any, store: any) {
  return (resource: string, recordId: string, relName: string): Record<string, unknown>[] => {
    const rel = findRelation(schema, resource, relName);
    if (!rel) return [];
    const rec = store.getRecord(resource, recordId);
    if (!rec) return [];
    return getRelatedRecords(rec, rel, store, resource);
  };
}

/**
 * Evaluate a filter expression against a record.
 * Handles $any/$all/$none quantifiers server-side; delegates the rest to core.
 */
export function evaluateFilter(
  record: Record<string, unknown>,
  filters: Record<string, unknown>,
  resourceName: string,
  schema: any,
  store: any,
): boolean {
  const resolveRelation = buildResolver(schema, store);

  for (const [key, value] of Object.entries(filters)) {
    // Recurse $and/$or through server's evaluateFilter (handles nested quantifiers)
    if (key === "$and") {
      if (!Array.isArray(value)) return false;
      if (!(value as Record<string, unknown>[]).every((sub) =>
        evaluateFilter(record, sub, resourceName, schema, store)
      )) return false;
      continue;
    }
    if (key === "$or") {
      if (!Array.isArray(value)) return false;
      if (!(value as Record<string, unknown>[]).some((sub) =>
        evaluateFilter(record, sub, resourceName, schema, store)
      )) return false;
      continue;
    }

    // Relation quantifiers: handled server-side
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      const ops = value as Record<string, unknown>;
      if ("$any" in ops || "$all" in ops || "$none" in ops) {
        if (!evaluateRelationFilter(record, key, ops, resourceName, schema, store)) return false;
        continue;
      }
    }

    // Delegate field filters to core (with operator normalization + relation resolver)
    const normalizedValue = normalizeOps(value);
    const fieldFilter = { [key]: normalizedValue };
    if (!coreEvaluateFilter(record, fieldFilter, { resolveRelation, resource: resourceName })) {
      return false;
    }
  }

  return true;
}

function findRelation(schema: any, resourceName: string, relationName: string) {
  if (!schema.relations) return null;
  // EXE-012: Prefer forward (direct) matches to avoid ambiguity when both
  // forward and inverse relations share the same name
  for (const rel of schema.relations) {
    if (rel.from === resourceName && rel.relation === relationName) {
      return rel;
    }
  }
  // Fall back to bidirectional search (handles inverse relations)
  return findRelationBidirectional(schema, resourceName, relationName);
}

function getRelatedRecords(
  record: any,
  rel: any,
  store: any,
  resourceName: string,
): Record<string, unknown>[] {
  const isForward = rel.from === resourceName;

  if (rel.type === "many-one") {
    if (isForward) {
      const fk = rel.fkField || rel.foreignKey;
      const targetId = record[fk];
      if (!targetId) return [];
      const target = store.getRecord(rel.to, targetId as string);
      return target ? [target] : [];
    } else {
      // PER-005: Targeted lookup instead of getRecords() full scan
      const fk = rel.fkField || rel.foreignKey;
      return store.findRecords(rel.from, fk, record.id);
    }
  } else if (rel.type === "one-many") {
    if (isForward) {
      // PER-005: Targeted lookup instead of getRecords() full scan
      const fk = rel.fkField || rel.foreignKey;
      return store.findRecords(rel.to, fk, record.id);
    } else {
      const fk = rel.fkField || rel.foreignKey;
      const targetId = record[fk];
      if (!targetId) return [];
      const target = store.getRecord(rel.from, targetId as string);
      return target ? [target] : [];
    }
  } else if (rel.type === "many-many") {
    const canonicalKey = `${rel.from}.${rel.relation}`;
    const joinRows = store.getJoinRows(canonicalKey);

    if (isForward) {
      const relatedIds = joinRows
        .filter((row: any) => row.from === record.id)
        .map((row: any) => row.to);
      const targets = store.getRecords(rel.to);
      return targets.filter((r: any) => relatedIds.includes(r.id));
    } else {
      const relatedIds = joinRows
        .filter((row: any) => row.to === record.id)
        .map((row: any) => row.from);
      const targets = store.getRecords(rel.from);
      return targets.filter((r: any) => relatedIds.includes(r.id));
    }
  }
  return [];
}

function evaluateRelationFilter(
  record: any,
  relationName: string,
  ops: any,
  resourceName: string,
  schema: any,
  store: any,
): boolean {
  const rel = findRelation(schema, resourceName, relationName);
  if (!rel) return false;

  const relatedRecords = getRelatedRecords(record, rel, store, resourceName);
  const targetResource = rel.from === resourceName ? rel.to : rel.from;

  if (ops.$any) {
    const subFilter = ops.$any as Record<string, unknown>;
    return relatedRecords.some((r) =>
      evaluateFilter(r, subFilter, targetResource as string, schema, store),
    );
  }

  if (ops.$all) {
    const subFilter = ops.$all as Record<string, unknown>;
    if (relatedRecords.length === 0) return false;
    return relatedRecords.every((r) =>
      evaluateFilter(r, subFilter, targetResource as string, schema, store),
    );
  }

  if (ops.$none) {
    const subFilter = ops.$none as Record<string, unknown>;
    if (relatedRecords.length === 0) return true;
    return !relatedRecords.some((r) =>
      evaluateFilter(r, subFilter, targetResource as string, schema, store),
    );
  }

  return true;
}
