import type { DatafnFieldSchema } from "./types.js";

export type SimpleCapability = "timestamps" | "audit" | "trash" | "archivable";

export type AccessLevel = "viewer" | "editor" | "owner";

export type ShareableVisibilityDefault = "ns" | "private" | "shared";

export type ShareablePrincipalMode = "opaque-id";

export type ShareableRelationInheritance = {
  enabled: boolean;
  relations?: string[];
  requireRelateConsent?: boolean;
};

export type ShareableCapability = {
  shareable: {
    levels: AccessLevel[];
    // Legacy compatibility field retained for existing schemas/runtime behavior.
    default?: "private" | "shared";
    // SPV2 extensions (optional in schema input, defaulted during validation).
    visibilityDefault?: ShareableVisibilityDefault;
    supportsScopeGrants?: boolean;
    crossNsShareable?: boolean;
    principalMode?: ShareablePrincipalMode;
    relationInheritance?: ShareableRelationInheritance;
  };
};

export type CapabilityEntry = SimpleCapability | ShareableCapability;

export type SchemaCapabilities = CapabilityEntry[];

export type ResourceCapabilities = CapabilityEntry[] | { exclude: SimpleCapability[] };

type CapabilityKey = SimpleCapability | "shareable";

type CapabilityFieldDef = Pick<
  DatafnFieldSchema,
  "name" | "type" | "required" | "nullable" | "readonly" | "default"
>;

export const CAPABILITY_FIELD_DEFS: Record<CapabilityKey, CapabilityFieldDef[]> = {
  timestamps: [
    { name: "createdAt", type: "date", required: false, nullable: true, readonly: true, default: null },
    { name: "updatedAt", type: "date", required: false, nullable: true, readonly: true, default: null },
  ],
  audit: [
    { name: "createdBy", type: "string", required: false, nullable: true, readonly: true, default: null },
    { name: "updatedBy", type: "string", required: false, nullable: true, readonly: true, default: null },
  ],
  trash: [
    { name: "trashedAt", type: "date", required: false, nullable: true, readonly: true, default: null },
    { name: "trashedBy", type: "string", required: false, nullable: true, readonly: true, default: null },
  ],
  archivable: [{ name: "isArchived", type: "boolean", required: false, nullable: false, readonly: false, default: false }],
  shareable: [{ name: "visibility", type: "string", required: false, nullable: true, readonly: true, default: null }],
};

// ---------------------------------------------------------------------------
// Relation capability field definitions (RCAP-001, RCAP-003)
// ---------------------------------------------------------------------------

type RelationCapabilityKey = "timestamps" | "audit";

/**
 * Field definitions injected into join tables for each relation capability.
 * Same field names as resource capabilities; kept separate for clarity.
 */
export const RELATION_CAPABILITY_FIELD_DEFS: Record<RelationCapabilityKey, CapabilityFieldDef[]> = {
  timestamps: [
    { name: "createdAt", type: "date", required: false, nullable: true, readonly: true, default: null },
    { name: "updatedAt", type: "date", required: false, nullable: true, readonly: true, default: null },
  ],
  audit: [
    { name: "createdBy", type: "string", required: false, nullable: true, readonly: true, default: null },
    { name: "updatedBy", type: "string", required: false, nullable: true, readonly: true, default: null },
  ],
};

/**
 * Returns the field names injected by the given resolved relation capabilities.
 * Output is deduplicated and ordered deterministically (canonical capability order).
 */
export function getRelationCapabilityFieldNames(caps: string[]): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const cap of caps) {
    const defs = RELATION_CAPABILITY_FIELD_DEFS[cap as RelationCapabilityKey] ?? [];
    for (const def of defs) {
      if (!seen.has(def.name)) {
        seen.add(def.name);
        names.push(def.name);
      }
    }
  }
  return names;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toCapabilityKey(entry: CapabilityEntry): CapabilityKey {
  return typeof entry === "string" ? entry : "shareable";
}

function dedupeCapabilities(entries: CapabilityEntry[]): CapabilityEntry[] {
  const seen = new Set<CapabilityKey>();
  const deduped: CapabilityEntry[] = [];

  for (const entry of entries) {
    const key = toCapabilityKey(entry);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(entry);
  }

  return deduped;
}

export function resolveCapabilities(
  globalCaps?: SchemaCapabilities,
  resourceCaps?: ResourceCapabilities,
): CapabilityEntry[] {
  const base = Array.isArray(globalCaps) ? globalCaps : [];

  if (resourceCaps === undefined) {
    return dedupeCapabilities(base);
  }

  if (Array.isArray(resourceCaps)) {
    const resolved = dedupeCapabilities(base);

    for (const entry of resourceCaps) {
      const key = toCapabilityKey(entry);
      const existingIndex = resolved.findIndex((candidate) => toCapabilityKey(candidate) === key);
      if (existingIndex === -1) {
        resolved.push(entry);
        continue;
      }
      if (key === "shareable") {
        resolved[existingIndex] = entry;
      }
    }

    return resolved;
  }

  if (isObject(resourceCaps) && Array.isArray(resourceCaps.exclude)) {
    const excluded = new Set(resourceCaps.exclude);
    return dedupeCapabilities(
      base.filter((entry) => (typeof entry === "string" ? !excluded.has(entry) : true)),
    );
  }

  return dedupeCapabilities(base);
}

export function getCapabilityFields(resolvedCaps: CapabilityEntry[]): DatafnFieldSchema[] {
  const fields: DatafnFieldSchema[] = [];
  const seenFields = new Set<string>();

  for (const capability of dedupeCapabilities(resolvedCaps)) {
    const key = toCapabilityKey(capability);
    for (const fieldDef of CAPABILITY_FIELD_DEFS[key]) {
      if (seenFields.has(fieldDef.name)) continue;
      seenFields.add(fieldDef.name);
      fields.push({ ...fieldDef });
    }
  }

  return fields;
}
