import type { JsonSchema, SchemaInput } from "../types.js";
import { assertJsonSchema, detectSchemaType } from "./detect.js";
import { convertTypeBoxSchema } from "./typebox.js";
import { convertZodSchema } from "./zod.js";

export function convertSchema(schema: SchemaInput): JsonSchema {
  const schemaType = detectSchemaType(schema);

  if (schemaType === "zod") {
    return convertZodSchema(schema);
  }

  if (schemaType === "typebox") {
    return convertTypeBoxSchema(schema);
  }

  return assertJsonSchema(schema);
}
