/**
 * Offline Relation Operations
 * 
 * Handles relation expansion and mutation operations in offline mode.
 */
import type { DatafnSchema, DatafnRelationSchema } from "@datafn/core";
import { getJoinStoreKey } from "@datafn/core";
import type { DatafnStorageAdapter } from "../storage.js";

// NormalizedRelation, normalizeRelationPayload, and findRelationBidirectional
// are canonical in @datafn/core and are re-exported here for convenience.
export type { NormalizedRelation } from "@datafn/core";
export { normalizeRelationPayload } from "@datafn/core";

/**
 * Expand a relation for a record with sub-selection
 */
export async function expandRelation(
  storage: DatafnStorageAdapter,
  schema: DatafnSchema,
  resource: string,
  record: Record<string, unknown>,
  relationName: string,
  subSelect: string[],
): Promise<unknown> {
  const relation = schema.relations?.find(
    (r) =>
      (r.from === resource && r.relation === relationName) ||
      (r.to === resource && r.inverse === relationName),
  );

  if (!relation) {
    return null;
  }

  // Determine direction
  const isForward =
    relation.from === resource && relation.relation === relationName;
  const targetResource = isForward
    ? (relation.to as string)
    : (relation.from as string);

  // Check for metadata request (# or *#)
  const wantsMetadata = subSelect.some(
    (s) => s === "#" || s === "*#" || s === "#*",
  );
  const wantsExpansion = subSelect.length > 0;

  // 1. Fetch related IDs or Join Rows
  let targetIds: string[] = [];
  let joinRows: Record<string, unknown>[] = [];

  if (relation.type === "many-one") {
    if (isForward) {
      const fk = relation.fkField || `${relationName}Id`;
      const val = record[fk] as string;
      if (val) targetIds.push(val);
    } else {
      // Inverse many-one is one-many behavior
      // fk is on target table.
      const fk = relation.fkField || relation.inverse || `${resource}Id`;
      const records = await storage.findRecords(targetResource, fk, record.id);
      targetIds = records.map((r) => r.id as string);
    }
  } else if (relation.type === "one-many") {
    const fk = relation.fkField || relation.inverse || `${resource}Id`;
    const records = await storage.findRecords(targetResource, fk, record.id);
    targetIds = records.map((r) => r.id as string);
  } else if (relation.type === "many-many") {
    const relationName = relation.relation || "rel";
    const fromResources = Array.isArray(relation.from)
      ? relation.from
      : [relation.from];
    const toResources = Array.isArray(relation.to)
      ? relation.to
      : [relation.to];

    // Determine stores to query based on direction
    const storesToQuery: string[] = [];

    if (isForward) {
      // Forward: We are 'from' (resource). Query all 'to' targets.
      for (const t of toResources) {
        storesToQuery.push(getJoinStoreKey(resource, relationName, t));
      }
    } else {
      // Inverse: We are 'to' (resource). Query all 'from' sources.
      for (const f of fromResources) {
        storesToQuery.push(getJoinStoreKey(f, relationName, resource));
      }
    }

    const allRows: Record<string, unknown>[] = [];
    for (const storeName of storesToQuery) {
      try {
        const rows = isForward
          ? await storage.getJoinRows(storeName, record.id as string)
          : await storage.getJoinRowsInverse(storeName, record.id as string);
        allRows.push(...rows);
      } catch (err) {
        // Store might not exist if lazy created or invalid schema combo
        // Ignore or log? Safe to ignore if we assume consistent schema.
      }
    }

    joinRows = allRows;
    targetIds = allRows.map((r) =>
      isForward ? (r.to as string) : (r.from as string),
    );
  }

  // 2. Return based on request type
  if (!wantsExpansion && relation.type !== "many-many") {
    // Just IDs for many-one?
    // "rel" -> ID or IDs.
    if (relation.type === "many-one" && isForward) return targetIds[0] || null;
    return targetIds;
  }

  if (relation.type === "many-many") {
    if (wantsMetadata && !subSelect.some((s) => s !== "#")) {
      // Only metadata (#)
      return joinRows;
    }
    // If we want expansion, we need to fetch records
  }

  // 3. Fetch records
  const targets = [];
  for (const id of targetIds) {
    const r = await storage.getRecord(targetResource, id);
    if (r) targets.push(r);
  }

  // 4. Attach metadata if needed (many-many *#)
  if (relation.type === "many-many" && wantsMetadata) {
    // Merge metadata
    const merged = targets.map((target) => {
      // Find matching join row
      const match = joinRows.find((row) =>
        isForward ? row.to === target.id : row.from === target.id,
      );
      return { ...target, ...(match || {}) };
    });
    return materializeSelect(
      storage,
      schema,
      targetResource,
      merged,
      subSelect,
    );
  }

  // 5. Materialize
  const result = await materializeSelect(
    storage,
    schema,
    targetResource,
    targets,
    subSelect,
  );

  if (relation.type === "many-one" && isForward) {
    return result[0] || null;
  }
  return result;
}

/**
 * Materialize selection for a list of records
 * Handles nested expansion
 */
export async function materializeSelect(
  storage: DatafnStorageAdapter,
  schema: DatafnSchema,
  resource: string,
  records: Record<string, unknown>[],
  select: string[],
): Promise<Record<string, unknown>[]> {
  // Group tokens
  const expansions = new Map<string, string[]>();
  const baseFields = new Set<string>();

  for (const token of select) {
    if (token === "*" || token === "#" || token === "*#" || token === "#*") {
      baseFields.add("*"); // Keep all fields
      // # implies metadata, which is already merged if we are here?
      // Yes, expandRelation merges it.
      continue;
    }

    if (token.includes(".")) {
      const [base, ...rest] = token.split(".");
      if (!expansions.has(base)) expansions.set(base, []);
      expansions.get(base)!.push(rest.join("."));
    } else {
      // Check if it's a relation (ids only request)
      // We will handle it in expansions with empty subSelect if it is relation.
      // But we need to know if it is a relation or field.
      // We can defer check.
      baseFields.add(token);
    }
  }

  const results = [];
  for (const record of records) {
    const result: Record<string, unknown> = {};

    // Copy fields
    if (baseFields.has("*")) {
      Object.assign(result, record);
    } else {
      result.id = record.id;
      for (const key of baseFields) {
        // Check if relation
        const relation = schema.relations?.find(
          (r) =>
            (r.from === resource && r.relation === key) ||
            (r.to === resource && r.inverse === key),
        );
        if (relation) {
          // Expand as IDs
          result[key] = await expandRelation(
            storage,
            schema,
            resource,
            record,
            key,
            [],
          );
        } else if (key in record) {
          result[key] = record[key];
        }
      }
    }

    // Process expansions
    for (const [key, subSelect] of expansions.entries()) {
      result[key] = await expandRelation(
        storage,
        schema,
        resource,
        record,
        key,
        subSelect,
      );
    }

    results.push(result);
  }

  return results;
}
