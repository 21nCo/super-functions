import { compareCodeUnits } from "./canonical.js";
import { diffManifests } from "./diff.js";
import { McpFnError, McpFnOutputValidationError, McpFnValidationError } from "./errors.js";
import type {
  McpFnDiffResult,
  McpFnJsonSchema,
  McpFnListedTool,
  McpFnManifest,
  McpFnManifestTool,
  McpFnObjectSchema,
  McpFnRequestExtra,
} from "./types.js";
import type { McpFnLifecycleStage } from "./validation.js";

export const MCPFN_GENERIC_CLIENT_PROFILE_ID = "mcpfn/generic";

export interface McpFnVerifiedClientIdentity {
  /**
   * Verified client identifier from authentication or an explicit test
   * adapter. Never derive this solely from initialize `clientInfo`.
   */
  id: string;
  /** Optional version claimed by verified context for the selected profile. */
  profileVersion?: string;
  /** Non-secret verified attributes. Do not store credentials here. */
  attributes?: Record<string, string | number | boolean>;
}

export interface McpFnClientProtocolCapabilities {
  protocolVersion?: string;
  sampling?: boolean;
  elicitation?: Array<"form" | "url">;
  roots?: boolean;
}

export interface McpFnClientProfileRequest<TContext = undefined> {
  identity: McpFnVerifiedClientIdentity;
  protocolCapabilities?: McpFnClientProtocolCapabilities;
  context: TContext;
  extra: McpFnRequestExtra;
}

export type McpFnPortabilityCode =
  | "remote-ref"
  | "unevaluated-properties"
  | "unevaluated-items"
  | "any-of"
  | "one-of"
  | "conditional"
  | "pattern-properties"
  | "dependent-schemas"
  | "dynamic-ref"
  | "prefix-items"
  | "boolean-schema";

export interface McpFnSchemaPortabilityPolicy {
  failOn?: McpFnPortabilityCode[];
  warnOn?: McpFnPortabilityCode[];
}

export interface McpFnPortabilityFinding {
  severity: "error" | "warning";
  code: McpFnPortabilityCode;
  path: string;
  message: string;
}

export interface McpFnClientProfile<TContext = undefined> {
  id: string;
  version: string;
  name?: string;
  /**
   * Select this profile from verified identity and trusted context.
   * Protocol capabilities are informational and must not be the sole input.
   */
  matchesIdentity?(
    identity: McpFnVerifiedClientIdentity,
    context: TContext,
  ): boolean;
  /**
   * Project the visibility-filtered canonical catalog into the model-visible
   * catalog. Must only transform existing tools; new names are rejected.
   */
  projectCatalog?(
    tools: McpFnListedTool[],
    request: McpFnClientProfileRequest<TContext>,
  ): McpFnListedTool[] | Promise<McpFnListedTool[]>;
  /**
   * Restore server-owned arguments from trusted context before canonical
   * validation. Model-provided values for those keys are not authoritative.
   */
  enrichCallArguments?(
    toolName: string,
    args: Record<string, unknown>,
    request: McpFnClientProfileRequest<TContext>,
  ): Record<string, unknown> | Promise<Record<string, unknown>>;
  portabilityPolicy?: McpFnSchemaPortabilityPolicy;
}

export const MCPFN_GENERIC_CLIENT_PROFILE: McpFnClientProfile = {
  id: MCPFN_GENERIC_CLIENT_PROFILE_ID,
  version: "1",
  name: "Generic MCP client",
};

export class McpFnProfileError extends McpFnError {
  constructor(code: string, message: string, details?: unknown) {
    super(code, message, details);
    this.name = "McpFnProfileError";
  }
}

export class McpFnTrustedContextError extends McpFnError {
  constructor(message: string, details?: unknown) {
    super("MCPFN_TRUSTED_CONTEXT_MISSING", message, details);
    this.name = "McpFnTrustedContextError";
  }
}

export interface McpFnPreparedToolCall<TContext = undefined> {
  toolName: string;
  arguments: Record<string, unknown>;
  profile: McpFnClientProfile<TContext>;
  identity: McpFnVerifiedClientIdentity;
  protocolCapabilities?: McpFnClientProtocolCapabilities;
  stage: Extract<McpFnLifecycleStage, "call_enrichment">;
}

