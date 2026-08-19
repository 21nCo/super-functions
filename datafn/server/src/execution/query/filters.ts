/**
 * DFQL filter evaluation — server wrapper around @datafn/core evaluateFilter.
 * Handles $any/$all/$none relation quantifiers (server-specific) and
 * normalizes non-$-prefixed operator names before delegating to core.
 */

import {
  endpointList,
  evaluateFilter as coreEvaluateFilter,
  findRelationMatch,
  firstEndpoint,
  OP_REMAP,
  relationKeyFor,
  relationTargetEndpoint,
  resolveEndpointResource,
  resourceNameFromId,
} from "@datafn/core";

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
  return findRelationMatch(schema, resourceName, relationName) ?? null;
}

function recordResourceName(id: unknown, fallback: string | readonly string[]): string {
  return (
    resolveEndpointResource(fallback, id) ??
    resourceNameFromId(id) ??
    firstEndpoint(fallback)
  );
}

function getRelatedRecords(
  record: any,
  rel: any,
  store: any,
  resourceName: string,
): Record<string, unknown>[] {
  const relation = rel.relation;
  const direction = rel.direction;
  const isForward = direction === "forward";
  const targetEndpoint = relationTargetEndpoint(relation, direction);

  if (relation.type === "many-one") {
    if (isForward) {
      const fk = relation.fkField || relation.foreignKey || `${relation.relation}Id`;
      const targetId = record[fk];
      if (!targetId) return [];
      const target = store.getRecord(recordResourceName(targetId, targetEndpoint), targetId as string);
      return target ? [target] : [];
    } else {
      const fk = relation.fkField || relation.foreignKey || `${relation.relation}Id`;
      return endpointList(targetEndpoint).flatMap((targetResource) =>
        store.findRecords(targetResource, fk, record.id),
      );
    }
  } else if (relation.type === "one-many") {
    if (isForward) {
      const fk = relation.fkField || relation.foreignKey || `${relation.inverse}Id`;
      return endpointList(targetEndpoint).flatMap((targetResource) =>
        store.findRecords(targetResource, fk, record.id),
      );
    } else {
      const fk = relation.fkField || relation.foreignKey || `${relation.inverse}Id`;
      const targetId = record[fk];
      if (!targetId) return [];
      const target = store.getRecord(recordResourceName(targetId, targetEndpoint), targetId as string);
      return target ? [target] : [];
    }
  } else if (relation.type === "many-many") {
    if (isForward) {
      const joinRows = store.getJoinRows(relationKeyFor(resourceName, relation));
      const relatedIds = joinRows
        .filter((row: any) => row.from === record.id)
        .map((row: any) => row.to);
      return relatedIds
        .map((id: unknown) => store.getRecord(recordResourceName(id, targetEndpoint), id as string))
        .filter((target: unknown): target is Record<string, unknown> => Boolean(target));
    } else {
      return endpointList(relation.from).flatMap((fromResource) => {
        const joinRows = store.getJoinRows(relationKeyFor(fromResource, relation));
        return joinRows
          .filter((row: any) => row.to === record.id)
          .map((row: any) => row.from)
          .map((id: unknown) => store.getRecord(recordResourceName(id, targetEndpoint), id as string))
          .filter((target: unknown): target is Record<string, unknown> => Boolean(target));
      });
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
  const targetEndpoint = relationTargetEndpoint(rel.relation, rel.direction);
  const relatedResource = (relatedRecord: Record<string, unknown>) =>
    recordResourceName(relatedRecord.id, targetEndpoint);

  if (ops.$any) {
    const subFilter = ops.$any as Record<string, unknown>;
    return relatedRecords.some((r) =>
      evaluateFilter(r, subFilter, relatedResource(r), schema, store),
    );
  }

  if (ops.$all) {
    const subFilter = ops.$all as Record<string, unknown>;
    if (relatedRecords.length === 0) return false;
    return relatedRecords.every((r) =>
      evaluateFilter(r, subFilter, relatedResource(r), schema, store),
    );
  }

  if (ops.$none) {
    const subFilter = ops.$none as Record<string, unknown>;
    if (relatedRecords.length === 0) return true;
    return !relatedRecords.some((r) =>
      evaluateFilter(r, subFilter, relatedResource(r), schema, store),
    );
  }

  return true;
}
