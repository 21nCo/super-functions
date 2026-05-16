import type { JsonSchema, SchemaInput } from "../types.js";

function stripTypeBoxMetadata(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => stripTypeBoxMetadata(item));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const input = value as Record<string, unknown>;
  const output: Record<string, unknown> = {};

  for (const key of Object.keys(input)) {
    output[key] = stripTypeBoxMetadata(input[key]);
  }

  return output;
}

export function convertTypeBoxSchema(schema: SchemaInput): JsonSchema {
  return stripTypeBoxMetadata(schema) as JsonSchema;
}