export interface McpFnResolvedClientProfile<TContext = undefined> {
  profile: McpFnClientProfile<TContext>;
  identity: McpFnVerifiedClientIdentity;
  protocolCapabilities?: McpFnClientProtocolCapabilities;
}

export interface McpFnCatalogFieldChange {
  kind: "tool-added" | "tool-removed" | "field-removed" | "field-added" | "field-modified";
  toolName: string;
  path: string;
  before?: unknown;
  after?: unknown;
}

export interface McpFnEffectiveCatalog {
  profileId: string;
  profileVersion: string;
  tools: McpFnListedTool[];
  changes: McpFnCatalogFieldChange[];
}

export interface McpFnSymmetryIssue {
  code: string;
  path: string;
  message: string;
}

const DEFAULT_PORTABILITY_FAIL = new Set<McpFnPortabilityCode>([
  "remote-ref",
  "unevaluated-properties",
  "unevaluated-items",
]);

const DEFAULT_PORTABILITY_WARN = new Set<McpFnPortabilityCode>([
  "any-of",
  "one-of",
  "conditional",
  "pattern-properties",
  "dependent-schemas",
  "dynamic-ref",
  "prefix-items",
]);

const SENSITIVE_KEY = /^(authorization|access[_-]?token|refresh[_-]?token|id[_-]?token|token|password|secret|api[_-]?key|credential|verifier|code[_-]?verifier|cookie|set-cookie)$/i;

export function resolveClientProfile<TContext>(
  profiles: readonly McpFnClientProfile<TContext>[] | undefined,
  identity: McpFnVerifiedClientIdentity,
  context: TContext,
): McpFnClientProfile<TContext> {
  const configured = profiles ?? [];
  const matches = configured.filter((profile) => profileMatches(profile, identity, context));
  if (matches.length > 1) {
    throw new McpFnProfileError(
      "MCPFN_PROFILE_RESOLUTION",
      `Multiple client profiles matched verified identity ${identity.id}`,
      {
        lifecycle: {
          stage: "profile_resolution" as const,
          profileId: matches.map((profile) => profile.id).sort(compareCodeUnits).join(","),
          profileVersion: identity.profileVersion ?? "",
        },
        matched: matches.map((profile) => ({ id: profile.id, version: profile.version })),
      },
    );
  }
  const profile = matches[0] ?? genericProfile<TContext>();
  if (
    identity.profileVersion &&
    (profile.id === MCPFN_GENERIC_CLIENT_PROFILE_ID || profile.version !== identity.profileVersion)
  ) {
    throw new McpFnProfileError(
      "MCPFN_PROFILE_VERSION_MISMATCH",
      `Verified profile version ${identity.profileVersion} does not match ${profile.id}@${profile.version}`,
      {
        lifecycle: {
          stage: "profile_resolution" as const,
          profileId: profile.id,
          profileVersion: profile.version,
        },
      },
    );
  }
  return profile;
}

function profileMatches<TContext>(
  profile: McpFnClientProfile<TContext>,
  identity: McpFnVerifiedClientIdentity,
  context: TContext,
): boolean {
  if (profile.matchesIdentity) return profile.matchesIdentity(identity, context);
  return profile.id === identity.id;
}

function genericProfile<TContext>(): McpFnClientProfile<TContext> {
  return MCPFN_GENERIC_CLIENT_PROFILE as McpFnClientProfile<TContext>;
}

export function cloneListedTools(tools: McpFnListedTool[]): McpFnListedTool[] {
  return tools
    .map((tool) => cloneJson(tool))
    .sort((left, right) => compareCodeUnits(left.name, right.name));
}

