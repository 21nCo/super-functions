import type { DatafnResourceSchema, DatafnSchema } from "./types.js";

/** Canonical DataFn public-link storage resource name. */
export const PUBLIC_LINK_RESOURCE_NAME = "publicLink";

type DatafnIndexCategories = {
  base?: readonly string[];
  search?: readonly string[];
  vector?: readonly string[];
};

const REQUIRED_PUBLIC_LINK_FIELDS = new Map([
  ["id", { type: "string", required: true }],
  ["principalId", { type: "string", required: true }],
  ["resource", { type: "string", required: true }],
  ["recordId", { type: "string", required: false }],
  ["scope", { type: "string", required: true }],
  ["level", { type: "string", required: true }],
  ["tokenHash", { type: "string", required: true }],
  ["expiresAt", { type: "date", required: false }],
  ["revokedAt", { type: "date", required: false }],
]);

export type DatafnPublicLinkSchemaOptions = {
  modelName?: string;
};

/** Creates the internal DataFn public-link storage resource schema. */
export function createBuiltinPublicLinkResource(
  options: DatafnPublicLinkSchemaOptions = {},
): DatafnResourceSchema {
  const name = options.modelName ?? PUBLIC_LINK_RESOURCE_NAME;
  return {
    name,
    version: 1,
    idPrefix: "publicLink",
    capabilities: ["timestamps", "audit"],
    fields: [
      { name: "id", type: "string", required: true, unique: true },
      { name: "principalId", type: "string", required: true },
      { name: "resource", type: "string", required: true },
      { name: "recordId", type: "string", required: false },
      { name: "scope", type: "string", required: true },
      { name: "level", type: "string", required: true },
      { name: "tokenHash", type: "string", required: true },
      { name: "expiresAt", type: "date", required: false },
      { name: "revokedAt", type: "date", required: false },
    ],
    indices: {
      base: ["principalId", "resource", "recordId", "scope", "revokedAt"],
    },
    permissions: {
      read: { fields: [] },
      write: { fields: [] },
    },
  };
}

/** Ensures a schema contains the internal DataFn public-link storage resource. */
export function ensureBuiltinPublicLinks(
  schema: DatafnSchema,
  options: DatafnPublicLinkSchemaOptions = {},
): DatafnSchema {
  const name = options.modelName ?? PUBLIC_LINK_RESOURCE_NAME;
  const existing = schema.resources.find((resource) => resource.name === name);

  if (existing) {
    validateBuiltinPublicLink(existing, name);
    return schema;
  }

  return {
    ...schema,
    resources: [...schema.resources, createBuiltinPublicLinkResource(options)],
  };
}

function validateBuiltinPublicLink(resource: DatafnResourceSchema, name: string): void {
  if (resource.version !== 1) {
    throw new Error(`Public-link resource version mismatch: expected 1, got ${resource.version}`);
  }

  for (const [fieldName, expected] of REQUIRED_PUBLIC_LINK_FIELDS) {
    const field = resource.fields.find((candidate) => candidate.name === fieldName);
    if (!field) {
      throw new Error(`Public-link resource "${name}" is missing required field "${fieldName}"`);
    }
    if (field.type !== expected.type || field.required !== expected.required) {
      throw new Error(
        `Public-link resource "${name}" field "${fieldName}" is incompatible with the built-in public-link schema`,
      );
    }
  }

  const baseIndices = Array.isArray(resource.indices)
    ? resource.indices
    : resource.indices && !Array.isArray(resource.indices)
      ? (resource.indices as DatafnIndexCategories).base ?? []
      : [];
  for (const fieldName of ["principalId", "resource", "recordId", "scope", "revokedAt"]) {
    if (!baseIndices.includes(fieldName)) {
      throw new Error(`Public-link resource "${name}" must include a "${fieldName}" base index`);
    }
  }
}
