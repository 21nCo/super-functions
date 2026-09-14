import { createDiagnostic, createDocsError } from "./diagnostics";
import type { CanonicalOpenApiExample, CanonicalOpenApiRequestBodyMedia } from "./openapi";
type NormalizeOpenApiReferenceInput = { sourceId: string; sourcePath: string };
function toObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function compareStrings(a: string, b: string): number { return a.localeCompare(b, "en", { sensitivity: "variant", numeric: true }); }

export function normalizeExamples(value: unknown, document: Record<string, unknown>, input: NormalizeOpenApiReferenceInput): CanonicalOpenApiExample[] {
  const record = toObject(value);
  return Object.keys(record)
    .sort(compareStrings)
    .map((name) => {
      const item = toObject(resolveLocalReference(record[name], document, input, true));
      return {
        name,
        summary: typeof item.summary === "string" ? item.summary : undefined,
        description: typeof item.description === "string" ? item.description : undefined,
        value: "value" in item ? item.value : undefined,
        reference: typeof item.$ref === "string" ? item.$ref : undefined,
        externalValue: typeof item.externalValue === "string" ? item.externalValue : undefined,
      };
    });
}

export function normalizeMediaContent(value: unknown, document: Record<string, unknown>, input: NormalizeOpenApiReferenceInput): CanonicalOpenApiRequestBodyMedia[] {
  const contentRecord = toObject(value);
  return Object.keys(contentRecord)
    .sort(compareStrings)
    .map((mediaType) => {
      const media = toObject(contentRecord[mediaType]);
      return {
        mediaType,
        schema: media.schema,
        example: media.example,
        examples: normalizeExamples(media.examples, document, input),
      };
    });
}

export function resolveLocalReference(
  value: unknown,
  document: Record<string, unknown>,
  input: NormalizeOpenApiReferenceInput,
  allowExternal = false
): unknown {
  let resolved = value;
  const visited = new Set<string>();
  const overrides: Record<string, string> = {};
  while (typeof toObject(resolved).$ref === "string") {
    if (typeof document.openapi === "string" && Number(document.openapi.split(".")[1]) >= 1) {
      for (const key of ["summary", "description"]) {
        if (!Object.hasOwn(overrides, key) && typeof toObject(resolved)[key] === "string") overrides[key] = toObject(resolved)[key] as string;
      }
    }
    const reference = toObject(resolved).$ref as string;
    if (allowExternal && !reference.startsWith("#")) { resolved = { $ref: reference, ...overrides }; break; }
    if (!reference.startsWith("#/") || visited.has(reference)) {
      throw createOpenApiParseError({
        message: `unsupported or cyclic local reference ${reference}`,
        sourceId: input.sourceId,
        sourcePath: input.sourcePath,
      });
    }
    visited.add(reference);
    resolved = document;
    let pointer: string;
    try { pointer = decodeURIComponent(reference.slice(2)); }
    catch { throw createOpenApiParseError({ message: `malformed local reference ${reference}`, sourceId: input.sourceId, sourcePath: input.sourcePath }); }
    for (const segment of pointer.split("/")) {
      if (/~(?![01])/.test(segment)) throw createOpenApiParseError({ message: `malformed local reference ${reference}`, sourceId: input.sourceId, sourcePath: input.sourcePath });
      const key = segment.replace(/~1/g, "/").replace(/~0/g, "~");
      const object = toObject(resolved);
      resolved = Object.prototype.hasOwnProperty.call(object, key)
        ? object[key]
        : undefined;
    }
    if (!resolved || typeof resolved !== "object" || Array.isArray(resolved)) {
      throw createOpenApiParseError({
        message: `unresolved local reference ${reference}`,
        sourceId: input.sourceId,
        sourcePath: input.sourcePath,
      });
    }
  }
  return Object.keys(overrides).length ? { ...toObject(resolved), ...overrides } : resolved;
}

export function createOpenApiParseError(input: {
  message: string;
  sourceId: string;
  sourcePath: string;
  absolutePath?: string;
  details?: Record<string, unknown>;
  cause?: unknown;
}) {
  return createDocsError({
    code: "DOCS_OPENAPI_PARSE_FAILED",
    message: input.message,
    diagnostics: [
      createDiagnostic({
        code: "DOCS_OPENAPI_PARSE_FAILED",
        message: input.message,
        location: {
          sourceId: input.sourceId,
          absolutePath: input.absolutePath,
        },
        details: {
          sourcePath: input.sourcePath,
          ...(input.details ?? {}),
        },
      }),
    ],
    cause: input.cause,
  });
}