export async function projectCatalogForProfile<TContext>(
  tools: McpFnListedTool[],
  resolution: McpFnResolvedClientProfile<TContext>,
  extra: McpFnRequestExtra,
  context: TContext,
): Promise<McpFnListedTool[]> {
  const canonical = cloneListedTools(tools);
  if (!resolution.profile.projectCatalog) return canonical;
  const allowed = new Set(canonical.map((tool) => tool.name));
  let projected: McpFnListedTool[];
  try {
    projected = await resolution.profile.projectCatalog(canonical, {
      identity: resolution.identity,
      protocolCapabilities: resolution.protocolCapabilities,
      context,
      extra,
    });
  } catch (error) {
    if (error instanceof McpFnError) throw error;
    throw new McpFnProfileError(
      "MCPFN_CATALOG_PROJECTION",
      error instanceof Error ? error.message : String(error),
      {
        lifecycle: {
          stage: "catalog_projection" as const,
          profileId: resolution.profile.id,
          profileVersion: resolution.profile.version,
        },
      },
    );
  }
  if (!Array.isArray(projected)) {
    throw new McpFnProfileError(
      "MCPFN_CATALOG_PROJECTION",
      `Profile ${resolution.profile.id} projectCatalog must return an array`,
      {
        lifecycle: {
          stage: "catalog_projection" as const,
          profileId: resolution.profile.id,
          profileVersion: resolution.profile.version,
        },
      },
    );
  }
  const unknown = projected
    .map((tool) => tool.name)
    .filter((name) => !allowed.has(name))
    .sort(compareCodeUnits);
  if (unknown.length) {
    throw new McpFnProfileError(
      "MCPFN_CATALOG_PROJECTION",
      `Profile ${resolution.profile.id} projected unknown tools: ${unknown.join(", ")}`,
      {
        lifecycle: {
          stage: "catalog_projection" as const,
          profileId: resolution.profile.id,
          profileVersion: resolution.profile.version,
        },
      },
    );
  }
  return cloneListedTools(projected);
}

export async function prepareToolCall<TContext>(
  input: {
    toolName: string;
    arguments: unknown;
    profile: McpFnClientProfile<TContext>;
    identity: McpFnVerifiedClientIdentity;
    protocolCapabilities?: McpFnClientProtocolCapabilities;
    context: TContext;
    extra: McpFnRequestExtra;
  },
): Promise<McpFnPreparedToolCall<TContext>> {
  const normalized = normalizeCallArguments(input.arguments);
  if (!input.profile.enrichCallArguments) {
    return {
      toolName: input.toolName,
      arguments: normalized,
      profile: input.profile,
      identity: input.identity,
      protocolCapabilities: input.protocolCapabilities,
      stage: "call_enrichment",
    };
  }
  try {
    const enriched = await input.profile.enrichCallArguments(input.toolName, normalized, {
      identity: input.identity,
      protocolCapabilities: input.protocolCapabilities,
      context: input.context,
      extra: input.extra,
    });
    return {
      toolName: input.toolName,
      arguments: normalizeCallArguments(enriched),
      profile: input.profile,
      identity: input.identity,
      protocolCapabilities: input.protocolCapabilities,
      stage: "call_enrichment",
    };
  } catch (error) {
    if (error instanceof McpFnError) {
      throw attachLifecycle(error, {
        stage: "call_enrichment",
        profileId: input.profile.id,
        profileVersion: input.profile.version,
        tool: input.toolName,
      });
    }
    throw new McpFnProfileError(
      "MCPFN_CALL_ENRICHMENT",
      error instanceof Error ? error.message : String(error),
      {
        lifecycle: {
          stage: "call_enrichment" as const,
          profileId: input.profile.id,
          profileVersion: input.profile.version,
          tool: input.toolName,
        },
      },
    );
  }
}

export function normalizeCallArguments(args: unknown): Record<string, unknown> {
  if (args === undefined || args === null) return {};
  if (!args || typeof args !== "object" || Array.isArray(args)) {
    throw new McpFnValidationError("Tool arguments must be an object");
  }
  return { ...(args as Record<string, unknown>) };
}

/**
 * Copy model-provided arguments, then overwrite server-owned keys from trusted
 * context. Missing trusted values fail closed. Model-provided values for those
 * keys are ignored.
 */
export function applyTrustedArguments(
  modelArguments: Record<string, unknown>,
  trusted: Record<string, unknown>,
  keys: readonly string[],
): Record<string, unknown> {
  const result = { ...modelArguments };
  const missing = keys.filter((key) => trusted[key] === undefined);
  if (missing.length) {
    throw new McpFnTrustedContextError(
      `Missing trusted context for ${missing.sort(compareCodeUnits).join(", ")}`,
      { missing: [...missing].sort(compareCodeUnits) },
    );
  }
  for (const key of keys) result[key] = trusted[key];
  return result;
}

