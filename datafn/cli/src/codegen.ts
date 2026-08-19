import {
  type DatafnFieldSchema,
  type DatafnRelationSchema,
  type DatafnSchema,
  validateSchema,
  unwrapEnvelope,
  RELATION_CAPABILITY_FIELD_DEFS,
  getRelationJoinTableName,
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
  lines.push("// @ts-nocheck");
  lines.push(
    `import type { DatafnClient, DatafnTable } from "@datafn/client";`,
  );
  lines.push("");

  // Sort resources by name to ensure stable output (deterministic)
  // We clone first to avoid mutating input
  const resources = [...schema.resources].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  const relationFieldsByResource = buildRelationFieldsByResource(schema);

  // Generate an interface for each resource
  for (const resource of resources) {
    const pascalName = toPascalCase(resource.name);
    lines.push(`export interface ${pascalName} {`);

    // Sort fields for stability
    const declaredFieldNames = new Set(resource.fields.map((field) => field.name));
    const generatedFieldNames = new Set<string>();
    const relationFields = (relationFieldsByResource.get(resource.name) ?? []).filter((field) => {
      if (declaredFieldNames.has(field.name) || generatedFieldNames.has(field.name)) {
        return false;
      }
      generatedFieldNames.add(field.name);
      return true;
    });
    const fields = ensureIdField([...resource.fields, ...relationFields]).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    const hasShareable =
      Array.isArray(resource.capabilities) &&
      resource.capabilities.some(
        (cap) => typeof cap === "object" && cap !== null && "shareable" in cap,
      );
    if (hasShareable && !fields.some((field) => field.name === "visibility")) {
      // Compatibility fallback: ensure visibility exists for share-enabled resources.
      fields.push({
        name: "visibility",
        type: "string",
        required: false,
        nullable: true,
        readonly: true,
      });
      fields.sort((a, b) => a.name.localeCompare(b.name));
    }

    for (const field of fields) {
      const effectiveField =
        hasShareable && field.name === "visibility"
          ? { ...field, readonly: true, nullable: true }
          : field;
      lines.push(`  ${renderInterfaceField(effectiveField)}`);
    }

    lines.push("}");
    lines.push("");
  }

  // Generate interfaces for many-many join tables with metadata
  const relations = schema.relations ?? [];
  const joinTableInterfaces: Array<{ name: string; pascalName: string }> = [];

  for (const rel of relations) {
    // JCG-002: emit join interface when metadata OR relation capabilities are present
    const hasMetadata = rel.metadata && rel.metadata.length > 0;
    const hasCapabilities = rel.capabilities && rel.capabilities.length > 0;
    const hasPolymorphicFrom = Array.isArray(rel.from) && rel.from.length > 1;
    const hasPolymorphicTo = Array.isArray(rel.to) && rel.to.length > 1;
    const metadataFieldNames = new Set((rel.metadata ?? []).map((field) => field.name));
    if (
      rel.type !== "many-many" ||
      (!hasMetadata && !hasCapabilities && !hasPolymorphicFrom && !hasPolymorphicTo)
    ) {
      continue;
    }

    const jtName = getRelationJoinTableName(rel);
    const pascalName = toPascalCase(jtName);
    const fromCol = rel.joinColumns?.from ?? "from";
    const toCol = rel.joinColumns?.to ?? "to";

    lines.push(`export interface ${pascalName} {`);
    lines.push(`  ${renderTsPropertyName(fromCol)}: string;`);
    if (hasPolymorphicFrom && !metadataFieldNames.has("fromResource")) {
      lines.push(`  fromResource: string;`);
    }
    lines.push(`  ${renderTsPropertyName(toCol)}: string;`);
    if (hasPolymorphicTo && !metadataFieldNames.has("toResource")) {
      lines.push(`  toResource: string;`);
    }

    // Sort metadata fields for stability
    if (hasMetadata) {
      const sortedMeta = [...rel.metadata!].sort((a, b) => a.name.localeCompare(b.name));
      for (const meta of sortedMeta) {
        const tsType = mapFieldType(meta.type, false);
        lines.push(`  ${renderTsPropertyName(meta.name)}: ${tsType};`);
      }
    }

    // JCG-002: Add relation capability fields in canonical order
    if (hasCapabilities) {
      const canonicalCaps = (["timestamps", "audit"] as const).filter(
        (cap) => (rel.capabilities as string[]).includes(cap),
      );
      for (const cap of canonicalCaps) {
        for (const fieldDef of RELATION_CAPABILITY_FIELD_DEFS[cap]) {
          const tsType = mapFieldType(fieldDef.type, fieldDef.nullable === true);
          lines.push(`  readonly ${renderTsPropertyName(fieldDef.name)}?: ${tsType};`);
        }
      }
    }

    lines.push("}");
    lines.push("");

    joinTableInterfaces.push({ name: jtName, pascalName });
  }

  // Generate 'Tables' mapping type
  lines.push("export interface Tables {");
  for (const resource of resources) {
    const pascalName = toPascalCase(resource.name);
    lines.push(`  ${renderTsPropertyName(resource.name)}: ${pascalName};`);
  }
  for (const jt of joinTableInterfaces) {
    lines.push(`  ${renderTsPropertyName(jt.name)}: ${jt.pascalName};`);
  }
  lines.push("}");
  lines.push("");

  // Generate 'TypedClient'
  lines.push("export type TypedClient = DatafnClient & {");
  for (const resource of resources) {
    const pascalName = toPascalCase(resource.name);
    // Expose table getters directly on client if desired (TV-CODEGEN-001 doesn't strictly verify accessors, just types)
    // But typically typed client might have `task: DatafnTable<Task>`
    lines.push(`  ${renderTsPropertyName(resource.name)}: DatafnTable<${pascalName}>;`);
  }
  lines.push("};");
  lines.push("");

  return lines.join("\n");
}

