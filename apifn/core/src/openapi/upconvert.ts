import type { OpenAPIDocument } from "../types.js";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function upconvertNode(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => upconvertNode(item));
  }

  if (!isObject(value)) {
    return value;
  }

  const output: Record<string, unknown> = {};

  for (const [key, nodeValue] of Object.entries(value)) {
    if (key === "nullable" && nodeValue === true) {
      continue;
    }

    output[key] = upconvertNode(nodeValue);
  }

  if (value.nullable === true) {
    const currentType = output.type;

    if (typeof currentType === "string") {
      output.type = [currentType, "null"];
    } else if (Array.isArray(currentType)) {
      const merged = new Set(currentType as unknown[]);
      merged.add("null");
      output.type = Array.from(merged);
    }
  }

  return output;
}

export function upconvertFrom3_0(document: unknown): OpenAPIDocument {
  if (!isObject(document)) {
    throw new Error("Invalid OpenAPI document: expected object");
  }

  const converted = upconvertNode(document) as Record<string, unknown>;
  converted.openapi = "3.1.0";

  return converted as unknown as OpenAPIDocument;
}
