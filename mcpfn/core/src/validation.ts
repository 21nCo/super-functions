import Ajv, { type ErrorObject } from "ajv";
import addFormats from "ajv-formats";
import { Validator as CfWorkerValidator } from "@cfworker/json-schema";

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
 * functions, so it cannot run there. Detect the capability once and fall back
 * to `@cfworker/json-schema`, a code-generation-free validator, when needed.
 */
const codeGenerationAllowed = (() => {
  try {
    // eslint-disable-next-line no-new-func
    new Function("return true");
    return true;
  } catch {
    return false;
  }
})();

let sharedAjv: Ajv | undefined;

function getAjv(): Ajv {
  if (!sharedAjv) {
    sharedAjv = new Ajv({ allErrors: true, strict: false, allowUnionTypes: true });
    // npm workspaces may install ajv-formats with its own compatible Ajv copy.
    // The runtime contract is stable; erase only that duplicate-package type identity.
    addFormats(sharedAjv as never);
  }
  return sharedAjv;
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
    keyword: error.keyword ?? "schema",
  }));
}

/**
 * Compile a JSON Schema into a runtime-appropriate validator.
 *
 * On Node the validator uses Ajv (with formats) so behavior is unchanged. On
 * edge runtimes that forbid code generation it uses `@cfworker/json-schema`.
 * Throws when the schema itself is invalid, mirroring Ajv's compile-time
 * rejection so callers can surface an "invalid JSON Schema" error.
 */
export function compileSchema(schema: object): CompiledSchema {
  if (codeGenerationAllowed) {
    const validate = getAjv().compile(schema as never);
    const compiled = ((data: unknown): boolean => {
      const valid = validate(data);
      compiled.errors = valid ? null : mapAjvErrors(validate.errors);
      return valid;
    }) as CompiledSchema;
    compiled.errors = null;
    return compiled;
  }

  const validator = new CfWorkerValidator(schema as never, "2020-12", false);
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
}

/** Whether the current runtime validates schemas via Ajv (Node) or the edge fallback. */
export const schemaEngine: "ajv" | "cfworker" = codeGenerationAllowed ? "ajv" : "cfworker";
