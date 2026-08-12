import { zodToJsonSchema } from "zod-to-json-schema";
import type { JsonSchema, SchemaInput } from "../types.js";

function cleanupZodSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) {
    return schema.map((item) => cleanupZodSchema(item));
  }

  if (!schema || typeof schema !== "object") {
    return schema;
  }

  const input = schema as Record<string, unknown>;
  const output: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(input)) {
    if (key === "$schema") {
      continue;
    }
    output[key] = cleanupZodSchema(value);
  }

  return output;
}

export function convertZodSchema(schema: SchemaInput): JsonSchema {
  const converted = zodToJsonSchema(schema as never, {
    $refStrategy: "none",
    target: "jsonSchema2019-09",
  });

  return cleanupZodSchema(converted) as JsonSchema;
}
