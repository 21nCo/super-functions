import Ajv, { type ErrorObject } from "ajv";
import addFormats from "ajv-formats";
import { dereference, Validator as CfWorkerValidator } from "@cfworker/json-schema";

import { draft7MetaSchema } from "./draft-07-meta-schema.js";

/**
 * A single schema validation failure, normalized across validation engines so
 * that error reporting is identical regardless of the runtime.
 */
export interface SchemaIssue {
  instancePath: string;
  message: string;
  keyword: string;
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

function explicitSchemaId(schema: object): string | undefined {
  const id = (schema as { $id?: unknown }).$id;
  return typeof id === "string" && id.length > 0 ? id : undefined;
}

function syntheticCollectionId(index: number | "index", attempt: number): string {
  return `${syntheticCollectionBase}${index}-${attempt}`;
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
}

function planSchemaResources(schemas: readonly object[], attempt: number): SchemaResourcePlan {
  const resourceIds = schemas.map(
    (schema, index) => explicitSchemaId(schema) ?? syntheticCollectionId(index, attempt),
  );
  return {
    resources: schemas.map((schema, index) => {
      const copy = structuredClone(schema);
      return explicitSchemaId(copy) ? copy : { ...copy, $id: resourceIds[index]! };
    }),
    resourceIds,
    syntheticIds: resourceIds.filter(
      (_, index) => explicitSchemaId(schemas[index]!) === undefined,
    ),
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
  $ref?: unknown;
  __absolute_ref__?: unknown;
}

function buildCfWorkerLookup(resources: readonly object[]): CfWorkerSchemaLookup {
  const lookup: CfWorkerSchemaLookup = Object.create(null);
  for (const resource of resources) {
    dereference(structuredClone(resource) as never, lookup);
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

function prepareCfWorkerResources(schemas: readonly object[]): object[] {
  let attempt = 0;
  while (true) {
    const plan = planSchemaResources(schemas, attempt);
    try {
      const lookup = buildCfWorkerLookup(plan.resources);
      assertCfWorkerReferencesResolved(lookup);
      return plan.resources;
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
  return {
    engine,
    compile(schema) {
      assertCfWorkerSchemaSyntax(schema, validateSchema);
      const resources = prepareCfWorkerResources([...registeredSchemas, schema]);
      const current = resources.at(-1)!;
      const validator = new CfWorkerValidator(structuredClone(current) as never, "7", false);
      for (const registered of resources.slice(0, -1)) {
        validator.addSchema(structuredClone(registered) as never);
      }
      registeredSchemas.push(structuredClone(schema));
      const compiled = ((data: unknown): boolean => {
        const result = validator.validate(data) as {
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
