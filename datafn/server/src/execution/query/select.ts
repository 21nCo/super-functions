/**
 * Select token parsing and materialization
 */

import type { DatafnSchema, DatafnRelationSchema } from "@datafn/core";
import type { DataStore } from "../store.js";

export interface SelectToken {
  path: string[]; // e.g., ["tags", "*#"]
  baseName: string; // e.g., "tags"
  directive?: string; // "*", "#", "*#", "**"
}

/**
 * Parse a select token string into components
 * Examples: "id", "goal.*", "tags.#", "tags.*#"
 */
export function parseSelectToken(token: string): SelectToken {
  const parts = token.split(".");
  const baseName = parts[0];
  const directive = parts.slice(1).join(".") || undefined;

  return {
    path: parts,
    baseName,
    directive,
  };
}

/**
 * Apply omit to a record, removing specified fields (but never id)
 */
function applyOmit(
  record: Record<string, unknown>,
  omit: string[] | undefined,
): Record<string, unknown> {
  if (!omit || omit.length === 0) {
    return record;
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    // Never omit id
    if (key === "id" || !omit.includes(key)) {
      // Recursively apply omit to arrays of records
      if (Array.isArray(value)) {
        result[key] = value.map((item) => {
          if (typeof item === "object" && item !== null) {
            return applyOmit(item as Record<string, unknown>, omit);
          }
          return item;
        });
      } else if (
        typeof value === "object" &&
        value !== null &&
        key !== "$relation_metadata"
      ) {
        // Recursively apply omit to nested objects (except metadata)
        result[key] = applyOmit(value as Record<string, unknown>, omit);
      } else {
        result[key] = value;
      }
    }
  }
  return result;
}

/**
 * Check if a token is a nested select traversal (e.g., "tasks.tags.*")
 */
function isNestedSelectToken(token: string): boolean {
  const parts = token.split(".");
  return parts.length > 2;
}

/**
 * Materialize select tokens for a record
 */