export function omitToolInputFields(
  tool: McpFnListedTool,
  fields: readonly string[],
): McpFnListedTool {
  const hidden = new Set(fields);
  const schema = (tool.inputSchema ?? {}) as McpFnJsonSchema;
  const properties = schema.properties && typeof schema.properties === "object" && !Array.isArray(schema.properties)
    ? Object.fromEntries(
      Object.entries(schema.properties as Record<string, unknown>)
        .filter(([name]) => !hidden.has(name)),
    )
    : undefined;
  const required = Array.isArray(schema.required)
    ? schema.required.filter((name): name is string => typeof name === "string" && !hidden.has(name))
    : undefined;
  return {
    ...tool,
    inputSchema: {
      ...schema,
      ...(properties ? { properties } : {}),
      ...(required !== undefined ? { required } : {}),
    } as McpFnListedTool["inputSchema"],
  };
}

export function listedToolToManifestTool(tool: McpFnListedTool): McpFnManifestTool {
  return {
    name: tool.name,
    ...(tool.title ? { title: tool.title } : {}),
    description: tool.description ?? "",
    inputSchema: tool.inputSchema as McpFnObjectSchema,
    ...(tool.outputSchema ? { outputSchema: tool.outputSchema as McpFnObjectSchema } : {}),
    ...(tool.annotations ? { annotations: tool.annotations } : {}),
    ...(tool.execution ? { execution: tool.execution } : {}),
    ...(tool.icons ? { icons: tool.icons } : {}),
    ...(tool._meta ? { metadata: tool._meta as Record<string, unknown> } : {}),
  };
}

export function buildEffectiveCatalog(
  canonical: McpFnListedTool[],
  projected: McpFnListedTool[],
  profile: Pick<McpFnClientProfile, "id" | "version"> = MCPFN_GENERIC_CLIENT_PROFILE,
): McpFnEffectiveCatalog {
  const before = new Map(cloneListedTools(canonical).map((tool) => [tool.name, tool]));
  const after = new Map(cloneListedTools(projected).map((tool) => [tool.name, tool]));
  const changes: McpFnCatalogFieldChange[] = [];
  for (const name of [...before.keys()].sort(compareCodeUnits)) {
    const next = after.get(name);
    if (!next) {
      changes.push({
        kind: "tool-removed",
        toolName: name,
        path: `tools.${name}`,
        before: listedToolToManifestTool(before.get(name)!),
      });
      continue;
    }
    const beforeSchema = objectSchema(before.get(name)!.inputSchema);
    const afterSchema = objectSchema(next.inputSchema);
    for (const field of [...beforeSchema.propertyNames].sort(compareCodeUnits)) {
      if (!afterSchema.properties[field]) {
        changes.push({
          kind: "field-removed",
          toolName: name,
          path: `tools.${name}.inputSchema.properties.${field}`,
          before: beforeSchema.properties[field],
        });
      } else if (
        canonicalJson(beforeSchema.properties[field]) !== canonicalJson(afterSchema.properties[field])
      ) {
        changes.push({
          kind: "field-modified",
          toolName: name,
          path: `tools.${name}.inputSchema.properties.${field}`,
          before: beforeSchema.properties[field],
          after: afterSchema.properties[field],
        });
      }
    }
    for (const field of [...afterSchema.propertyNames].sort(compareCodeUnits)) {
      if (!beforeSchema.properties[field]) {
        changes.push({
          kind: "field-added",
          toolName: name,
          path: `tools.${name}.inputSchema.properties.${field}`,
          after: afterSchema.properties[field],
        });
      }
    }
  }
  for (const name of [...after.keys()].sort(compareCodeUnits)) {
    if (!before.has(name)) {
      changes.push({
        kind: "tool-added",
        toolName: name,
        path: `tools.${name}`,
        after: listedToolToManifestTool(after.get(name)!),
      });
    }
  }
  return {
    profileId: profile.id,
    profileVersion: profile.version,
    tools: [...after.values()],
    changes,
  };
}

export function diffEffectiveCatalogs(
  before: McpFnListedTool[],
  after: McpFnListedTool[],
): McpFnDiffResult {
  const stub = (tools: McpFnListedTool[]): McpFnManifest => ({
    formatVersion: 1,
    server: { name: "effective-catalog", version: "0" },
    tools: cloneListedTools(tools).map(listedToolToManifestTool),
    hash: "0".repeat(64),
  });
  return diffManifests(stub(before), stub(after));
}

