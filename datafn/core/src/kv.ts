/**
 * Built-in KV resource utilities
 */

import type { DatafnSchema, DatafnResourceSchema } from "./types.js";

/**
 * Canonical KV resource name
 */
export const KV_RESOURCE_NAME = "kv";

const REQUIRED_KV_FIELDS = new Map([
  ["id", { type: "string", required: true }],
  ["value", { type: "json", required: false }],
]);

/**
 * Generate the canonical KV id from a key.
 * Mapping: kvId(key) = "kv:" + key
 */
export function kvId(key: string): string {
  if (typeof key !== "string") {
    throw new Error("Invalid KV key: must be string");
  }
  return `${KV_RESOURCE_NAME}:${key}`;
}

/**
 * Ensure the schema includes the built-in KV resource.
 * If schema already has resource "kv", validates it is compatible.
 * Otherwise appends a resource definition for KV.
 */
export function ensureBuiltinKv(schema: DatafnSchema): DatafnSchema {
  const existingKv = schema.resources.find((r) => r.name === KV_RESOURCE_NAME);

  if (existingKv) {
    if (isBuiltinKvPlaceholder(existingKv)) {
      const canonicalKv = createBuiltinKvResource();
      return {
        ...schema,
        resources: schema.resources.map((resource) =>
          resource.name === KV_RESOURCE_NAME ? canonicalKv : resource,
        ),
      };
    }

    validateBuiltinKv(existingKv);
    return schema;
  }

  // Append KV resource definition
  return {
    ...schema,
    resources: [...schema.resources, createBuiltinKvResource()],
  };
}

function createBuiltinKvResource(): DatafnResourceSchema {
  return {
    name: KV_RESOURCE_NAME,
    version: 1,
    idPrefix: KV_RESOURCE_NAME,
    fields: [
      {
        name: "id",
        type: "string",
        required: true,
      },
      {
        name: "value",
        type: "json",
        required: false,
      },
    ],
    indices: ["id"],
    permissions: {
      read: { fields: ["id", "value"] },
      write: { fields: ["id", "value"] },
    },
  };
}

function isBuiltinKvPlaceholder(resource: DatafnResourceSchema): boolean {
  const fields = resource.fields ?? [];
  const hasNoIdField = !fields.some((field) => field.name === "id");
  const hasOnlyLegacyValueField =
    fields.length === 1 &&
    fields[0]?.name === "value" &&
    fields[0]?.required === false &&
    (fields[0]?.type === "string" ||
      fields[0]?.type === "json" ||
      fields[0]?.type === "object");
  const hasEmptyIndices =
    resource.indices == null ||
    (Array.isArray(resource.indices) && resource.indices.length === 0) ||
    (!Array.isArray(resource.indices) &&
      (resource.indices.base?.length ?? 0) === 0 &&
      (resource.indices.search?.length ?? 0) === 0 &&
      (resource.indices.vector?.length ?? 0) === 0);

  return (
    resource.version === 1 &&
    hasNoIdField &&
    (fields.length === 0 || hasOnlyLegacyValueField) &&
    resource.idPrefix == null &&
    hasEmptyIndices &&
    resource.permissions == null
  );
}

function validateBuiltinKv(resource: DatafnResourceSchema): void {
  if (resource.version !== 1) {
    throw new Error(
      `KV resource version mismatch: expected 1, got ${resource.version}`,
    );
  }

  for (const [fieldName, expected] of REQUIRED_KV_FIELDS) {
    const field = resource.fields.find((candidate) => candidate.name === fieldName);
    if (!field) {
      throw new Error(`KV resource is missing required field "${fieldName}"`);
    }
    if (field.type !== expected.type || field.required !== expected.required) {
      throw new Error(`KV resource field "${fieldName}" is incompatible with the built-in KV schema`);
    }
  }

  const baseIndices = Array.isArray(resource.indices)
    ? resource.indices
    : resource.indices?.base ?? [];
  if (!baseIndices.includes("id")) {
    throw new Error(`KV resource must include an "id" base index`);
  }

  const readFields = resource.permissions?.read?.fields ?? [];
  const writeFields = resource.permissions?.write?.fields ?? [];
  for (const fieldName of ["id", "value"]) {
    if (!readFields.includes(fieldName) || !writeFields.includes(fieldName)) {
      throw new Error(`KV resource permissions must allow read/write access to "${fieldName}"`);
    }
  }
}
