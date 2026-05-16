import type { JsonSchema, SchemaInput } from "../types.js";

export type SchemaType = "zod" | "typebox" | "jsonschema";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function detectSchemaType(schema: SchemaInput): SchemaType {
  if (!isObject(schema)) {
    throw new Error("Unsupported schema type: expected object-like schema");
  }

  if ("_def" in schema) {
    return "zod";
  }

  if (Symbol.for("TypeBox.Kind") in schema) {
    return "typebox";
  }

  return "jsonschema";
}

export function assertJsonSchema(schema: SchemaInput): JsonSchema {
  if (!isObject(schema)) {
    throw new Error("Unsupported schema type: expected object-like schema");
  }

  return schema as JsonSchema;
}