function endpointList(endpoint: string | readonly string[]): string[] {
  return typeof endpoint === "string" ? [endpoint] : [...endpoint];
}

function firstEndpoint(endpoint: string | readonly string[]): string {
  return endpointList(endpoint)[0] ?? "";
}

function fkFieldForOneMany(relation: DatafnRelationSchema): string {
  return relation.fkField || relation.inverse || `${firstEndpoint(relation.from)}Id`;
}

function htreeFkField(relation: DatafnRelationSchema): string {
  return relation.fkField || relation.inverse || "parentId";
}

function htreePathField(relation: DatafnRelationSchema): string {
  return relation.pathField || "parentPath";
}

function fkResourceFieldForRelation(
  relation: DatafnRelationSchema,
  side: "from" | "to",
): string {
  if (relation.fkResourceField) return relation.fkResourceField;
  if (relation.type === "htree") {
    return `${htreeFkField(relation).replace(/Id$/, "")}Resource`;
  }
  const base = side === "to"
    ? (relation.relation || "target")
    : (relation.inverse || relation.relation || "source");
  return `${base.replace(/Id$/, "")}Resource`;
}

function stringField(name: string): DatafnFieldSchema {
  return {
    name,
    type: "string",
    required: false,
    nullable: true,
  };
}

function addRelationField(
  byResource: Map<string, DatafnFieldSchema[]>,
  resource: string,
  field: DatafnFieldSchema,
): void {
  const fields = byResource.get(resource) ?? [];
  if (!fields.some((existing) => existing.name === field.name)) {
    fields.push(field);
  }
  byResource.set(resource, fields);
}

function buildRelationFieldsByResource(schema: DatafnSchema): Map<string, DatafnFieldSchema[]> {
  const byResource = new Map<string, DatafnFieldSchema[]>();
  for (const relation of schema.relations ?? []) {
    if (relation.type === "many-one") {
      const toResources = endpointList(relation.to);
      const resourceField = toResources.length > 1
        ? fkResourceFieldForRelation(relation, "to")
        : undefined;
      for (const resource of endpointList(relation.from)) {
        addRelationField(byResource, resource, stringField(relation.fkField || `${relation.relation}Id`));
        if (resourceField) addRelationField(byResource, resource, stringField(resourceField));
      }
    } else if (relation.type === "one-many") {
      const fromResources = endpointList(relation.from);
      const resourceField = fromResources.length > 1
        ? fkResourceFieldForRelation(relation, "from")
        : undefined;
      for (const resource of endpointList(relation.to)) {
        addRelationField(byResource, resource, stringField(fkFieldForOneMany(relation)));
        if (resourceField) addRelationField(byResource, resource, stringField(resourceField));
      }
    } else if (relation.type === "htree") {
      const fromResources = endpointList(relation.from);
      const resourceField = fromResources.length > 1
        ? fkResourceFieldForRelation(relation, "from")
        : undefined;
      for (const resource of endpointList(relation.to)) {
        addRelationField(byResource, resource, stringField(htreeFkField(relation)));
        addRelationField(byResource, resource, stringField(htreePathField(relation)));
        if (resourceField) addRelationField(byResource, resource, stringField(resourceField));
      }
    }
  }
  return byResource;
}

function toPascalCase(str: string): string {
  const parts = str
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1));
  const joined = parts.join("") || "GeneratedType";
  return /^\d/.test(joined) ? `_${joined}` : joined;
}

function renderInterfaceField(field: DatafnFieldSchema): string {
  const tsType = mapFieldType(field.type, field.nullable === true);
  const optional = field.required ? "" : "?";
  const readonly = field.readonly ? "readonly " : "";
  return `${readonly}${renderTsPropertyName(field.name)}${optional}: ${tsType};`;
}

function renderTsPropertyName(name: string): string {
  return isValidTsIdentifier(name) ? name : JSON.stringify(name);
}

function ensureIdField(fields: readonly DatafnFieldSchema[]): DatafnFieldSchema[] {
  if (fields.some((field) => field.name === "id")) {
    return [...fields];
  }

  return [
    { name: "id", type: "string", required: true, readonly: true },
    ...fields,
  ];
}

function isValidTsIdentifier(name: string): boolean {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name);
}

function mapFieldType(type: string, nullable: boolean): string {
  const baseType = mapBaseType(type);
  if (!nullable) return baseType;
  return `${baseType} | null`;
}

function mapBaseType(type: string): string {
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
      return "number"; // epoch milliseconds
    case "file":
      return "string"; // url or id
    case "json":
      return "unknown";
    default:
      return "unknown";
  }
}
