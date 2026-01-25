/**
 * Mutation validation for DFQL
 * Validates mutations before execution to ensure schema-bounded correctness
 */

import type { SchemaIndex, ValidationResult, ValidationError } from "./schema.js";
import {
  vOk,
  vErr,
  getResource,
  validateRecordKeys,
  validateRelationName,
  getRelation,
} from "./schema.js";

/**
 * Valid mutation operations
 */
const VALID_OPERATIONS = new Set([
  "insert",
  "merge",
  "replace",
  "delete",
  "relate",
  "modifyRelation",
  "unrelate",
]);

/**
 * Operations that require a record
 */
const RECORD_REQUIRED_OPERATIONS = new Set(["insert", "merge", "replace"]);

/**
 * Validate a single mutation against the schema
 */
export function validateMutation(
  mutation: unknown,
  index: SchemaIndex,
  basePath: string = "$",
): ValidationResult<void> {
  // Must be object
  if (typeof mutation !== "object" || mutation === null || Array.isArray(mutation)) {
    return vErr("DFQL_INVALID", "Invalid DFQL: mutation must be object", basePath);
  }

  const m = mutation as Record<string, unknown>;

  // Validate resource exists
  if (typeof m.resource !== "string") {
    return vErr("DFQL_INVALID", "Invalid DFQL: resource must be string", `${basePath}.resource`);
  }

  const resourceResult = getResource(index, m.resource, `${basePath}.resource`);
  if (!resourceResult.ok) {
    return resourceResult;
  }

  // Validate operation
  if (typeof m.operation !== "string") {
    return vErr("DFQL_INVALID", "Invalid DFQL: operation must be string", `${basePath}.operation`);
  }

  if (!VALID_OPERATIONS.has(m.operation)) {
    return vErr(
      "DFQL_UNSUPPORTED",
      `Unsupported DFQL feature: mutation.operation.${m.operation}`,
      `${basePath}.operation`,
    );
  }

  // Validate id (required for all operations)
  if (typeof m.id !== "string") {
    return vErr("DFQL_INVALID", "Invalid DFQL: id must be string", `${basePath}.id`);
  }

  // Validate id prefix if defined in schema
  const resource = resourceResult.value;
  if (resource.idPrefix && !m.id.startsWith(resource.idPrefix)) {
    return vErr(
      "DFQL_INVALID",
      `Invalid id: must start with "${resource.idPrefix}"`,
      `${basePath}.id`,
    );
  }

  // Validate record for operations that require it
  if (RECORD_REQUIRED_OPERATIONS.has(m.operation)) {
    if (m.record === undefined) {
      return vErr(
        "DFQL_INVALID",
        `Invalid DFQL: ${m.operation} requires record`,
        `${basePath}.record`,
      );
    }

    if (typeof m.record !== "object" || m.record === null || Array.isArray(m.record)) {
      return vErr("DFQL_INVALID", "Invalid DFQL: record must be object", `${basePath}.record`);
    }

    // Validate record keys against schema
    const recordResult = validateRecordKeys(
      index,
      m.resource,
      m.record as Record<string, unknown>,
      `${basePath}.record`,
      "write",
    );
    if (!recordResult.ok) {
      return recordResult;
    }

    // Check required fields for insert/replace
    if (m.operation === "insert" || m.operation === "replace") {
        const resource = resourceResult.value;
        const record = m.record as Record<string, unknown>;
        for (const field of resource.fields) {
            if (field.required && !field.default && field.name !== "id" && !field.readonly) {
                // If required, no default, not id, not readonly (system)
                // Must be present
                if (!(field.name in record) || record[field.name] === null || record[field.name] === undefined) {
                     return vErr(
                        "DFQL_INVALID",
                        `Required field missing: ${field.name}`,
                        `${basePath}.record.${field.name}`,
                      );
                }
            }
        }
    }
  }

  // Validate if guard fields
  if (m.if !== undefined) {
    if (typeof m.if !== "object" || m.if === null || Array.isArray(m.if)) {
      return vErr("DFQL_INVALID", "Invalid DFQL: if must be object", `${basePath}.if`);
    }

    // Validate if fields against schema (guards can reference any readable field)
    const ifResult = validateRecordKeys(
      index,
      m.resource,
      m.if as Record<string, unknown>,
      `${basePath}.if`,
      "read",
    );
    if (!ifResult.ok) {
      return ifResult;
    }
  }

  // Validate relations object for relate/modifyRelation/unrelate
  if (m.relations !== undefined) {
    if (typeof m.relations !== "object" || m.relations === null || Array.isArray(m.relations)) {
      return vErr("DFQL_INVALID", "Invalid DFQL: relations must be object", `${basePath}.relations`);
    }

    const relations = m.relations as Record<string, unknown>;
    for (const relationName of Object.keys(relations)) {
      // Validate relation exists
      const relResult = validateRelationName(
        index,
        m.resource,
        relationName,
        `${basePath}.relations.${relationName}`,
      );
      if (!relResult.ok) {
        return relResult;
      }

      // Validate relation metadata keys if present
      const relationValue = relations[relationName];
      const relDef = getRelation(index, m.resource, relationName);
      
      if (relDef) {
        // Normalize to array for validation
        const items = Array.isArray(relationValue) ? relationValue : [relationValue];
        
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          const itemPath = Array.isArray(relationValue) 
            ? `${basePath}.relations.${relationName}[${i}]`
            : `${basePath}.relations.${relationName}`;

          if (typeof item === "object" && item !== null) {
            const allowedMetaKeys = new Set(relDef.metadata?.map((m) => m.name) || []);
            allowedMetaKeys.add("$ref"); // $ref is always allowed
            
            for (const key of Object.keys(item as Record<string, unknown>)) {
              if (!allowedMetaKeys.has(key)) {
                return vErr(
                  "DFQL_UNKNOWN_FIELD",
                  `Unknown relation metadata key: ${key}`,
                  `${itemPath}.${key}`,
                );
              }
            }
          }
        }
      }
    }
  }

  return vOk(undefined);
}

/**
 * Validate mutation body (single or batch)
 */
export function validateMutationBody(
  body: unknown,
  index: SchemaIndex,
): ValidationResult<{ isBatch: boolean; mutations: Record<string, unknown>[] }> {
  if (typeof body !== "object" || body === null) {
    return vErr("DFQL_INVALID", "Invalid DFQL: expected object or array", "$");
  }

  const isBatch = Array.isArray(body);
  const mutations = isBatch ? (body as unknown[]) : [body];

  for (let i = 0; i < mutations.length; i++) {
    const path = isBatch ? `$[${i}]` : "$";
    const result = validateMutation(mutations[i], index, path);
    if (!result.ok) {
      // Add index to error for batch operations
      if (isBatch) {
        return {
          ok: false,
          error: {
            ...result.error,
            path: result.error.path,
          },
        };
      }
      return result;
    }
  }

  return vOk({
    isBatch,
    mutations: mutations as Record<string, unknown>[],
  });
}

/**
 * Validate mutations for push operation
 * Returns all validation errors (not fail-fast) for batch reporting
 */
export function validatePushMutations(
  mutations: unknown[],
  index: SchemaIndex,
): { valid: boolean; errors: ValidationError[] } {
  const errors: ValidationError[] = [];

  for (let i = 0; i < mutations.length; i++) {
    const mutation = mutations[i];
    const result = validateMutation(mutation, index, `mutations[${i}]`);
    if (!result.ok) {
      errors.push(result.error);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
