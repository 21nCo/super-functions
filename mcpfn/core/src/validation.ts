import Ajv, { type ErrorObject } from "ajv";
import addFormats from "ajv-formats";
import uri from "fast-uri";
import {
  dereference,
  encodePointer,
  validate as validateCfWorkerSchema,
  Validator as CfWorkerValidator,
} from "@cfworker/json-schema";

import { draft7MetaSchema } from "./draft-07-meta-schema.js";
import type { McpFnSchemaIssue } from "./types.js";

/**
 * A single schema validation failure, normalized across validation engines so
 * that error reporting is identical regardless of the runtime.
 */
export interface SchemaIssue {
  instancePath: string;
  message?: string;
  keyword: string;
  schemaPath?: string;
  rejectedProperty?: string;
  missingProperty?: string;
  params?: Record<string, unknown>;
}

/**
 * A compiled JSON Schema validator. Calling it returns whether `data` is valid
 * and, on failure, populates `errors` with the normalized issues.
 */
export interface CompiledSchema {
  (data: unknown): boolean;
  errors: SchemaIssue[] | null;
}

/**
 * Cloudflare Workers (workerd) and other edge runtimes disallow runtime code
 * generation (`eval`/`new Function`). Ajv compiles schemas into generated
 * functions, so it cannot run there. Detect the host capability and fall back
 * to `@cfworker/json-schema`, a code-generation-free validator, when needed.
 */
function canGenerateCode(): boolean {
  try {
    // eslint-disable-next-line no-new-func
    new Function("return true");
    return true;
  } catch {
    return false;
  }
}

function isCloudflareWorker(): boolean {
  return "WebSocketPair" in globalThis;
}

function createAjv(): Ajv {
  const ajv = new Ajv({
    allErrors: true,
    strict: false,
    allowUnionTypes: true,
    // Draft-07 requires sibling keywords next to $ref to be ignored. Ajv's
    // newer default extends that dialect; keep both engines on the spec rule.
    ignoreKeywordsWithRef: true,
    logger: false,
  });
  // npm workspaces may install ajv-formats with its own compatible Ajv copy.
  // The runtime contract is stable; erase only that duplicate-package type identity.
  addFormats(ajv as never);
  return ajv;
}

function mapAjvErrors(errors: ErrorObject[] | null | undefined): SchemaIssue[] {
  return (errors ?? []).map((error) => ({
    instancePath: error.instancePath || "",
    message: error.message ?? "Schema validation failed",
    keyword: error.keyword,
    schemaPath: error.schemaPath,
    rejectedProperty: error.keyword === "additionalProperties"
      ? String((error.params as Record<string, unknown>).additionalProperty ?? "")
      : undefined,
    missingProperty: error.keyword === "required"
      ? String((error.params as Record<string, unknown>).missingProperty ?? "")
      : undefined,
  }));
}

interface CfWorkerOutputUnit {
  instanceLocation?: string;
  keyword?: string;
  keywordLocation?: string;
  error?: string;
}