export function materializeSelect(
  record: Record<string, unknown>,
  resource: string,
  select: string[] | undefined,
  schema: DatafnSchema,
  store: DataStore,
  omit?: string[],
): Record<string, unknown> {
  const resourceSchema = schema.resources.find((r) => r.name === resource);
  if (!resourceSchema) return { id: record.id };

  // Collect FK field names from relations to auto-omit them
  const fkFieldsToOmit = new Set<string>();
  if (schema.relations) {
    for (const rel of schema.relations) {
      if (rel.from === resource && rel.type === "many-one") {
        const fkField = rel.fkField || `${rel.relation}Id`;
        fkFieldsToOmit.add(fkField);
      }
      // Also check inverse many-one (which is one-many from this resource)
      if (rel.to === resource && rel.type === "one-many") {
        const fkField = rel.fkField || `${rel.inverse}Id`;
        // Don't add FK for inverse, as the FK is on the other side
      }
    }
  }

  // Merge user-provided omit with auto-omitted FK fields
  const effectiveOmit = omit
    ? [...omit, ...Array.from(fkFieldsToOmit)]
    : Array.from(fkFieldsToOmit);

  // If select is omitted, return all schema-defined fields + id
  if (!select || select.length === 0) {
    const result: Record<string, unknown> = { id: record.id };
    for (const field of resourceSchema.fields) {
      if (record[field.name] !== undefined) {
        result[field.name] = record[field.name];
      }
    }
    return applyOmit(result, effectiveOmit);
  }

  const result: Record<string, unknown> = {};
  const includedFields = new Set<string>();

  // Process select tokens
  for (const token of select) {
    // Handle nested select traversal (e.g., "tasks.tags.*")
    if (isNestedSelectToken(token)) {
      const parts = token.split(".");
      const firstRelation = parts[0];
      const restToken = parts.slice(1).join(".");

      const relation = findRelation(schema, resource, firstRelation);
      if (!relation) continue;

      // Check if we already have records for this relation
      const existingRecords = result[firstRelation];

      // Expand first level relation if not already done
      const intermediateRecords =
        existingRecords ||
        expandRelationToRecords(record, relation, schema, store);

      if (!intermediateRecords) continue;

      // For each intermediate record, apply the rest of the select token
      if (Array.isArray(intermediateRecords)) {
        const newRecords = intermediateRecords.map((intermediateRecord) => {
          const nestedResult = materializeSelect(
            intermediateRecord,
            relation.to as string,
            [restToken],
            schema,
            store,
            omit, // Pass user's omit, let each level calculate its own FK fields
          );

          // Merge with existing record if present
          let mergedRecord;
          if (existingRecords && Array.isArray(existingRecords)) {
            const existingRecord = existingRecords.find(
              (r: any) => r.id === intermediateRecord.id,
            );
            if (existingRecord && typeof existingRecord === "object") {
              mergedRecord = { ...existingRecord, ...nestedResult };
            } else {
              mergedRecord = nestedResult;
            }
          } else {
            mergedRecord = nestedResult;
          }

          // Calculate FK fields to omit for target resource
          const targetFkFieldsToOmit = new Set<string>();
          if (schema.relations) {
            for (const rel of schema.relations) {
              // Direct many-one: this resource has FK pointing to another
              if (rel.from === relation.to && rel.type === "many-one") {
                const targetFkField = rel.fkField || `${rel.relation}Id`;
                targetFkFieldsToOmit.add(targetFkField);
              }
              // Inverse one-many: another resource points to this one, so this has FK
              if (rel.to === relation.to && rel.type === "one-many") {
                const targetFkField = rel.fkField || `${rel.inverse}Id`;
                targetFkFieldsToOmit.add(targetFkField);
              }
            }
          }

          // Explicitly remove FK fields from merged record before applying remaining omit
          for (const fkField of targetFkFieldsToOmit) {
            delete mergedRecord[fkField];
          }

          const targetEffectiveOmit = omit ? [...omit] : [];
          return applyOmit(mergedRecord, targetEffectiveOmit);
        });
        result[firstRelation] = newRecords;
      } else {
        // Single record (many-one)
        const nestedResult = materializeSelect(
          intermediateRecords,
          relation.to as string,
          [restToken],
          schema,
          store,
          omit, // Pass user's omit, let each level calculate its own FK fields
        );

        // Merge with existing if present
        if (existingRecords && typeof existingRecords === "object") {
          result[firstRelation] = {
            ...existingRecords,
            ...nestedResult,
          } as Record<string, unknown>;
        } else {
          result[firstRelation] = nestedResult;
        }
      }
      includedFields.add(firstRelation);
      continue;
    }

    const parsed = parseSelectToken(token);

    // Phase 13: HTREE support
    if (parsed.baseName === "parent" || parsed.baseName === "children") {
      const parentPath = record.parentPath;
      if (typeof parentPath !== "string") continue; // Should not happen if validation passed

      if (parsed.baseName === "parent") {
        // Expand ancestors: Root -> Parent
        const path = parentPath || "";
        if (!path) {
          result["parent"] = [];
        } else {
          const ancestorIds = path.split("-");
          const allRecords = store.getRecords(resource);
          const ancestors = ancestorIds
            .map((id) => allRecords.find((r) => r.id === id))
            .filter((r) => r !== undefined) as Record<string, unknown>[];
          result["parent"] = ancestors.map((a) => applyOmit(a, omit));
        }
        includedFields.add("parent");
      } else if (parsed.baseName === "children") {
        const allRecords = store.getRecords(resource);
        const currentId = record.id as string;
        // Construct expected path prefix for children
        const prefix = parentPath ? `${parentPath}-${currentId}` : currentId;

        if (parsed.directive === "*") {
          // Immediate children: path === prefix
          const children = allRecords.filter((r) => {
            const rPath = (r.parentPath as string) || "";
            return rPath === prefix;
          });
          // Sort by id
          children.sort((a, b) =>
            String(a.id || "").localeCompare(String(b.id || "")),
          );
          result["children"] = children.map((c) => applyOmit(c, omit));
        } else if (parsed.directive === "**") {
          // Descendants: path === prefix OR path starts with prefix + "-"
          const descendants = allRecords.filter((r) => {
            const rPath = (r.parentPath as string) || "";
            return rPath === prefix || rPath.startsWith(prefix + "-");
          });

          // Sort by path length (asc), then id (asc)
          descendants.sort((a, b) => {
            const aPath = (a.parentPath as string) || "";
            const bPath = (b.parentPath as string) || "";
            const aLen = aPath ? aPath.split("-").length : 0;
            const bLen = bPath ? bPath.split("-").length : 0;
            if (aLen !== bLen) return aLen - bLen;
            return String(a.id || "").localeCompare(String(b.id || ""));
          });
          result["children"] = descendants.map((d) => applyOmit(d, omit));
        }
        includedFields.add("children");
      }
      continue;
    }

    // Base field (no directive)
    if (!parsed.directive) {
      // Check if it's a relation (ids-only token)
      const relation = findRelation(schema, resource, parsed.baseName);
      if (relation) {
        // ids-only relation token
        result[parsed.baseName] = getRelationIds(record, relation, store);
        includedFields.add(parsed.baseName);
      } else {
        // Regular field
        result[parsed.baseName] = record[parsed.baseName];
        includedFields.add(parsed.baseName);
      }
      continue;
    }

    // Relation expansion
    const relation = findRelation(schema, resource, parsed.baseName);
    if (!relation) continue;

    if (parsed.directive === "*") {
      // Expand relation as records
      result[parsed.baseName] = expandRelation(
        record,
        relation,
        schema,
        store,
        false,
        omit, // Pass user's omit, not effectiveOmit (which has parent's FK fields)
      );
    } else if (parsed.directive === "#") {
      // Emit join rows for many-many
      if (relation.type === "many-many") {
        result[parsed.baseName] = getJoinRows(record, relation, store);
      }
    } else if (parsed.directive === "*#") {
      // Expand relation with metadata for many-many
      if (relation.type === "many-many") {
        result[parsed.baseName] = expandRelation(
          record,
          relation,
          schema,
          store,
          true,
          omit, // Pass user's omit, not effectiveOmit
        );
      }
    }
  }

  // Always include id
  if (!includedFields.has("id")) {
    result.id = record.id;
  }

  return applyOmit(result, effectiveOmit);
}

