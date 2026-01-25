/**
 * Schema Validation
 *
 * Validates and normalizes DataFn schemas according to SCHEMA-001.
 */

import type { DatafnSchema, DatafnResourceSchema } from "./types.js";
import type { DatafnEnvelope } from "./errors.js";
import { ok, err } from "./errors.js";

/**
 * Validates a schema and returns a normalized version.
 *
 * Normalization:
 * - Converts `indices: string[]` to `{ base: string[], search: [], vector: [] }`
 * - Ensures `relations` is present (defaults to [])
 *
 * Validation:
 * - `resources` must be present and be an array
 * - Each resource must have unique `name` and integer `version`
 * - Fields must have unique names within a resource
 */
export function validateSchema(schema: unknown): DatafnEnvelope<DatafnSchema> {
  // Check that schema is an object
  if (typeof schema !== "object" || schema === null || Array.isArray(schema)) {
    return err("SCHEMA_INVALID", "Invalid schema: expected object", {
      path: "$",
    });
  }

  const s = schema as Record<string, unknown>;

  // Check resources exists and is an array
  if (!s.resources || !Array.isArray(s.resources)) {
    return err("SCHEMA_INVALID", "Invalid schema: missing resources", {
      path: "resources",
    });
  }

  const resourceNames = new Set<string>();
  const normalizedResources: DatafnResourceSchema[] = [];

  for (const resource of s.resources) {
    if (
      typeof resource !== "object" ||
      resource === null ||
      Array.isArray(resource)
    ) {
      return err("SCHEMA_INVALID", "Invalid schema: resource must be object", {
        path: "resources",
      });
    }

    const r = resource as Record<string, unknown>;

    // Validate name
    if (typeof r.name !== "string") {
      return err(
        "SCHEMA_INVALID",
        "Invalid schema: resource.name must be string",
        { path: "resources" }
      );
    }

    // Check for duplicate resource names
    if (resourceNames.has(r.name)) {
      return err(
        "SCHEMA_INVALID",
        `Invalid schema: duplicate resource name: ${r.name}`,
        { path: "resources" }
      );
    }
    resourceNames.add(r.name);

    // Validate version
    if (typeof r.version !== "number" || !Number.isInteger(r.version)) {
      return err(
        "SCHEMA_INVALID",
        "Invalid schema: resource.version must be integer",
        { path: "resources" }
      );
    }

    // Validate fields
    if (!Array.isArray(r.fields)) {
      return err(
        "SCHEMA_INVALID",
        "Invalid schema: resource.fields must be array",
        { path: "resources" }
      );
    }

    const fieldNames = new Set<string>();
    for (const field of r.fields) {
      if (typeof field !== "object" || field === null || Array.isArray(field)) {
        return err("SCHEMA_INVALID", "Invalid schema: field must be object", {
          path: "resources",
        });
      }
      const f = field as Record<string, unknown>;
      if (typeof f.name !== "string") {
        return err(
          "SCHEMA_INVALID",
          "Invalid schema: field.name must be string",
          { path: "resources" }
        );
      }
      if (fieldNames.has(f.name)) {
        return err(
          "SCHEMA_INVALID",
          `Invalid schema: duplicate field name: ${f.name}`,
          { path: "resources" }
        );
      }
      fieldNames.add(f.name);
    }

    // Normalize indices
    let normalizedIndices: {
      base: string[];
      search: string[];
      vector: string[];
    };
    if (Array.isArray(r.indices)) {
      normalizedIndices = {
        base: r.indices as string[],
        search: [],
        vector: [],
      };
    } else if (r.indices && typeof r.indices === "object") {
      const idx = r.indices as Record<string, unknown>;
      normalizedIndices = {
        base: (idx.base as string[]) || [],
        search: (idx.search as string[]) || [],
        vector: (idx.vector as string[]) || [],
      };
    } else {
      normalizedIndices = { base: [], search: [], vector: [] };
    }

    normalizedResources.push({
      ...r,
      indices: normalizedIndices,
    } as DatafnResourceSchema);
  }

  // Normalize relations (default to empty array)
  const relations = Array.isArray(s.relations) ? s.relations : [];

  return ok({
    resources: normalizedResources,
    relations: relations as DatafnSchema["relations"],
  });
}