function jsonPointerToInstancePath(location: string | undefined): string {
  if (!location || location === "#") return "";
  // @cfworker/json-schema reports JSON pointers like `#/foo/0`; Ajv uses
  // instance paths like `/foo/0`. Normalize onto the Ajv shape.
  return location.replace(/^#/, "");
}

function mapCfWorkerErrors(errors: CfWorkerOutputUnit[] | undefined): SchemaIssue[] {
  return (errors ?? []).map((error) => ({
    instancePath: jsonPointerToInstancePath(error.instanceLocation),
    message: error.error ?? "Schema validation failed",
    keyword: error.keyword ?? jsonPointerToKeyword(error.keywordLocation),
    schemaPath: error.keywordLocation,
  }));
}

function jsonPointerToKeyword(location: string | undefined): string {
  if (!location || location === "#") return "schema";
  const segment = location.split("/").at(-1);
  return segment?.replaceAll("~1", "/").replaceAll("~0", "~") || "schema";
}

export type SchemaEngine = "ajv" | "cfworker";

export interface SchemaCompiler {
  readonly engine: SchemaEngine;
  compile(schema: object): CompiledSchema;
}

function defaultSchemaEngine(): SchemaEngine {
  // Miniflare/workerd may permit Function construction even though deployed
  // Workers do not. Prefer the edge-safe engine whenever the Cloudflare-only
  // WebSocketPair global identifies that runtime, then retain capability
  // detection for other CSP-constrained hosts.
  return !isCloudflareWorker() && canGenerateCode() ? "ajv" : "cfworker";
}

const syntheticCollectionBase = "https://schema-collection.mcpfn.invalid/";
const relativeSchemaHostSuffix = ".schema-resource.mcpfn.invalid";
const authoredResourceBase = "https://authored-schema.mcpfn.invalid/";

// Ajv uses RFC 3986 URI resolution. Keep that identity separate from the
// WHATWG-only URI index used by @cfworker/json-schema.
function resolveSchemaUri(reference: string, base: string): string {
  return uri.resolve(base, reference);
}

function schemaResourceUri(reference: string): string {
  const fragment = reference.indexOf("#");
  return fragment < 0 ? reference : reference.slice(0, fragment);
}

// Encode every authored resource, including URIs that happen to parse under
// WHATWG URL. The mapping is injective and uses a different namespace from
// anonymous synthetic roots, so an authored ref cannot expose one of them.
// Keep the fragment outside the encoding for cfworker's pointer lookup.
function workerSchemaUri(reference: string): string {
  const resource = schemaResourceUri(reference);
  const encoded = Array.from(new TextEncoder().encode(resource), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
  return `${authoredResourceBase}${encoded}${reference.slice(resource.length)}`;
}

function effectiveSchemaUri(reference: string, originalBase: string, effectiveBase: string): string {
  const resolved = resolveSchemaUri(reference, originalBase);
  const sameResource = schemaResourceUri(resolved) === schemaResourceUri(originalBase);
  // Anonymous roots have no public base. Relative dot segments and fragments
  // can still identify that root, while absolute private-looking references
  // must remain outside its synthetic namespace.
  const localReference = sameResource && (
    !effectiveBase.startsWith(syntheticCollectionBase) ||
    schemaResourceUri(resolveSchemaUri(reference, "")) === ""
  );
  return localReference
    ? resolveSchemaUri(resolved.slice(schemaResourceUri(resolved).length), effectiveBase)
    : workerSchemaUri(resolved);
}

function explicitSchemaId(schema: object): string | undefined {
  const id = (schema as { $id?: unknown }).$id;
  return typeof id === "string" && id.length > 0 ? id : undefined;
}

function syntheticCollectionId(index: number | "index", attempt: number): string {
  return `${syntheticCollectionBase}${index}-${attempt}`;
}

function collectUserSchemaResourceUris(
  schema: Draft7Schema,
  parentBase: string,
  uris: Set<string>,
): void {
  if (typeof schema === "boolean") return;
  const identifier = explicitSchemaId(schema);
  const originalBase = identifier ? resolveSchemaUri(identifier, parentBase) : parentBase;
  if (identifier) uris.add(schemaResourceUri(originalBase));
  const reference = schema.$ref;
  if (typeof reference === "string" && reference !== "" && !reference.startsWith("#")) {
    uris.add(schemaResourceUri(resolveSchemaUri(reference, originalBase)));
  }
  forEachDraft7Subschema(schema, (subschema) => {
    collectUserSchemaResourceUris(subschema, originalBase, uris);
  });
}

function userSchemaResourceUris(schemas: readonly object[], base: URL): Set<string> {
  const uris = new Set<string>();
  for (const schema of schemas) {
    collectUserSchemaResourceUris(schema as Record<string, unknown>, base.href, uris);
  }
  return uris;
}

function isSyntheticIdCollision(error: unknown, syntheticIds: readonly string[]): boolean {
  if (!(error instanceof Error)) return false;
  const duplicateMessage =
    error.message.includes("already exists") ||
    error.message.includes("resolves to more than one schema") ||
    error.message.startsWith("Duplicate schema URI");
  return duplicateMessage && syntheticIds.some((id) => error.message.includes(`"${id}"`));
}

interface SchemaResourcePlan {
  resources: object[];
  resourceIds: string[];
  syntheticIds: string[];
  relativeSchemaBase: URL;
  attempt: number;
}

function collectAbsoluteSchemaOrigins(schema: Draft7Schema, origins: Set<string>): void {
  if (typeof schema === "boolean") return;
  for (const keyword of ["$id", "$ref"] as const) {
    const value = schema[keyword];
    if (typeof value !== "string") continue;
    try {
      origins.add(new URL(value).origin);
    } catch {
      if (value.startsWith("//")) {
        origins.add(new URL(value, "https://relative-schema.invalid").origin);
      }
    }
  }
  forEachDraft7Subschema(schema, (subschema) => {
    collectAbsoluteSchemaOrigins(subschema, origins);
  });
}

function selectRelativeSchemaBase(schemas: readonly object[]): URL {
  const occupiedOrigins = new Set<string>();
  for (const schema of schemas) {
    collectAbsoluteSchemaOrigins(schema as Record<string, unknown>, occupiedOrigins);
  }
  let index = 0;
  while (occupiedOrigins.has(`https://${index}${relativeSchemaHostSuffix}`)) index += 1;
  return new URL(`https://${index}${relativeSchemaHostSuffix}/`);
}

// @cfworker/json-schema requires absolute URLs while Ajv also supports a
// relative identifier namespace. Canonicalize that namespace before assigning
// anonymous roots their private synthetic IDs. A base on an unoccupied origin
// keeps relative identifiers distinct from every absolute URI in the input.
function normalizeSchemaUris(
  schema: Draft7Schema,
  parentOriginalBase: string,
  parentEffectiveBase: string,
): void {
  if (typeof schema === "boolean") return;

  let originalBase = parentOriginalBase;
  let effectiveBase = parentEffectiveBase;
  const identifier = explicitSchemaId(schema);
  if (identifier) {
    originalBase = resolveSchemaUri(identifier, parentOriginalBase);
    effectiveBase = effectiveSchemaUri(identifier, parentOriginalBase, parentEffectiveBase);
    schema.$id = effectiveBase;
  }

  if (typeof schema.$ref === "string") {
    schema.$ref = effectiveSchemaUri(schema.$ref, originalBase, effectiveBase);
  }

  forEachDraft7Subschema(schema, (subschema) => {
    normalizeSchemaUris(subschema, originalBase, effectiveBase);
  });
}

function planSchemaResources(schemas: readonly object[], attempt: number): SchemaResourcePlan {
  const relativeSchemaBase = selectRelativeSchemaBase(schemas);
  const occupiedUris = userSchemaResourceUris(schemas, relativeSchemaBase);
  while (schemas.some((schema, index) =>
    !explicitSchemaId(schema) && occupiedUris.has(syntheticCollectionId(index, attempt))
  )) attempt += 1;
  const syntheticIds = schemas.map((schema, index) => (
    explicitSchemaId(schema) ? undefined : syntheticCollectionId(index, attempt)
  ));
  const resources = schemas.map((schema, index) => {
    const copy = structuredClone(schema) as Record<string, unknown>;
    const syntheticId = syntheticIds[index];
    normalizeSchemaUris(
      copy,
      relativeSchemaBase.href,
      syntheticId ?? relativeSchemaBase.href,
    );
    if (syntheticId) copy.$id = syntheticId;
    return copy;
  });
  return {
    resources,
    resourceIds: resources.map((resource) => explicitSchemaId(resource)!),
    syntheticIds: syntheticIds.filter((id): id is string => id !== undefined),
    relativeSchemaBase,
    attempt,
  };
}

function assertCfWorkerSchemaSyntax(
  schema: object,
  validateSchema: CfWorkerValidator,
): void {
  const result = validateSchema.validate(schema) as {
    valid: boolean;
    errors?: CfWorkerOutputUnit[];
  };
  if (result.valid) return;
  const details = mapCfWorkerErrors(result.errors)
    .map((issue) => `${issue.instancePath || "/"}: ${issue.message}`)
    .join("; ");
  throw new Error(`schema is invalid: ${details}`);
}

type CfWorkerSchemaLookup = ReturnType<typeof dereference>;

interface DereferencedSchema {
  $id?: unknown;
  id?: unknown;
  $ref?: unknown;
  dependencies?: unknown;
  __absolute_uri__?: unknown;
  __absolute_ref__?: unknown;
}

type Draft7Schema = boolean | Record<string, unknown>;

// @cfworker/json-schema treats `dependencies` as one schema instead of a map
// of schemas and skips empty URI references. Walk the draft-07 schema-bearing
// keywords explicitly so its public validator receives a complete lookup.
const singleSchemaKeywords = [
  "additionalItems",
  "additionalProperties",
  "contains",
  "propertyNames",
  "not",
  "if",
  "then",
  "else",
] as const;
const schemaArrayKeywords = ["allOf", "anyOf", "oneOf"] as const;
const schemaMapKeywords = ["$defs", "definitions", "properties", "patternProperties"] as const;

function isDraft7Schema(value: unknown): value is Draft7Schema {
  return typeof value === "boolean" ||
    (!!value && typeof value === "object" && !Array.isArray(value));
}

function visitSchema(
  value: unknown,
  visit: (subschema: Draft7Schema) => void,
): void {
  if (isDraft7Schema(value)) visit(value);
}

function visitSchemaArray(
  value: unknown,
  visit: (subschema: Draft7Schema) => void,
): void {
  if (!Array.isArray(value)) return;
  for (const subschema of value) visitSchema(subschema, visit);
}

function visitSchemaMap(
  value: unknown,
  visit: (subschema: Draft7Schema) => void,
): void {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  for (const subschema of Object.values(value)) visitSchema(subschema, visit);
}

function forEachDraft7Subschema(
  schema: Record<string, unknown>,
  visit: (subschema: Draft7Schema) => void,
): void {
  for (const keyword of singleSchemaKeywords) visitSchema(schema[keyword], visit);
  visitSchema(schema.items, visit);
  visitSchemaArray(schema.items, visit);
  for (const keyword of schemaArrayKeywords) visitSchemaArray(schema[keyword], visit);
  for (const keyword of schemaMapKeywords) visitSchemaMap(schema[keyword], visit);
  visitSchemaMap(schema.dependencies, visit);
}

function assertNoLegacySchemaIds(schema: object | boolean): void {
  if (typeof schema === "boolean") return;
  const draft7Schema = schema as Record<string, unknown>;
  if (Object.hasOwn(draft7Schema, "id")) {
    throw new TypeError('NOT SUPPORTED: keyword "id", use "$id" for schema ID');
  }
  forEachDraft7Subschema(draft7Schema, assertNoLegacySchemaIds);
}

function schemaLocation(schema: DereferencedSchema): { resourceURI: URL; pointer: string } {
  const absoluteURI = schema.__absolute_uri__;
  if (typeof absoluteURI !== "string") {
    throw new TypeError("Schema resource is missing its absolute URI");
  }
  const resourceURI = new URL(absoluteURI);
  const hash = resourceURI.hash;
  const pointer = hash.startsWith("#/") ? hash.slice(1) : "";
  resourceURI.hash = "";
  return { resourceURI, pointer };
}

function registerDependencySchemas(
  schema: DereferencedSchema,
  lookup: CfWorkerSchemaLookup,
): void {
  const dependencies = schema.dependencies;
  if (!dependencies || typeof dependencies !== "object" || Array.isArray(dependencies)) return;
  const location = schemaLocation(schema);
  for (const [name, dependency] of Object.entries(dependencies)) {
    if (!isDraft7Schema(dependency)) continue;
    const pointer = `${location.pointer}/dependencies/${encodePointer(name)}`;
    const dependencyURI = `${location.resourceURI.href}#${pointer}`;
    if (lookup[dependencyURI] === undefined) {
      dereference(dependency as never, lookup, location.resourceURI, pointer);
    }
  }
}

function supplementDraft7Dependencies(
  schema: Draft7Schema,
  lookup: CfWorkerSchemaLookup,
  visited = new Set<object>(),
): void {
  if (typeof schema === "boolean" || visited.has(schema)) return;
  visited.add(schema);
  registerDependencySchemas(schema, lookup);
  forEachDraft7Subschema(schema, (subschema) => {
    supplementDraft7Dependencies(subschema, lookup, visited);
  });
}

function buildCfWorkerLookup(resources: readonly object[]): CfWorkerSchemaLookup {
  const lookup: CfWorkerSchemaLookup = Object.create(null);
  for (const resource of resources) {
    dereference(resource as never, lookup);
  }
  for (const resource of resources) {
    supplementDraft7Dependencies(resource as Record<string, unknown>, lookup);
  }
  return lookup;
}

function assertCfWorkerReferencesResolved(lookup: CfWorkerSchemaLookup): void {
  for (const value of Object.values(lookup)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const schema = value as DereferencedSchema;
    if (typeof schema.$ref !== "string") continue;
    const reference = typeof schema.__absolute_ref__ === "string"
      ? schema.__absolute_ref__
      : schema.$ref;
    if (lookup[reference] === undefined) {
      throw new Error(`Unresolved $ref "${schema.$ref}". Absolute URI "${reference}".`);
    }
  }
}

interface PreparedCfWorkerResources {
  plan: SchemaResourcePlan;
  lookup: CfWorkerSchemaLookup;
}

function prepareCfWorkerResources(schemas: readonly object[]): PreparedCfWorkerResources {
  let attempt = 0;
  while (true) {
    const plan = planSchemaResources(schemas, attempt);
    try {
      const lookup = buildCfWorkerLookup(plan.resources);
      assertCfWorkerReferencesResolved(lookup);
      return { plan, lookup };
    } catch (error) {
      if (!isSyntheticIdCollision(error, plan.syntheticIds)) throw error;
      attempt += 1;
    }
  }
}

function validateAjvSchemaCollection(schemas: readonly object[]): void {
  let attempt = 0;
  while (true) {
    const plan = planSchemaResources(schemas, attempt);
    try {
      const ajv = createAjv();
      for (const resource of plan.resources) ajv.addSchema(resource as never);
      for (const resourceId of plan.resourceIds) {
        if (!ajv.getSchema(resourceId)) {
          throw new Error(`schema is unavailable after registration: ${resourceId}`);
        }
      }
      return;
    } catch (error) {
      if (!isSyntheticIdCollision(error, plan.syntheticIds)) throw error;
      attempt += 1;
    }
  }
}

function validateCfWorkerSchemaCollection(schemas: readonly object[]): void {
  const validateSchema = new CfWorkerValidator(draft7MetaSchema as never, "7", false);
  for (const schema of schemas) assertCfWorkerSchemaSyntax(schema, validateSchema);
  prepareCfWorkerResources(schemas);
}

/**
 * Validate a related collection of JSON Schema resources without changing each
 * schema's root. All resources are indexed before references are checked, so
 * forward references do not depend on canonical manifest ordering.
 */
export function validateSchemaCollection(
  schemas: readonly object[],
  engine: SchemaEngine = defaultSchemaEngine(),
): void {
  for (const schema of schemas) assertNoLegacySchemaIds(schema);
  if (engine === "ajv") validateAjvSchemaCollection(schemas);
  else validateCfWorkerSchemaCollection(schemas);
}

/**
 * Compile a JSON Schema into a runtime-appropriate validator.
 *
 * On Node the validator uses Ajv (with formats) so behavior is unchanged. On
 * edge runtimes that forbid code generation it uses `@cfworker/json-schema`.
 * Throws when the schema itself is invalid, mirroring Ajv's compile-time
 * rejection so callers can surface an "invalid JSON Schema" error.
 */
export function createSchemaCompiler(
  engine: SchemaEngine = defaultSchemaEngine(),
): SchemaCompiler {
  if (engine === "ajv") {
    const ajv = createAjv();
    return {
      engine,
      compile(schema) {
        assertNoLegacySchemaIds(schema);
        const validate = ajv.compile(schema as never);
        const compiled = ((data: unknown): boolean => {
          const valid = validate(data);
          compiled.errors = valid ? null : mapAjvErrors(validate.errors);
          return valid;
        }) as CompiledSchema;
        compiled.errors = null;
        return compiled;
      },
    };
  }

  const validateSchema = new CfWorkerValidator(draft7MetaSchema as never, "7", false);
  const registeredSchemas: object[] = [];
  const state: {
    resources: object[];
    lookup: CfWorkerSchemaLookup;
    relativeSchemaBase: URL;
    attempt: number;
    occupiedUris: Set<string>;
    syntheticIds: Set<string>;
  } = {
    resources: [],
    lookup: Object.create(null),
    relativeSchemaBase: selectRelativeSchemaBase([]),
    attempt: 0,
    occupiedUris: new Set(),
    syntheticIds: new Set(),
  };
  return {
    engine,
    compile(schema) {
      assertNoLegacySchemaIds(schema);
      assertCfWorkerSchemaSyntax(schema, validateSchema);
      const index = registeredSchemas.length;
      const newUris = userSchemaResourceUris([schema], state.relativeSchemaBase);
      const newOrigins = new Set<string>();
      collectAbsoluteSchemaOrigins(schema as Record<string, unknown>, newOrigins);
      const syntheticId = explicitSchemaId(schema)
        ? undefined : syntheticCollectionId(index, state.attempt);
      const mustReplan = newOrigins.has(state.relativeSchemaBase.origin) ||
        [...newUris].some((uri) => state.syntheticIds.has(uri)) ||
        (syntheticId !== undefined &&
          (newUris.has(syntheticId) || state.occupiedUris.has(syntheticId)));
      if (mustReplan) {
        // A newly seen user URI can occupy a private namespace. Rebase the
        // shared graph once so older validators keep the same public meaning.
        const { plan, lookup } = prepareCfWorkerResources([...registeredSchemas, schema]);
        state.resources = plan.resources;
        state.lookup = lookup;
        state.relativeSchemaBase = plan.relativeSchemaBase;
        state.attempt = plan.attempt;
        state.syntheticIds = new Set(plan.syntheticIds);
        state.occupiedUris = userSchemaResourceUris(
          [...registeredSchemas, schema], plan.relativeSchemaBase,
        );
      } else {
        const current = structuredClone(schema) as Record<string, unknown>;
        normalizeSchemaUris(
          current,
          state.relativeSchemaBase.href,
          syntheticId ?? state.relativeSchemaBase.href,
        );
        if (syntheticId) current.$id = syntheticId;
        // Each level stores only the newly registered resource. A failed
        // registration leaves the prior graph and its validators untouched.
        const lookup = Object.create(state.lookup) as CfWorkerSchemaLookup;
        dereference(current as never, lookup);
        supplementDraft7Dependencies(current, lookup);
        assertCfWorkerReferencesResolved(lookup);
        state.resources.push(current);
        state.lookup = lookup;
        if (syntheticId) state.syntheticIds.add(syntheticId);
      }
      for (const uri of newUris) state.occupiedUris.add(uri);
      registeredSchemas.push(structuredClone(schema));
      const compiled = ((data: unknown): boolean => {
        const result = validateCfWorkerSchema(data, state.resources[index] as never, "7", state.lookup, false) as {
          valid: boolean;
          errors?: CfWorkerOutputUnit[];
        };
        compiled.errors = result.valid ? null : mapCfWorkerErrors(result.errors);
        return result.valid;
      }) as CompiledSchema;
      compiled.errors = null;
      return compiled;
    },
  };
}

/** Whether the current runtime validates schemas via Ajv (Node) or the edge fallback. */
export const schemaEngine: SchemaEngine = defaultSchemaEngine();

const MAX_STRUCTURAL_FIELD_LENGTH = 256;

function boundedStructuralField(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length === 0) return undefined;
  return value.slice(0, MAX_STRUCTURAL_FIELD_LENGTH);
}

/** Convert normalized engine failures into a bounded public diagnostic shape. */
export function formatMcpFnSchemaIssues(
  errors: SchemaIssue[] | null | undefined,
): McpFnSchemaIssue[] {
  return (errors ?? []).slice(0, 100).map((error) => {
    const rawPath = error.instancePath || "/";
    const instancePath = rawPath.length <= MAX_STRUCTURAL_FIELD_LENGTH ? rawPath : "/";
    const rejectedProperty = boundedStructuralField(
      error.rejectedProperty ?? (error.keyword === "additionalProperties" ? error.params?.additionalProperty : undefined),
    );
    const missingProperty = boundedStructuralField(
      error.missingProperty ?? (error.keyword === "required" ? error.params?.missingProperty : undefined),
    );
    return {
      path: instancePath,
      instancePath,
      schemaPath: typeof error.schemaPath === "string" && error.schemaPath.length > 0 && error.schemaPath.length <= 256 ? error.schemaPath : "#",
      keyword: boundedStructuralField(error.keyword) ?? "validation",
      message: boundedStructuralField(error.message) ?? "Schema validation failed",
      ...(rejectedProperty ? { rejectedProperty } : {}),
      ...(missingProperty ? { missingProperty } : {}),
    };
  });
}
