import Ajv, { type ErrorObject } from "ajv";
import addFormats from "ajv-formats";
import { Validator as CfWorkerValidator } from "@cfworker/json-schema";

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
  return segment?.replace(/~1/g, "/").replace(/~0/g, "~") || "schema";
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
  return {
    engine,
    compile(schema) {
      const schemaResult = validateSchema.validate(schema) as {
        valid: boolean;
        errors?: CfWorkerOutputUnit[];
      };
      if (!schemaResult.valid) {
        const details = mapCfWorkerErrors(schemaResult.errors)
          .map((issue) => `${issue.instancePath || "/"}: ${issue.message}`)
          .join("; ");
        throw new Error(`schema is invalid: ${details}`);
      }

      // Ajv's default constructor implements draft-07. Keep the fallback on
      // that same dialect so keywords such as $ref have identical semantics.
      const validator = new CfWorkerValidator(schema as never, "7", false);
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