/**
 * Find a relation by name for a given resource
 */
function findRelation(
  schema: DatafnSchema,
  resource: string,
  relationName: string,
): DatafnRelationSchema | null {
  if (!schema.relations) return null;

  for (const rel of schema.relations) {
    if (rel.from === resource && rel.relation === relationName) {
      return rel;
    }
    if (rel.to === resource && rel.inverse === relationName) {
      // Inverse relation: swap from/to and relation/inverse
      // For one-many -> many-one inversion, keep the same fkField
      // For many-one -> one-many inversion, keep the same fkField
      return {
        ...rel,
        from: rel.to,
        to: rel.from,
        relation: rel.inverse,
        inverse: rel.relation,
        // Type inversion
        type:
          rel.type === "one-many"
            ? "many-one"
            : rel.type === "many-one"
              ? "one-many"
              : rel.type,
        // fkField stays the same
      };
    }
  }

  return null;
}

/**
 * Get relation ids (for ids-only tokens)
 */
function getRelationIds(
  record: Record<string, unknown>,
  relation: DatafnRelationSchema,
  store: DataStore,
): unknown {
  if (relation.type === "many-one") {
    // relation.from is the current resource (has FK)
    // relation.to is the target resource
    const fkField = relation.fkField || `${relation.relation}Id`;
    const relatedId = record[fkField] as string | undefined;
    return relatedId || null;
  }

  if (relation.type === "many-many") {
    const relationKey = `${relation.from}.${relation.relation}`;
    const joinRows = store.getJoinRows(relationKey);
    const recordId = record.id as string;
    const relevantJoins = joinRows.filter((j) => j.from === recordId);
    const sortedJoins = sortJoinRows(relevantJoins, relation);
    return sortedJoins.map((j) => j.to);
  }

  if (relation.type === "one-many") {
    const recordId = record.id as string;
    const allRecords = store.getRecords(relation.to as string);
    const fkField = relation.fkField || `${relation.inverse}Id`;
    const relatedRecords = allRecords.filter((r) => r[fkField] === recordId);
    const sorted = relatedRecords.sort((a, b) => {
      const aId = String(a.id || "");
      const bId = String(b.id || "");
      return aId.localeCompare(bId);
    });
    return sorted.map((r) => r.id);
  }

  return null;
}

