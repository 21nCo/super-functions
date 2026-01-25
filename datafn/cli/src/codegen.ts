import {
  type DatafnSchema,
  validateSchema,
  unwrapEnvelope,
} from "@datafn/core";

/**
 * Generate TypeScript definitions from a DataFn schema.
 *
 * Generates:
 * - Interfaces for each resource
 * - 'Tables' mapping type
 * - 'TypedClient' type
 *
 * @param schemaInput DataFn schema input (untrusted)
 * @returns TypeScript code string
 */
export function generateTypes(schemaInput: unknown): string {
  // Validate schema first (deterministic rejection via envelope)
  const schema = unwrapEnvelope(validateSchema(schemaInput));

  const lines: string[] = [];

  // Preamble
  lines.push(
    `import type { DatafnClient, DatafnTable } from "@datafn/client";`,
  );
  lines.push("");

  // Sort resources by name to ensure stable output (deterministic)
  // We clone first to avoid mutating input
  const resources = [...schema.resources].sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  // Generate an interface for each resource
  for (const resource of resources) {
    const pascalName = toPascalCase(resource.name);
    lines.push(`export interface ${pascalName} {`);

    // Sort fields for stability
    const fields = [...resource.fields].sort((a, b) =>
      a.name.localeCompare(b.name),
    );

    for (const field of fields) {
      const tsType = mapFieldType(field.type);
      const optional = field.required ? "" : "?";
      lines.push(`  ${field.name}${optional}: ${tsType};`);
    }

    lines.push("}");
    lines.push("");
  }

  // Generate 'Tables' mapping type
  lines.push("export interface Tables {");
  for (const resource of resources) {
    const pascalName = toPascalCase(resource.name);
    lines.push(`  ${resource.name}: ${pascalName};`);
  }
  lines.push("}");
  lines.push("");

  // Generate 'TypedClient'
  lines.push("export type TypedClient = DatafnClient & {");
  for (const resource of resources) {
    const pascalName = toPascalCase(resource.name);
    // Expose table getters directly on client if desired (TV-CODEGEN-001 doesn't strictly verify accessors, just types)
    // But typically typed client might have `task: DatafnTable<Task>`
    lines.push(`  ${resource.name}: DatafnTable<${pascalName}>;`);
  }
  lines.push("};");
  lines.push("");

  return lines.join("\n");
}

function toPascalCase(str: string): string {
  // Simple conversion: task -> Task, my_task -> MyTask
  return str.replace(/(^|_)(\w)/g, (_all, _sep, char) => char.toUpperCase());
}

function mapFieldType(type: string): string {
  switch (type) {
    case "string":
      return "string";
    case "number":
      return "number";
    case "boolean":
      return "boolean";
    case "object":
      return "Record<string, unknown>";
    case "array":
      return "unknown[]";
    case "date":
      return "number"; // timestamp
    case "file":
      return "string"; // url or id
    default:
      return "unknown";
  }
}