export function serverOwnedInputFields(
  canonical: McpFnListedTool,
  projected: McpFnListedTool | undefined,
): string[] {
  if (!projected) return [];
  const required = objectSchema(canonical.inputSchema).required;
  const visible = new Set(objectSchema(projected.inputSchema).propertyNames);
  return required.filter((name) => !visible.has(name)).sort(compareCodeUnits);
}

export function analyzeProjectionEnrichmentSymmetry(
  canonicalTools: McpFnListedTool[],
  projectedTools: McpFnListedTool[],
  hasEnricher: boolean,
): McpFnSymmetryIssue[] {
  const projected = new Map(projectedTools.map((tool) => [tool.name, tool]));
  const issues: McpFnSymmetryIssue[] = [];
  let omittedRequired = 0;
  for (const canonical of canonicalTools) {
    const owned = serverOwnedInputFields(canonical, projected.get(canonical.name));
    if (!owned.length) continue;
    omittedRequired += owned.length;
    if (!hasEnricher) {
      issues.push({
        code: "projection-without-enrichment",
        path: `tools.${canonical.name}`,
        message: `Profile hides ${owned.join(", ")} from ${canonical.name} but defines no enricher`,
      });
    }
  }
  if (hasEnricher && omittedRequired === 0) {
    issues.push({
      code: "enrichment-without-projection",
      path: "profile",
      message: "Profile defines an enricher but does not omit any canonical required fields",
    });
  }
  issues.sort((left, right) =>
    compareCodeUnits(left.path, right.path) || compareCodeUnits(left.code, right.code),
  );
  return issues;
}

export function assessSchemaPortability(
  schema: unknown,
  policy: McpFnSchemaPortabilityPolicy = {},
  path = "/",
): McpFnPortabilityFinding[] {
  const failOn = new Set(policy.failOn ?? [...DEFAULT_PORTABILITY_FAIL]);
  const warnOn = new Set(policy.warnOn ?? [...DEFAULT_PORTABILITY_WARN]);
  const findings: McpFnPortabilityFinding[] = [];
  walkPortability(schema, path, (code, findingPath, message) => {
    if (failOn.has(code)) {
      findings.push({ severity: "error", code, path: findingPath, message });
    } else if (warnOn.has(code)) {
      findings.push({ severity: "warning", code, path: findingPath, message });
    }
  });
  findings.sort((left, right) =>
    compareCodeUnits(left.path, right.path) || compareCodeUnits(left.code, right.code),
  );
  return findings;
}

export function redactClientProfileEvidence(value: unknown, depth = 0): unknown {
  if (depth > 8) return "[Truncated]";
  if (typeof value === "string") {
    if (/^(bearer\s+)/i.test(value) || /token|secret|password/i.test(value) && value.length > 24) {
      return "REDACTED";
    }
    return value.length > 512 ? `${value.slice(0, 496)}...[TRUNCATED]` : value;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 32).map((entry) => redactClientProfileEvidence(entry, depth + 1));
  }
  if (!value || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(record).sort(([left], [right]) => compareCodeUnits(left, right)).map(([key, entry]) => {
      if (SENSITIVE_KEY.test(key)) return [key, "REDACTED"];
      if (key === "arguments" && entry && typeof entry === "object" && !Array.isArray(entry)) {
        return [key, redactArgumentValues(entry as Record<string, unknown>)];
      }
      return [key, redactClientProfileEvidence(entry, depth + 1)];
    }),
  );
}

function redactArgumentValues(args: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(args).sort(([left], [right]) => compareCodeUnits(left, right)).map(([key, value]) => {
      if (value && typeof value === "object" && !Array.isArray(value)) {
        return [key, redactArgumentValues(value as Record<string, unknown>)];
      }
      return [key, "REDACTED"];
    }),
  );
}

export function attachLifecycle(
  error: McpFnError,
  lifecycle: {
    stage: McpFnLifecycleStage;
    profileId: string;
    profileVersion: string;
    tool?: string;
  },
): McpFnError {
  const details = error.details && typeof error.details === "object" && !Array.isArray(error.details)
    ? { ...(error.details as Record<string, unknown>), lifecycle }
    : error.details !== undefined
      ? { cause: error.details, lifecycle }
      : { lifecycle };
  if (error instanceof McpFnValidationError) return new McpFnValidationError(error.message, details);
  if (error instanceof McpFnOutputValidationError) {
    return new McpFnOutputValidationError(error.message, details);
  }
  if (error instanceof McpFnTrustedContextError) {
    return new McpFnTrustedContextError(error.message, details);
  }
  if (error instanceof McpFnProfileError) {
    return new McpFnProfileError(error.code, error.message, details);
  }
  return new McpFnError(error.code, error.message, details);
}