/**
 * Expand a relation to records (without applying select filtering)
 * Used for nested select traversal
 */
function expandRelationToRecords(
  record: Record<string, unknown>,
  relation: DatafnRelationSchema,
  schema: DatafnSchema,
  store: DataStore,
): Record<string, unknown> | Record<string, unknown>[] | null {
  if (relation.type === "many-one") {
    const fkField = relation.fkField || `${relation.relation}Id`;
    const relatedId = record[fkField] as string | undefined;
    if (!relatedId) return null;

    const relatedRecord = store.getRecord(relation.to as string, relatedId);
    if (!relatedRecord) return null;

    return relatedRecord;
  }

  if (relation.type === "many-many") {
    const relationKey = `${relation.from}.${relation.relation}`;
    const joinRows = store.getJoinRows(relationKey);
    const recordId = record.id as string;
    const relevantJoins = joinRows.filter((j) => j.from === recordId);
    const sortedJoins = sortJoinRows(relevantJoins, relation);

    return sortedJoins
      .map((join) => {
        const relatedRecord = store.getRecord(
          relation.to as string,
          join.to as string,
        );
        return relatedRecord;
      })
      .filter((r) => r !== null) as Record<string, unknown>[];
  }

  if (relation.type === "one-many") {
    const recordId = record.id as string;
    const allRecords = store.getRecords(relation.to as string);
    const fkField = relation.fkField || `${relation.inverse}Id`;
    const relatedRecords = allRecords.filter((r) => r[fkField] === recordId);
    const sorted = relatedRecords.sort((a, b) => {
      const aId = String(a.id || "");
      const bId = String(b.id || "");
      return aId.localeCompare(bId);
    });
    return sorted;
  }

  return null;
}

/**
 * Expand a relation to related records
 */
