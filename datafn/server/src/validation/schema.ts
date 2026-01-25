/**
 * Schema validation primitives and index for DFQL validation
 * Centralizes all schema-bounded lookups to eliminate duplication
 */

import type {
  DatafnSchema,
  DatafnResourceSchema,
  DatafnRelationSchema,
} from "@datafn/core";
import type { DatafnErrorCode } from "@datafn/core";

/**
 * Validation error type - compatible with DatafnError
 */
export type ValidationError = {
  code: DatafnErrorCode;
  message: string;
  path: string;
};

/**
 * Validation result - either success with value or failure with error
 */
export type ValidationResult<T = void> =
  | { ok: true; value: T }
  | { ok: false; error: ValidationError };

/**
 * Create a successful validation result
 */
export function vOk<T>(value: T): ValidationResult<T> {
  return { ok: true, value };
}

/**
 * Create a failed validation result
 */
export function vErr(
  code: DatafnErrorCode,
  message: string,
  path: string,
): ValidationResult<never> {
  return { ok: false, error: { code, message, path } };
}

/**
 * System fields that exist on all resources
 */
export const SYSTEM_FIELDS = new Set([
  "id",
  "createdAt",
  "updatedAt",
  "createdBy",
  "updatedBy",
  "isArchived",
]);

/**
 * System fields that are read-only (clients cannot write)
 */
export const READONLY_SYSTEM_FIELDS = new Set([
  "createdAt",
  "updatedAt",
  "createdBy",
  "updatedBy",
]);

/**
 * Schema index for efficient lookups during validation
 */
export interface SchemaIndex {
  schema: DatafnSchema;
  resourcesByName: Map<string, DatafnResourceSchema>;
  fieldsByResource: Map<string, Set<string>>;
  writableFieldsByResource: Map<string, Set<string>>;
  relationsByResource: Map<string, Set<string>>;
  relationsFromResource: Map<string, DatafnRelationSchema[]>;
}

/**
 * Build an index from a schema for efficient validation lookups
 */
export function buildSchemaIndex(schema: DatafnSchema): SchemaIndex {
  const resourcesByName = new Map<string, DatafnResourceSchema>();
  const fieldsByResource = new Map<string, Set<string>>();
  const writableFieldsByResource = new Map<string, Set<string>>();
  const relationsByResource = new Map<string, Set<string>>();
  const relationsFromResource = new Map<string, DatafnRelationSchema[]>();

  // Index resources and fields
  for (const resource of schema.resources) {
    resourcesByName.set(resource.name, resource);

    // All fields (including system fields)
    const allFields = new Set<string>(SYSTEM_FIELDS);
    const writableFields = new Set<string>();
    writableFields.add("id"); // id is writable on insert
    writableFields.add("isArchived"); // isArchived is writable

    for (const field of resource.fields) {
      allFields.add(field.name);
      if (!field.readonly) {
        writableFields.add(field.name);
      }
    }

    fieldsByResource.set(resource.name, allFields);
    writableFieldsByResource.set(resource.name, writableFields);
    relationsByResource.set(resource.name, new Set());
    relationsFromResource.set(resource.name, []);
  }

  // Index relations
  if (schema.relations) {
    for (const rel of schema.relations) {
      // Handle polymorphic from (can be string or string[])
      const fromResources = Array.isArray(rel.from) ? rel.from : [rel.from];
      const toResources = Array.isArray(rel.to) ? rel.to : [rel.to];

      for (const fromRes of fromResources) {
        if (rel.relation) {
          relationsByResource.get(fromRes)?.add(rel.relation);
        }
        const existing = relationsFromResource.get(fromRes) || [];
        existing.push(rel);
        relationsFromResource.set(fromRes, existing);
      }

      for (const toRes of toResources) {
        if (rel.inverse) {
          relationsByResource.get(toRes)?.add(rel.inverse);
        }
      }
    }
  }

  return {
    schema,
    resourcesByName,
    fieldsByResource,
    writableFieldsByResource,
    relationsByResource,
    relationsFromResource,
  };
}

/**
 * Get a resource by name, returning validation error if not found
 */
export function getResource(
  index: SchemaIndex,
  resourceName: string,
  path: string,
): ValidationResult<DatafnResourceSchema> {
  const resource = index.resourcesByName.get(resourceName);
  if (!resource) {
    return vErr("DFQL_UNKNOWN_RESOURCE", `Unknown resource: ${resourceName}`, path);
  }
  return vOk(resource);
}

/**
 * Validate that a field exists on a resource
 */
export function validateFieldName(
  index: SchemaIndex,
  resourceName: string,
  fieldName: string,
  path: string,
): ValidationResult<void> {
  const fields = index.fieldsByResource.get(resourceName);
  if (!fields) {
    return vErr("DFQL_UNKNOWN_RESOURCE", `Unknown resource: ${resourceName}`, path);
  }
  if (!fields.has(fieldName)) {
    return vErr("DFQL_UNKNOWN_FIELD", `Unknown field: ${fieldName}`, path);
  }
  return vOk(undefined);
}