function objectSchema(schema: unknown): {
  properties: Record<string, unknown>;
  propertyNames: string[];
  required: string[];
} {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
    return { properties: {}, propertyNames: [], required: [] };
  }
  const value = schema as McpFnJsonSchema;
  const properties = value.properties && typeof value.properties === "object" && !Array.isArray(value.properties)
    ? value.properties as Record<string, unknown>
    : {};
  const required = Array.isArray(value.required)
    ? value.required.filter((entry): entry is string => typeof entry === "string")
    : [];
  return {
    properties,
    propertyNames: Object.keys(properties),
    required,
  };
}

function walkPortability(
  schema: unknown,
  path: string,
  emit: (code: McpFnPortabilityCode, path: string, message: string) => void,
  ancestors: unknown[] = [],
): void {
  if (typeof schema === "boolean") {
    emit("boolean-schema", path, "Boolean JSON Schema values are not portable for MCP tool inputs");
    return;
  }
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return;
  if (ancestors.includes(schema)) return;
  const value = schema as Record<string, unknown>;
  const nextAncestors = [...ancestors, schema];
  if (typeof value.$ref === "string" && /^https?:\/\//i.test(value.$ref)) {
    emit("remote-ref", path, `Remote $ref is not portable: ${value.$ref}`);
  }
  if (typeof value.$dynamicRef === "string" || typeof value.$recursiveRef === "string") {
    emit("dynamic-ref", path, "Dynamic JSON Schema references are not portable");
  }
  if (Object.hasOwn(value, "unevaluatedProperties")) {
    emit("unevaluated-properties", path, "unevaluatedProperties is not widely supported by MCP hosts");
  }
  if (Object.hasOwn(value, "unevaluatedItems")) {
    emit("unevaluated-items", path, "unevaluatedItems is not widely supported by MCP hosts");
  }
  if (Array.isArray(value.anyOf)) emit("any-of", path, "anyOf reduces schema portability across MCP hosts");
  if (Array.isArray(value.oneOf)) emit("one-of", path, "oneOf reduces schema portability across MCP hosts");
  if (Object.hasOwn(value, "if") || Object.hasOwn(value, "then") || Object.hasOwn(value, "else")) {
    emit("conditional", path, "if/then/else schemas are not portable for MCP tool inputs");
  }
  if (value.patternProperties && typeof value.patternProperties === "object") {
    emit("pattern-properties", path, "patternProperties is not portable for MCP tool inputs");
  }
  if (value.dependentSchemas && typeof value.dependentSchemas === "object") {
    emit("dependent-schemas", path, "dependentSchemas is not portable for MCP tool inputs");
  }
  if (Object.hasOwn(value, "prefixItems")) {
    emit("prefix-items", path, "prefixItems is not portable for MCP tool inputs");
  }
  if (value.properties && typeof value.properties === "object" && !Array.isArray(value.properties)) {
    for (const [name, property] of Object.entries(value.properties as Record<string, unknown>)) {
      walkPortability(property, `${path === "/" ? "" : path}/properties/${name}`, emit, nextAncestors);
    }
  }
  if (Array.isArray(value.allOf)) {
    value.allOf.forEach((member, index) => {
      walkPortability(member, `${path === "/" ? "" : path}/allOf/${index}`, emit, nextAncestors);
    });
  }
  if (Array.isArray(value.anyOf)) {
    value.anyOf.forEach((member, index) => {
      walkPortability(member, `${path === "/" ? "" : path}/anyOf/${index}`, emit, nextAncestors);
    });
  }
  if (Array.isArray(value.oneOf)) {
    value.oneOf.forEach((member, index) => {
      walkPortability(member, `${path === "/" ? "" : path}/oneOf/${index}`, emit, nextAncestors);
    });
  }
  if (value.items) walkPortability(value.items, `${path === "/" ? "" : path}/items`, emit, nextAncestors);
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(value);
}