function expandRelation(
  record: Record<string, unknown>,
  relation: DatafnRelationSchema,
  schema: DatafnSchema,
  store: DataStore,
  includeMetadata: boolean,
  omit?: string[],
): unknown {
  if (relation.type === "many-one") {
    // Get related record via foreign key
    const fkField = relation.fkField || `${relation.relation}Id`;
    const relatedId = record[fkField] as string | undefined;
    if (!relatedId) return null;

    const relatedRecord = store.getRecord(relation.to as string, relatedId);
    if (!relatedRecord) return null;

    // Calculate FK fields to omit for the TARGET resource
    const targetFkFieldsToOmit = new Set<string>();
    if (schema.relations) {
      for (const rel of schema.relations) {
        if (rel.from === relation.to && rel.type === "many-one") {
          const targetFkField = rel.fkField || `${rel.relation}Id`;
          targetFkFieldsToOmit.add(targetFkField);
        }
      }
    }
    const targetEffectiveOmit = omit
      ? [...omit, ...Array.from(targetFkFieldsToOmit)]
      : Array.from(targetFkFieldsToOmit);

    // Return full record for many-one
    const targetResource = schema.resources.find((r) => r.name === relation.to);
    if (!targetResource) return relatedRecord;

    const result: Record<string, unknown> = { id: relatedRecord.id };
    for (const field of targetResource.fields) {
      if (relatedRecord[field.name] !== undefined) {
        result[field.name] = relatedRecord[field.name];
      }
    }
    return applyOmit(result, targetEffectiveOmit);
  }

  if (relation.type === "many-many") {
    const relationKey = `${relation.from}.${relation.relation}`;
    const joinRows = store.getJoinRows(relationKey);
    const recordId = record.id as string;

    // Filter join rows for this record
    const relevantJoins = joinRows.filter((j) => j.from === recordId);

    // Sort by order metadata if present, then by to/id
    const sortedJoins = sortJoinRows(relevantJoins, relation);

    if (!includeMetadata) {
      // Return array of related records
      return sortedJoins
        .map((join) => {
          const relatedRecord = store.getRecord(
            relation.to as string,
            join.to as string,
          );
          if (!relatedRecord) return null;

          const targetResource = schema.resources.find(
            (r) => r.name === relation.to,
          );
          if (!targetResource) return relatedRecord;

          const result: Record<string, unknown> = { id: relatedRecord.id };
          for (const field of targetResource.fields) {
            if (relatedRecord[field.name] !== undefined) {
              result[field.name] = relatedRecord[field.name];
            }
          }
          return applyOmit(result, omit);
        })
        .filter((r) => r !== null);
    } else {
      // Return array of related records with $relation_metadata
      return sortedJoins
        .map((join) => {
          const relatedRecord = store.getRecord(
            relation.to as string,
            join.to as string,
          );
          if (!relatedRecord) return null;

          const targetResource = schema.resources.find(
            (r) => r.name === relation.to,
          );
          if (!targetResource) return relatedRecord;

          const result: Record<string, unknown> = { id: relatedRecord.id };
          for (const field of targetResource.fields) {
            if (relatedRecord[field.name] !== undefined) {
              result[field.name] = relatedRecord[field.name];
            }
          }

          // Add metadata
          const metadata: Record<string, unknown> = {};
          if (relation.metadata) {
            for (const metaField of relation.metadata) {
              if (join[metaField.name] !== undefined) {
                metadata[metaField.name] = join[metaField.name];
              }
            }
          }
          result.$relation_metadata = metadata;

          return applyOmit(result, omit);
        })
        .filter((r) => r !== null);
    }
  }

  // one-many: inverse of many-one
  if (relation.type === "one-many") {
    const recordId = record.id as string;
    const allRecords = store.getRecords(relation.to as string);
    const fkField = relation.fkField || `${relation.inverse}Id`;

    const relatedRecords = allRecords.filter((r) => r[fkField] === recordId);

    // Sort by id for deterministic ordering
    const sorted = relatedRecords.sort((a, b) => {
      const aId = String(a.id || "");
      const bId = String(b.id || "");
      return aId.localeCompare(bId);
    });

    // Calculate FK fields for target resource
    const targetFkFieldsToOmit = new Set<string>();
    if (schema.relations) {
      for (const rel of schema.relations) {
        if (rel.from === relation.to && rel.type === "many-one") {
          const targetFkField = rel.fkField || `${rel.relation}Id`;
          targetFkFieldsToOmit.add(targetFkField);
        }
      }
    }
    const targetEffectiveOmit = omit
      ? [...omit, ...Array.from(targetFkFieldsToOmit)]
      : Array.from(targetFkFieldsToOmit);

    const targetResource = schema.resources.find((r) => r.name === relation.to);
    if (!targetResource) return sorted;

    return sorted.map((relatedRecord) => {
      const result: Record<string, unknown> = { id: relatedRecord.id };
      for (const field of targetResource.fields) {
        if (relatedRecord[field.name] !== undefined) {
          result[field.name] = relatedRecord[field.name];
        }
      }
      return applyOmit(result, targetEffectiveOmit);
    });
  }

  return null;
}

/**
 * Get join rows for a many-many relation
 */
function getJoinRows(
  record: Record<string, unknown>,
  relation: DatafnRelationSchema,
  store: DataStore,
): unknown[] {
  const relationKey = `${relation.from}.${relation.relation}`;
  const joinRows = store.getJoinRows(relationKey);
  const recordId = record.id as string;

  const relevantJoins = joinRows.filter((j) => j.from === recordId);
  const sorted = sortJoinRows(relevantJoins, relation);

  // Return join rows with from, to, and metadata
  return sorted.map((join) => {
    const result: Record<string, unknown> = {
      from: join.from,
      to: join.to,
    };

    if (relation.metadata) {
      for (const metaField of relation.metadata) {
        if (join[metaField.name] !== undefined) {
          result[metaField.name] = join[metaField.name];
        }
      }
    }

    return result;
  });
}

/**
 * Sort join rows by order metadata (if present) then by to
 */
function sortJoinRows(
  joins: Array<Record<string, unknown>>,
  relation: DatafnRelationSchema,
): Array<Record<string, unknown>> {
  const hasOrderMetadata = relation.metadata?.some(
    (m) => m.name === "order" && m.type === "number",
  );

  return [...joins].sort((a, b) => {
    if (hasOrderMetadata) {
      const aOrder = a.order as number;
      const bOrder = b.order as number;
      if (aOrder !== bOrder) {
        return aOrder - bOrder;
      }
    }

    // Tie-break by to
    const aTo = String(a.to || "");
    const bTo = String(b.to || "");
    return aTo.localeCompare(bTo);
  });
}