/**
 * Validate that a field is writable on a resource
 */
export function validateWritableField(
  index: SchemaIndex,
  resourceName: string,
  fieldName: string,
  path: string,
): ValidationResult<void> {
  const fields = index.fieldsByResource.get(resourceName);
  if (!fields) {
    return vErr("DFQL_UNKNOWN_RESOURCE", `Unknown resource: ${resourceName}`, path);
  }
  if (!fields.has(fieldName)) {
    return vErr("DFQL_UNKNOWN_FIELD", `Unknown field: ${fieldName}`, path);
  }
  const writableFields = index.writableFieldsByResource.get(resourceName);
  if (!writableFields?.has(fieldName)) {
    return vErr("DFQL_INVALID", `Field is read-only: ${fieldName}`, path);
  }
  return vOk(undefined);
}

/**
 * Validate that a relation exists on a resource
 */
export function validateRelationName(
  index: SchemaIndex,
  resourceName: string,
  relationName: string,
  path: string,
): ValidationResult<void> {
  const relations = index.relationsByResource.get(resourceName);
  if (!relations) {
    return vErr("DFQL_UNKNOWN_RESOURCE", `Unknown resource: ${resourceName}`, path);
  }
  if (!relations.has(relationName)) {
    return vErr("DFQL_UNKNOWN_RELATION", `Unknown relation: ${relationName}`, path);
  }
  return vOk(undefined);
}

/**
 * Check if a name is a field or relation on a resource
 */
export function isFieldOrRelation(
  index: SchemaIndex,
  resourceName: string,
  name: string,
): "field" | "relation" | null {
  const fields = index.fieldsByResource.get(resourceName);
  const relations = index.relationsByResource.get(resourceName);
  
  if (fields?.has(name)) return "field";
  if (relations?.has(name)) return "relation";
  return null;
}

/**
 * Get target resource for a relation
 */
export function getRelationTarget(
  index: SchemaIndex,
  resourceName: string,
  relationName: string,
): string | null {
  const relations = index.schema.relations || [];
  for (const rel of relations) {
    const fromResources = Array.isArray(rel.from) ? rel.from : [rel.from];
    const toResources = Array.isArray(rel.to) ? rel.to : [rel.to];

    // Check forward relation
    if (fromResources.includes(resourceName) && rel.relation === relationName) {
      return Array.isArray(rel.to) ? rel.to[0] : rel.to;
    }
    // Check inverse relation
    if (toResources.includes(resourceName) && rel.inverse === relationName) {
      return Array.isArray(rel.from) ? rel.from[0] : rel.from;
    }
  }
  return null;
}

/**
 * Get relation definition for a relation name
 */
export function getRelation(
  index: SchemaIndex,
  resourceName: string,
  relationName: string,
): DatafnRelationSchema | null {
  const relations = index.schema.relations || [];
  for (const rel of relations) {
    const fromResources = Array.isArray(rel.from) ? rel.from : [rel.from];
    const toResources = Array.isArray(rel.to) ? rel.to : [rel.to];

    if (fromResources.includes(resourceName) && rel.relation === relationName) {
      return rel;
    }
    if (toResources.includes(resourceName) && rel.inverse === relationName) {
      return rel;
    }
  }
  return null;
}

/**
 * Validate record keys against schema fields
 * Mode: 'write' validates writable fields, 'read' validates all fields
 */
export function validateRecordKeys(
  index: SchemaIndex,
  resourceName: string,
  record: Record<string, unknown>,
  basePath: string,
  mode: "write" | "read" = "write",
): ValidationResult<void> {
  const fields =
    mode === "write"
      ? index.writableFieldsByResource.get(resourceName)
      : index.fieldsByResource.get(resourceName);

  if (!fields) {
    return vErr("DFQL_UNKNOWN_RESOURCE", `Unknown resource: ${resourceName}`, basePath);
  }

  for (const key of Object.keys(record)) {
    // Skip id field for record validation (it's passed separately)
    if (key === "id") continue;
    
    if (!fields.has(key)) {
      return vErr(
        "DFQL_UNKNOWN_FIELD",
        `Unknown field: ${key} on ${resourceName}`,
        `${basePath}.${key}`,
      );
    }
  }

  return vOk(undefined);
}

/**
 * Helper to join paths
 */
export function joinPath(...parts: (string | number | undefined)[]): string {
  return parts
    .filter((p) => p !== undefined && p !== "")
    .map((p, i) => {
      if (typeof p === "number") return `[${p}]`;
      const s = String(p);
      if (i === 0) return s;
      if (s.startsWith("[")) return s;
      return `.${s}`;
    })
    .join("")
    .replace(/^\./g, "");
}
