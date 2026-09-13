import type { ErrorObject } from "ajv";

import type { McpFnSchemaIssue } from "./types.js";

const MAX_STRUCTURAL_FIELD_LENGTH = 256;

function boundedStructuralField(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length === 0) return undefined;
  return value.slice(0, MAX_STRUCTURAL_FIELD_LENGTH);
}

/** Convert Ajv failures into a stable, value-free public diagnostic shape. */
export function formatMcpFnSchemaIssues(
  errors: ErrorObject[] | null | undefined,
): McpFnSchemaIssue[] {
  return (errors ?? []).slice(0, 100).map((error) => {
    const rawPath = error.instancePath || "/";
    // A long path is omitted rather than truncated into an invalid JSON pointer.
    const instancePath = rawPath.length <= MAX_STRUCTURAL_FIELD_LENGTH ? rawPath : "/";
    const params = error.params as Record<string, unknown>;
    const rejectedProperty =
      error.keyword === "additionalProperties"
        ? boundedStructuralField(params.additionalProperty)
        : undefined;
    const missingProperty =
      error.keyword === "required"
        ? boundedStructuralField(params.missingProperty)
        : undefined;
    return {
      path: instancePath,
      instancePath,
      schemaPath: typeof error.schemaPath === "string" && error.schemaPath.length > 0 && error.schemaPath.length <= 256 ? error.schemaPath : "#",
      keyword: boundedStructuralField(error.keyword) ?? "validation",
      message:
        boundedStructuralField(error.message) ?? "Schema validation failed",
      ...(rejectedProperty ? { rejectedProperty } : {}),
      ...(missingProperty ? { missingProperty } : {}),
    };
  });
}
