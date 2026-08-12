import type { JsonSchema } from "../types.js";

export interface DeduplicateSchemaInput {
  schema: JsonSchema;
  name?: string;
}

export interface DeduplicateSchemasResult {
  refs: string[];
  components: Record<string, JsonSchema>;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a.localeCompare(b)
    );
    return `{${entries
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

function toComponentName(rawName: string, usedNames: Set<string>): string {
  const cleaned = rawName.replace(/[^A-Za-z0-9_]/g, "");
  const baseName = cleaned.length > 0 ? cleaned : "Schema";

  if (!usedNames.has(baseName)) {
    usedNames.add(baseName);
    return baseName;
  }

  let index = 2;
  while (usedNames.has(`${baseName}${index}`)) {
    index += 1;
  }

  const candidate = `${baseName}${index}`;
  usedNames.add(candidate);
  return candidate;
}

export function deduplicateSchemas(
  schemas: DeduplicateSchemaInput[]
): DeduplicateSchemasResult {
  const refs: string[] = [];
  const components: Record<string, JsonSchema> = {};
  const byIdentity = new Map<JsonSchema, string>();
  const byStructure = new Map<string, string>();
  const usedNames = new Set<string>();

  for (let index = 0; index < schemas.length; index += 1) {
    const input = schemas[index];
    const schema = input.schema;

    const identityHit = byIdentity.get(schema);
    if (identityHit) {
      refs.push(`#/components/schemas/${identityHit}`);
      continue;
    }

    const structureKey = stableStringify(schema);
    const structureHit = byStructure.get(structureKey);
    if (structureHit) {
      byIdentity.set(schema, structureHit);
      refs.push(`#/components/schemas/${structureHit}`);
      continue;
    }

    const explicitName = input.name || (typeof schema.title === "string" ? schema.title : undefined);
    const fallbackName = `Schema${index + 1}`;
    const componentName = toComponentName(explicitName ?? fallbackName, usedNames);

    components[componentName] = schema;
    byIdentity.set(schema, componentName);
    byStructure.set(structureKey, componentName);
    refs.push(`#/components/schemas/${componentName}`);
  }

  return { refs, components };
}
