import { AdminError } from "./errors.js";
import { adminScopeLevelRank, canonicalAdminScopeLevel } from "./scope.js";
import { parseAdminOperationRoute } from "./operation-route.js";
import type {
  AdminCapabilityManifest,
  AdminJsonSchema,
  AdminOperationDefinition,
} from "./types.js";

export interface AdminValidationIssue {
  path: string;
  message: string;
  keyword?: string;
}

function adminJsonValueEquals(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  const leftJson = comparableJsonValue(left);
  const rightJson = comparableJsonValue(right);
  return leftJson !== undefined && rightJson !== undefined && leftJson === rightJson;
}

function comparableJsonValue(value: unknown, seen = new Set<object>()): string | undefined {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? JSON.stringify(value) : undefined;
  }
  if (typeof value !== "object" || seen.has(value)) return undefined;
  const isArray = Array.isArray(value);
  const prototype = Object.getPrototypeOf(value);
  if (!isArray && prototype !== Object.prototype && prototype !== null) return undefined;
  seen.add(value);
  const entries = isArray
    ? Array.from(value, (item, index) => [String(index), item] as const)
    : Object.entries(value as Record<string, unknown>).sort(([leftKey], [rightKey]) =>
        leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0
      );
  const serialized: string[] = [];
  for (const [key, item] of entries) {
    const child = comparableJsonValue(item, seen);
    if (child === undefined) {
      seen.delete(value);
      return undefined;
    }
    serialized.push(`${JSON.stringify(key)}:${child}`);
  }
  seen.delete(value);
  return `${isArray ? "[" : "{"}${serialized.join(",")}${isArray ? "]" : "}"}`;
}

const ID_PATTERN = /^[a-z][a-z0-9-]*(?:\.[a-z0-9-]+)*$/;
const MODULE_PATTERN = /^[a-z][a-z0-9-]*$/;
const COMPILED_PATTERNS = new WeakMap<AdminJsonSchema, RegExp>();
const EXACT_OUTPUT_PATH_PATTERN = /^\$(?:\.[A-Za-z][A-Za-z0-9_-]*|\[\*\])+$/;

function outputPathResolves(schema: AdminJsonSchema, path: string): boolean {
  if (!EXACT_OUTPUT_PATH_PATTERN.test(path) || path.endsWith("[*]")) return false;
  const segments = path.slice(1).match(/\.[A-Za-z][A-Za-z0-9_-]*|\[\*\]/g) ?? [];
  let current: AdminJsonSchema | undefined = schema;
  for (const segment of segments) {
    if (!current) return false;
    if (current.anyOf?.length || current.oneOf?.length || current.allOf?.length) return false;
    if (segment === "[*]") {
      if (!allowedTypes(current).includes("array") || !current.items) return false;
      current = current.items;
      continue;
    }
    if (!allowedTypes(current).includes("object") || current.additionalProperties !== false) return false;
    current = current.properties?.[segment.slice(1)];
  }
  return Boolean(
    current &&
    !current.anyOf?.length &&
    !current.oneOf?.length &&
    !current.allOf?.length &&
    allowedTypes(current).length === 1 &&
    allowedTypes(current)[0] === "string",
  );
}

function compiledPattern(schema: AdminJsonSchema): RegExp | undefined {
  if (schema.pattern === undefined) return undefined;
  const existing = COMPILED_PATTERNS.get(schema);
  if (existing) return existing;
  const compiled = new RegExp(schema.pattern);
  COMPILED_PATTERNS.set(schema, compiled);
  return compiled;
}

function valueType(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "number" && !Number.isFinite(value)) return "non-finite number";
  if (Number.isInteger(value)) return "integer";
  return typeof value;
}

function allowedTypes(schema: AdminJsonSchema): string[] {
  if (!schema.type) return [];
  return typeof schema.type === "string" ? [schema.type] : [...schema.type];
}

export function validateAdminValue(
  schema: AdminJsonSchema,
  value: unknown,
  path = "$",
): AdminValidationIssue[] {
  return validateAdminValueInternal(schema, value, path, new Set<object>());
}

function validateAdminValueInternal(
  schema: AdminJsonSchema,
  value: unknown,
  path: string,
  ancestors: Set<object>,
): AdminValidationIssue[] {
  if (value !== null && typeof value === "object" && ancestors.has(value)) {
    return [{ path, message: "must be an acyclic JSON value", keyword: "type" }];
  }
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      return [{ path, message: "must be a plain JSON object", keyword: "type" }];
    }
  }
  const childAncestors = new Set(ancestors);
  if (value !== null && typeof value === "object") childAncestors.add(value);
  if (typeof value === "number" && !Number.isFinite(value)) {
    return [{ path, message: "must be a finite JSON number", keyword: "type" }];
  }
  const issues: AdminValidationIssue[] = [];
  if (schema.const !== undefined && !adminJsonValueEquals(schema.const, value)) {
    issues.push({
      path,
      message: "must equal the declared constant",
      keyword: "const",
    });
  }
  if (
    schema.enum &&
    !schema.enum.some((candidate) => adminJsonValueEquals(candidate, value))
  ) {
    issues.push({
      path,
      message: "must be one of the declared values",
      keyword: "enum",
    });
  }

  const types = allowedTypes(schema);
  if (types.length > 0) {
    const actual = valueType(value);
    const matches =
      types.includes(actual) ||
      (actual === "integer" && types.includes("number"));
    if (!matches) {
      return [
        { path, message: `must be ${types.join(" or ")}`, keyword: "type" },
      ];
    }
  }

  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      issues.push({
        path,
        message: `must contain at least ${schema.minLength} characters`,
        keyword: "minLength",
      });
    }
    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      issues.push({
        path,
        message: `must contain at most ${schema.maxLength} characters`,
        keyword: "maxLength",
      });
    }
    if (schema.pattern) {
      try {
        if (!compiledPattern(schema)!.test(value)) {
          issues.push({
            path,
            message: "does not match the required pattern",
            keyword: "pattern",
          });
        }
      } catch {
        issues.push({ path, message: "declares an invalid regular expression", keyword: "pattern" });
      }
    }
  }

  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) {
      issues.push({
        path,
        message: `must be at least ${schema.minimum}`,
        keyword: "minimum",
      });
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      issues.push({
        path,
        message: `must be at most ${schema.maximum}`,
        keyword: "maximum",
      });
    }
  }

  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      issues.push({
        path,
        message: `must contain at least ${schema.minItems} items`,
        keyword: "minItems",
      });
    }
    if (schema.maxItems !== undefined && value.length > schema.maxItems) {
      issues.push({
        path,
        message: `must contain at most ${schema.maxItems} items`,
        keyword: "maxItems",
      });
    }
    if (schema.uniqueItems) {
      const keys = value.map((item) => comparableJsonValue(item));
      if (keys.includes(undefined)) {
        issues.push({
          path,
          message: "must contain only JSON values",
          keyword: "type",
        });
      } else if (new Set(keys).size !== keys.length) {
        issues.push({
          path,
          message: "must contain unique items",
          keyword: "uniqueItems",
        });
      }
    }
    if (schema.items && !Array.isArray(schema.items)) {
      value.forEach((item, index) =>
        issues.push(
          ...validateAdminValueInternal(
            schema.items as AdminJsonSchema,
            item,
            `${path}[${index}]`,
            childAncestors,
          ),
        ),
      );
    } else if (Array.isArray(schema.items)) {
      const tupleItems = schema.items as unknown as readonly AdminJsonSchema[];
      value.forEach((item, index) =>
        issues.push(
          ...validateAdminValueInternal(tupleItems[index] ?? {}, item, `${path}[${index}]`, childAncestors),
        ),
      );
    } else if (!schema.items) {
      value.forEach((item, index) =>
        issues.push(...validateAdminValueInternal({}, item, `${path}[${index}]`, childAncestors)),
      );
    }
  }

  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const object = value as Record<string, unknown>;
    for (const key of schema.required ?? []) {
      if (!Object.hasOwn(object, key))
        issues.push({
          path: `${path}.${key}`,
          message: "is required",
          keyword: "required",
        });
    }
    for (const [key, item] of Object.entries(object)) {
      const propertySchema = schema.properties?.[key];
      if (propertySchema) {
        issues.push(
          ...validateAdminValueInternal(propertySchema, item, `${path}.${key}`, childAncestors),
        );
      } else if (schema.additionalProperties === false) {
        issues.push({
          path: `${path}.${key}`,
          message: "is not allowed",
          keyword: "additionalProperties",
        });
      } else if (
        schema.additionalProperties &&
        typeof schema.additionalProperties === "object"
      ) {
        issues.push(
          ...validateAdminValueInternal(
            schema.additionalProperties,
            item,
            `${path}.${key}`,
            childAncestors,
          ),
        );
      } else {
        issues.push(...validateAdminValueInternal({}, item, `${path}.${key}`, childAncestors));
      }
    }
  }

  if (schema.allOf)
    for (const candidate of schema.allOf)
      issues.push(...validateAdminValueInternal(candidate, value, path, ancestors));
  if (
    schema.anyOf &&
    !schema.anyOf.some(
      (candidate) => validateAdminValueInternal(candidate, value, path, ancestors).length === 0,
    )
  ) {
    issues.push({
      path,
      message: "must match at least one allowed schema",
      keyword: "anyOf",
    });
  }
  if (
    schema.oneOf &&
    schema.oneOf.filter(
      (candidate) => validateAdminValueInternal(candidate, value, path, ancestors).length === 0,
    ).length !== 1
  ) {
    issues.push({
      path,
      message: "must match exactly one allowed schema",
      keyword: "oneOf",
    });
  }
  return issues;
}

export function assertAdminValue(
  schema: AdminJsonSchema,
  value: unknown,
  label = "input",
): void {
  const issues = validateAdminValue(schema, value);
  if (issues.length > 0) {
    throw new AdminError(
      "invalid_argument",
      `Invalid administration ${label}.`,
      { details: { issues } },
    );
  }
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([key, item]) => `${JSON.stringify(key)}:${stableSerialize(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
}

function operationSchemas(
  operation: AdminOperationDefinition,
): [AdminJsonSchema, AdminJsonSchema] {
  const input = operation.inputSchema;
  const output = operation.outputSchema;
  if (!input || !output)
    throw new AdminError(
      "invalid_argument",
      `Operation ${operation.id} must declare inputSchema and outputSchema.`,
    );
  return [input, output];
}

const SUPPORTED_SCHEMA_KEYWORDS = new Set([
  "title", "description", "type", "enum", "const", "default", "examples",
  "properties", "required", "additionalProperties", "items", "allOf", "anyOf",
  "oneOf", "pattern", "minimum", "maximum", "minLength", "maxLength",
  "minItems", "maxItems", "uniqueItems",
]);

function validateSupportedSchema(
  schema: AdminJsonSchema,
  path: string,
  issues: AdminValidationIssue[],
): void {
  for (const keyword of Object.keys(schema)) {
    if (!SUPPORTED_SCHEMA_KEYWORDS.has(keyword)) {
      issues.push({ path: `${path}.${keyword}`, message: "is not supported by the administration runtime validator" });
    }
  }
  const types = schema.type === undefined ? [] : Array.isArray(schema.type) ? schema.type : [schema.type];
  const supportedTypes = new Set(["object", "array", "string", "number", "integer", "boolean", "null"]);
  if (types.some((type) => !supportedTypes.has(type)) || new Set(types).size !== types.length) {
    issues.push({ path: `${path}.type`, message: "must contain unique supported JSON types" });
  }
  if (schema.pattern !== undefined) {
    try {
      compiledPattern(schema);
    } catch {
      issues.push({ path: `${path}.pattern`, message: "must be a valid regular expression" });
    }
  }
  for (const [name, property] of Object.entries(schema.properties ?? {})) {
    validateSupportedSchema(property, `${path}.properties.${name}`, issues);
  }
  if (schema.additionalProperties && typeof schema.additionalProperties === "object") {
    validateSupportedSchema(schema.additionalProperties, `${path}.additionalProperties`, issues);
  }
  if (schema.items) validateSupportedSchema(schema.items, `${path}.items`, issues);
  for (const keyword of ["allOf", "anyOf", "oneOf"] as const) {
    schema[keyword]?.forEach((candidate, index) => validateSupportedSchema(candidate, `${path}.${keyword}[${index}]`, issues));
  }
}

function normalizedRoute(operation: AdminOperationDefinition): string {
  const route = parseAdminOperationRoute(operation);
  const raw = route ? `${route.method} ${route.path}` : "";
  return raw
    .replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, ":param")
    .replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g, ":param");
}

function internalPathIssue(value: string): string | undefined {
  if (!value || value !== value.trim() || /\s/.test(value))
    return "must be a nonblank internal absolute path without whitespace";
  let decoded = value;
  try {
    for (let index = 0; index < 3; index += 1) {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    }
  } catch {
    return "must contain valid path encoding";
  }
  if (!decoded.startsWith("/") || decoded.startsWith("//"))
    return "must be an internal absolute path, not a URL or protocol-relative path";
  if (
    decoded.includes("\\") ||
    decoded.includes("//") ||
    decoded.includes("?") ||
    decoded.includes("#") ||
    decoded.includes("@") ||
    /[\u0000-\u001f\u007f]/.test(decoded) ||
    /(^|\/)\.{1,2}(\/|$)/.test(decoded) ||
    /(^|\/)[a-z][a-z0-9+.-]*:/i.test(decoded)
  ) {
    return "must not contain a scheme, credentials, traversal, query, fragment, or ambiguous separators";
  }
  return undefined;
}

const operationRoutePath = (operation: AdminOperationDefinition): string | undefined => parseAdminOperationRoute(operation)?.path;

function presentationRecordSchema(
  operation: AdminOperationDefinition | undefined,
  kind: "list" | "detail",
): AdminJsonSchema | undefined {
  const output = operation?.outputSchema;
  if (!output) return undefined;
  const envelopeProperty = output.properties?.[kind === "list" ? "items" : "item"];
  if (kind === "list" && envelopeProperty?.items) return envelopeProperty.items;
  if (kind === "detail" && envelopeProperty) return envelopeProperty;
  return output;
}

function presentationFieldSchema(
  schema: AdminJsonSchema | undefined,
  field: string,
): { compatible: boolean; schema?: AdminJsonSchema } {
  let current = schema;
  for (const segment of field.split(".")) {
    if (!current) return { compatible: true };
    const types = allowedTypes(current);
    if (types.length > 0 && !types.includes("object")) return { compatible: false, schema: current };
    const next = current.properties?.[segment];
    if (!next) return { compatible: current.additionalProperties !== false, schema: current };
    current = next;
  }
  return { compatible: true, schema: current };
}

function presentationInputPathSchema(
  schema: AdminJsonSchema | undefined,
  path: string,
): AdminJsonSchema | undefined {
  let current = schema;
  for (const segment of path.split(".")) {
    if (segment === "__proto__" || segment === "prototype" || segment === "constructor") return undefined;
    if (!current || !allowedTypes(current).includes("object")) return undefined;
    current = current.properties?.[segment];
  }
  return current;
}

export function validateAdminCapabilityManifest(
  manifest: AdminCapabilityManifest,
): AdminValidationIssue[] {
  const issues: AdminValidationIssue[] = [];
  if (manifest.schemaVersion !== "1.0")
    issues.push({ path: "$.schemaVersion", message: "must be 1.0" });
  if (!MODULE_PATTERN.test(manifest.id))
    issues.push({
      path: "$.id",
      message: "must be a stable lowercase module identifier",
    });
  if (!manifest.displayName.trim())
    issues.push({ path: "$.displayName", message: "must not be empty" });
  if (!manifest.description.trim())
    issues.push({ path: "$.description", message: "must not be empty" });
  if (!manifest.category.trim())
    issues.push({ path: "$.category", message: "must not be empty" });
  if (!manifest.version.trim())
    issues.push({ path: "$.version", message: "must not be empty" });
  if (manifest.scopeLevels.length === 0)
    issues.push({
      path: "$.scopeLevels",
      message: "must contain at least one supported level",
    });
  const supportedScopeLevels = new Set(["installation", "organization", "workspace", "project", "environment"]);
  if (manifest.scopeLevels.some((level) => !supportedScopeLevels.has(level))) {
    issues.push({ path: "$.scopeLevels", message: "must contain only supported scope levels" });
  }
  if (new Set(manifest.scopeLevels.map(canonicalAdminScopeLevel)).size !== manifest.scopeLevels.length) {
    issues.push({ path: "$.scopeLevels", message: "must not contain duplicate scope levels" });
  }
  if (["nested", "folded"].includes(manifest.availability) && !manifest.owner)
    issues.push({ path: "$.owner", message: "is required for nested and folded modules" });
  if (!["nested", "folded"].includes(manifest.availability) && manifest.owner)
    issues.push({
      path: "$.owner",
      message: "is only valid for nested or folded modules",
    });
  if (manifest.availability === "folded") {
    if (manifest.operations.length > 0)
      issues.push({ path: "$.operations", message: "must be empty for folded modules because the owner exposes their operations" });
    if (manifest.navigation && (Array.isArray(manifest.navigation) ? manifest.navigation.length > 0 : true))
      issues.push({ path: "$.navigation", message: "must be empty for folded modules" });
  }
  if (manifest.availability === "unavailable") {
    if (!manifest.unavailableReason?.trim())
      issues.push({ path: "$.unavailableReason", message: "is required for unavailable modules" });
    if (manifest.operations.length > 0)
      issues.push({ path: "$.operations", message: "must be empty for unavailable modules" });
    if (manifest.navigation && (Array.isArray(manifest.navigation) ? manifest.navigation.length > 0 : true))
      issues.push({ path: "$.navigation", message: "must be empty for unavailable modules" });
  } else if (manifest.unavailableReason !== undefined) {
    issues.push({ path: "$.unavailableReason", message: "is only valid for unavailable modules" });
  }
  for (const [index, dependency] of (manifest.dependencies ?? []).entries()) {
    const moduleId = typeof dependency === "string"
      ? dependency
      : dependency.moduleId;
    if (!MODULE_PATTERN.test(moduleId))
      issues.push({
        path: `$.dependencies[${index}]`,
        message: "must name a stable lowercase module identifier",
      });
    if (moduleId === manifest.id)
      issues.push({
        path: `$.dependencies[${index}]`,
        message: "must not depend on itself",
      });
  }
  const dependencyIds = (manifest.dependencies ?? []).map((dependency) =>
    typeof dependency === "string" ? dependency : dependency.moduleId,
  );
  if (new Set(dependencyIds).size !== dependencyIds.length)
    issues.push({
      path: "$.dependencies",
      message: "must not contain duplicate modules",
    });
  if (manifest.owner) {
    if (!MODULE_PATTERN.test(manifest.owner.moduleId))
      issues.push({
        path: "$.owner.moduleId",
        message: "must be a stable lowercase module identifier",
      });
    if (manifest.owner.mountPath !== undefined) {
      const issue = internalPathIssue(manifest.owner.mountPath);
      if (issue)
        issues.push({ path: "$.owner.mountPath", message: issue });
      const ownerRoot = `/modules/${manifest.owner.moduleId}`;
      if (
        !issue &&
        manifest.owner.mountPath !== ownerRoot &&
        !manifest.owner.mountPath.startsWith(`${ownerRoot}/`)
      ) {
        issues.push({
          path: "$.owner.mountPath",
          message: `must be mounted under ${ownerRoot}`,
        });
      }
    }
    if (
      !(manifest.dependencies ?? []).some((dependency) =>
        (typeof dependency === "string"
          ? dependency
          : dependency.moduleId) === manifest.owner?.moduleId &&
        (typeof dependency === "string" || dependency.required !== false),
      )
    ) {
      issues.push({
        path: "$.dependencies",
        message: "nested modules must require their owner module",
      });
    }
  }
  const navigation = manifest.navigation
    ? Array.isArray(manifest.navigation)
      ? manifest.navigation
      : [manifest.navigation]
    : [];
  navigation.forEach((item, index) => {
    if (!ID_PATTERN.test(item.id))
      issues.push({
        path: `$.navigation[${index}].id`,
        message: "must be a stable lowercase navigation identifier",
      });
    if (!item.label.trim())
      issues.push({
        path: `$.navigation[${index}].label`,
        message: "must not be empty",
      });
    if (item.parentId !== undefined && !ID_PATTERN.test(item.parentId))
      issues.push({
        path: `$.navigation[${index}].parentId`,
        message: "must be a stable lowercase navigation identifier",
      });
    const issue = internalPathIssue(item.path);
    if (issue)
      issues.push({ path: `$.navigation[${index}].path`, message: issue });
    const navigationRoot = manifest.owner
      ? manifest.owner.mountPath ?? `/modules/${manifest.owner.moduleId}`
      : `/modules/${manifest.id}`;
    if (
      !issue &&
      item.path !== navigationRoot &&
      !item.path.startsWith(`${navigationRoot}/`)
    ) {
      issues.push({
        path: `$.navigation[${index}].path`,
        message: `must be scoped under ${navigationRoot}`,
      });
    }
  });
  if (manifest.health?.path !== undefined) {
    const issue = internalPathIssue(manifest.health.path);
    if (issue) issues.push({ path: "$.health.path", message: issue });
  }
  const resourceIds = new Set<string>();
  const manifestScopeLevels = new Set(manifest.scopeLevels.map(canonicalAdminScopeLevel));
  for (const [index, resource] of (manifest.resources ?? []).entries()) {
    const basePath = `$.resources[${index}]`;
    if (!ID_PATTERN.test(resource.id) || resource.id.includes(".")) issues.push({ path: `${basePath}.id`, message: "must be a stable resource identifier" });
    if (resourceIds.has(resource.id)) issues.push({ path: `${basePath}.id`, message: "duplicates another resource" });
    resourceIds.add(resource.id);
    if (resource.minimumScope && !manifestScopeLevels.has(canonicalAdminScopeLevel(resource.minimumScope))) {
      issues.push({ path: `${basePath}.minimumScope`, message: "must be one of the manifest scope levels" });
    }
    for (const field of ["label", "description", "idField"] as const) {
      if (!resource[field].trim()) issues.push({ path: `${basePath}.${field}`, message: "must not be empty" });
    }
    for (const [field, values] of Object.entries({
      displayFields: resource.displayFields,
      searchableFields: resource.searchableFields,
      filterableFields: resource.filterableFields,
      sortableFields: resource.sortableFields,
      sensitiveFields: resource.sensitiveFields,
    })) {
      if ((values ?? []).some((value) => !value.trim())) issues.push({ path: `${basePath}.${field}`, message: "must not contain blank fields" });
      if (new Set(values ?? []).size !== (values ?? []).length) issues.push({ path: `${basePath}.${field}`, message: "must not contain duplicate fields" });
    }
    const presentation = resource.presentation;
    if (presentation) {
      const operationById = new Map(manifest.operations.map((operation) => [operation.id, operation]));
      const listOperation = presentation.listOperationId
        ? operationById.get(presentation.listOperationId)
        : undefined;
      const detailOperation = presentation.detailOperationId
        ? operationById.get(presentation.detailOperationId)
        : undefined;
      for (const [kind, operationId, operation] of [
        ["list", presentation.listOperationId, listOperation],
        ["detail", presentation.detailOperationId, detailOperation],
      ] as const) {
        if (operationId && !operation) {
          issues.push({ path: `${basePath}.presentation.${kind}OperationId`, message: "must name an operation in the same manifest" });
        } else if (operation && (operation.target?.resource !== resource.id || operation.safety.classification !== "read")) {
          issues.push({ path: `${basePath}.presentation.${kind}OperationId`, message: "must name a read operation targeting this resource" });
        }
      }
      const fields = [
        presentation.titleField,
        presentation.subtitleField,
        presentation.statusField,
        presentation.defaultSort?.field,
        ...(presentation.columns ?? []).map((column) => column.field),
      ].filter((field): field is string => field !== undefined);
      if (fields.some((field) => !/^[A-Za-z][A-Za-z0-9_-]*(?:\.[A-Za-z][A-Za-z0-9_-]*)*$/.test(field))) {
        issues.push({ path: `${basePath}.presentation`, message: "field references must be nonblank dotted property paths" });
      }
      const columnFields = (presentation.columns ?? []).map((column) => column.field);
      if (new Set(columnFields).size !== columnFields.length) {
        issues.push({ path: `${basePath}.presentation.columns`, message: "must not contain duplicate fields" });
      }
      (presentation.columns ?? []).forEach((column, columnIndex) => {
        if (!column.label.trim()) issues.push({ path: `${basePath}.presentation.columns[${columnIndex}].label`, message: "must not be empty" });
      });
      if (presentation.defaultSort && !resource.sortableFields?.includes(presentation.defaultSort.field)) {
        issues.push({ path: `${basePath}.presentation.defaultSort.field`, message: "must be declared in sortableFields" });
      }
      const queryFilters = presentation.query?.filters ?? [];
      const queryFields = queryFilters.map((filter) => filter.field);
      if (new Set(queryFields).size !== queryFields.length) {
        issues.push({ path: `${basePath}.presentation.query.filters`, message: "must not contain duplicate fields" });
      }
      queryFilters.forEach((filter, filterIndex) => {
        const filterPath = `${basePath}.presentation.query.filters[${filterIndex}]`;
        if (!resource.filterableFields?.includes(filter.field)) {
          issues.push({ path: `${filterPath}.field`, message: "must be declared in filterableFields" });
        }
        if (!filter.label?.trim() && filter.label !== undefined) {
          issues.push({ path: `${filterPath}.label`, message: "must not be empty" });
        }
        if (!presentationInputPathSchema(listOperation?.inputSchema, filter.inputPath)) {
          issues.push({ path: `${filterPath}.inputPath`, message: "must resolve in the list operation input schema" });
        }
      });
      if (presentation.query?.searchInputPath
        && !presentationInputPathSchema(listOperation?.inputSchema, presentation.query.searchInputPath)) {
        issues.push({ path: `${basePath}.presentation.query.searchInputPath`, message: "must resolve in the list operation input schema" });
      }
      if (presentation.standaloneList === false && !presentation.parent) {
        issues.push({ path: `${basePath}.presentation.parent`, message: "is required when standaloneList is false" });
      }
      if (presentation.parent) {
        const parentPath = `${basePath}.presentation.parent`;
        if (presentation.parent.resourceId === resource.id
          || !(manifest.resources ?? []).some((candidate) => candidate.id === presentation.parent!.resourceId)) {
          issues.push({ path: `${parentPath}.resourceId`, message: "must name a different resource in the same manifest" });
        }
        if (presentation.parent.bindings.length === 0) {
          issues.push({ path: `${parentPath}.bindings`, message: "must not be empty" });
        }
        const bindingFields = presentation.parent.bindings.map((binding) => binding.queryField);
        if (new Set(bindingFields).size !== bindingFields.length) {
          issues.push({ path: `${parentPath}.bindings`, message: "must not contain duplicate query fields" });
        }
        presentation.parent.bindings.forEach((binding, bindingIndex) => {
          const bindingPath = `${parentPath}.bindings[${bindingIndex}]`;
          if (!/^[A-Za-z][A-Za-z0-9_-]*(?:\.[A-Za-z][A-Za-z0-9_-]*)*$/.test(binding.sourceField)) {
            issues.push({ path: `${bindingPath}.sourceField`, message: "must be a nonblank dotted property path" });
          }
          if (!queryFields.includes(binding.queryField)) {
            issues.push({ path: `${bindingPath}.queryField`, message: "must name a declared query filter field" });
          }
        });
      }
      const listSchema = presentationRecordSchema(listOperation, "list");
      const detailSchema = presentationRecordSchema(detailOperation, "detail");
      const sharedFields = (presentation.columns ?? []).map((column) => column.field);
      const listFields = [presentation.defaultSort?.field, ...sharedFields]
        .filter((field): field is string => field !== undefined);
      const detailFields = [presentation.titleField, presentation.subtitleField, presentation.statusField, ...sharedFields]
        .filter((field): field is string => field !== undefined);
      for (const [schema, surfaceFields] of [[listSchema, listFields], [detailSchema, detailFields]] as const) {
        if (!schema) continue;
        for (const field of surfaceFields) {
          if (!presentationFieldSchema(schema, field).compatible) {
            issues.push({ path: `${basePath}.presentation`, message: `field ${field} is incompatible with a declared operation output schema` });
          }
        }
      }
    }
  }
  const ids = new Set<string>();
  const routes = new Set<string>();
  manifest.operations.forEach((operation, index) => {
    if (!operation.title.trim())
      issues.push({
        path: `$.operations[${index}].title`,
        message: "must not be empty",
      });
    if (!operation.description.trim())
      issues.push({
        path: `$.operations[${index}].description`,
        message: "must not be empty",
      });
    if (
      !ID_PATTERN.test(operation.id) ||
      !operation.id.startsWith(`${manifest.id}.`)
    ) {
      issues.push({
        path: `$.operations[${index}].id`,
        message: `must be namespaced with ${manifest.id}.`,
      });
    }
    if (ids.has(operation.id))
      issues.push({
        path: `$.operations[${index}].id`,
        message: "duplicates another operation",
      });
    ids.add(operation.id);
    const routePath = operationRoutePath(operation);
    if (!routePath) {
      issues.push({
        path: `$.operations[${index}].route`,
        message: "must declare a supported HTTP method and path",
      });
    } else {
      const issue = internalPathIssue(routePath);
      if (issue)
        issues.push({
          path: `$.operations[${index}].route`,
          message: issue,
        });
    }
    if (routePath) {
      const route = normalizedRoute(operation);
      if (routes.has(route))
        issues.push({
          path: `$.operations[${index}].route`,
          message: "duplicates another route",
        });
      routes.add(route);
    }
    if (!operation.permission.trim())
      issues.push({
        path: `$.operations[${index}].permission`,
        message: "must not be empty",
      });
    const operationResource = manifest.resources?.find((resource) => resource.id === operation.target?.resource);
    if (operation.minimumScope && !manifestScopeLevels.has(canonicalAdminScopeLevel(operation.minimumScope))) {
      issues.push({ path: `$.operations[${index}].minimumScope`, message: "must be one of the manifest scope levels" });
    }
    if (
      operation.minimumScope &&
      operationResource?.minimumScope &&
      adminScopeLevelRank(operation.minimumScope) < adminScopeLevelRank(operationResource.minimumScope)
    ) {
      issues.push({
        path: `$.operations[${index}].minimumScope`,
        message: "must be the resource minimum scope or a deeper descendant",
      });
    }
    if (!operation.target) {
      issues.push({
        path: `$.operations[${index}].target`,
        message: "operations must declare a resource or collection target",
      });
    }
    if (
      operation.safety.classification !== "read" &&
      operation.safety.audit !== "required"
    ) {
      issues.push({
        path: `$.operations[${index}].safety.audit`,
        message: "mutations must require audit",
      });
    }
    if (
      operation.safety.classification === "destructive" &&
      !operation.safety.requiresConfirmation
    ) {
      issues.push({
        path: `$.operations[${index}].safety.requiresConfirmation`,
        message: "destructive operations must require confirmation",
      });
    }
    if (operation.safety.confirmation && !operation.safety.requiresConfirmation) {
      issues.push({
        path: `$.operations[${index}].safety.requiresConfirmation`,
        message: "must be true when high-risk confirmation metadata is declared",
      });
    }
    if (operation.safety.confirmation) {
      if (!operation.safety.confirmation.reason.trim()) {
        issues.push({ path: `$.operations[${index}].safety.confirmation.reason`, message: "must not be empty" });
      }
      if (
        operation.safety.confirmation.maxAgeSeconds !== undefined &&
        (!Number.isInteger(operation.safety.confirmation.maxAgeSeconds) || operation.safety.confirmation.maxAgeSeconds <= 0)
      ) {
        issues.push({ path: `$.operations[${index}].safety.confirmation.maxAgeSeconds`, message: "must be a positive integer" });
      }
    }
    for (const [kind, fields] of Object.entries({
      inputFields: operation.redaction?.inputFields,
      outputFields: operation.redaction?.outputFields,
    }) as Array<[string, readonly string[] | undefined]>) {
      const normalized = (fields ?? []).map((field) =>
        field.trim().replace(/[-_\s]/g, "").toLowerCase(),
      );
      if (normalized.some((field) => !field))
        issues.push({
          path: `$.operations[${index}].redaction.${kind}`,
          message: "must not contain blank field names",
        });
      if ((fields ?? []).some((field) => !/^[A-Za-z][A-Za-z0-9_-]*$/.test(field)))
        issues.push({
          path: `$.operations[${index}].redaction.${kind}`,
          message: "must contain simple field names rather than paths",
        });
      if (new Set(normalized).size !== normalized.length)
        issues.push({
          path: `$.operations[${index}].redaction.${kind}`,
          message: "must contain unique normalized field names",
        });
    }
    const allowOutputPaths = operation.redaction?.allowOutputPaths ?? [];
    if (allowOutputPaths.length > 0) {
      const confirmation = operation.safety.confirmation;
      if (
        operation.safety.audit !== "required" ||
        !operation.safety.requiresConfirmation ||
        !confirmation ||
        !["recent-auth", "mfa", "approval"].includes(confirmation.method) ||
        operation.safety.idempotent !== false
      ) {
        issues.push({
          path: `$.operations[${index}].redaction.allowOutputPaths`,
          message: "one-time output secrets require audited, confirmed, non-idempotent recent-auth, MFA, or approval",
        });
      }
      if (new Set(allowOutputPaths).size !== allowOutputPaths.length) {
        issues.push({
          path: `$.operations[${index}].redaction.allowOutputPaths`,
          message: "must contain unique exact JSON paths",
        });
      }
      if (!operation.outputSchema || allowOutputPaths.some((path) => !outputPathResolves(operation.outputSchema!, path))) {
        issues.push({
          path: `$.operations[${index}].redaction.allowOutputPaths`,
          message: "must contain exact JSON paths through closed non-union objects and explicit array wildcards to string scalar leaves",
        });
      }
      const denied = new Set((operation.redaction?.outputFields ?? []).map((field) => field.replace(/[-_\s]/g, "").toLowerCase()));
      if (allowOutputPaths.some((path) => denied.has((path.split(".").at(-1) ?? "").replace(/[-_\s]/g, "").toLowerCase()))) {
        issues.push({ path: `$.operations[${index}].redaction`, message: "cannot both redact and allow the same output field" });
      }
    }
    if (
      [
        ...(operation.redaction?.inputFields ?? []),
        ...(operation.redaction?.outputFields ?? []),
        ...(operation.redaction?.allowOutputPaths ?? []),
      ].length > 0 &&
      operation.safety.audit !== "required"
    ) {
      issues.push({
        path: `$.operations[${index}].safety.audit`,
        message: "operations with declared sensitive fields must require audit",
      });
    }
    if (operation.target) {
      if (manifest.resources && !resourceIds.has(operation.target.resource)) {
        issues.push({ path: `$.operations[${index}].target.resource`, message: "must name a declared manifest resource" });
      }
      if (!operation.target.resource.trim())
        issues.push({
          path: `$.operations[${index}].target.resource`,
          message: "must not be blank",
        });
      if (
        operation.target.idInput !== undefined &&
        !operation.target.idInput.trim()
      )
        issues.push({
          path: `$.operations[${index}].target.idInput`,
          message: "must not be blank",
        });
      if (operation.target.collection === true && operation.target.idInput) {
        issues.push({
          path: `$.operations[${index}].target`,
          message: "must declare either a collection or an idInput, not both",
        });
      }
      if (
        operation.safety.classification === "destructive" &&
        operation.target.collection === true
      ) {
        issues.push({
          path: `$.operations[${index}].target`,
          message: "destructive targets must identify one resource",
        });
      }
      if (operation.target.collection !== true && !operation.target.idInput) {
        issues.push({
          path: `$.operations[${index}].target`,
          message: "must declare a collection or an idInput",
        });
      }
      if (
        operation.target.idInput &&
        !operation.inputSchema?.required?.includes(operation.target.idInput)
      ) {
        issues.push({
          path: `$.operations[${index}].inputSchema.required`,
          message: "must require the target idInput",
        });
      }
      if (
        operation.target.idInput &&
        !operation.inputSchema?.properties?.[operation.target.idInput]
      ) {
        issues.push({
          path: `$.operations[${index}].inputSchema.properties`,
          message: "must define the target idInput",
        });
      }
    }
    if (operation.mcp && typeof operation.mcp === "object") {
      if (
        operation.mcp.name !== undefined &&
        !/^[A-Za-z0-9_-]{1,128}$/.test(operation.mcp.name)
      ) {
        issues.push({
          path: `$.operations[${index}].mcp.name`,
          message: "must be a 1-128 character MCP-safe tool name",
        });
      }
      const expectedRead = operation.safety.classification === "read";
      const expectedDestructive =
        operation.safety.classification === "destructive";
      if (
        operation.mcp.readOnlyHint !== undefined &&
        operation.mcp.readOnlyHint !== expectedRead
      )
        issues.push({
          path: `$.operations[${index}].mcp.readOnlyHint`,
          message: "must match the operation safety classification",
        });
      if (
        operation.mcp.destructiveHint !== undefined &&
        operation.mcp.destructiveHint !== expectedDestructive
      )
        issues.push({
          path: `$.operations[${index}].mcp.destructiveHint`,
          message: "must match the operation safety classification",
        });
      if (
        operation.mcp.idempotentHint !== undefined &&
        operation.mcp.idempotentHint !== Boolean(operation.safety.idempotent)
      )
        issues.push({
          path: `$.operations[${index}].mcp.idempotentHint`,
          message: "must match the operation idempotency declaration",
        });
    }
    try {
      const [inputSchema, outputSchema] = operationSchemas(operation);
      validateSupportedSchema(inputSchema, `$.operations[${index}].inputSchema`, issues);
      validateSupportedSchema(outputSchema, `$.operations[${index}].outputSchema`, issues);
      if (inputSchema.type !== "object") {
        issues.push({
          path: `$.operations[${index}].inputSchema.type`,
          message: "must be object because REST and MCP administration transports accept named fields",
        });
      }
    } catch (error) {
      issues.push({
        path: `$.operations[${index}]`,
        message: error instanceof Error ? error.message : "schemas are invalid",
      });
    }
  });
  if (manifest.health) {
    if (!manifest.health.operationId && !manifest.health.path) {
      issues.push({
        path: "$.health",
        message: "must reference a declared read operation or route",
      });
    }
    const healthOperation = manifest.health.operationId
      ? manifest.operations.find(
          (operation) => operation.id === manifest.health?.operationId,
        )
      : undefined;
    if (manifest.health.operationId && !healthOperation) {
      issues.push({
        path: "$.health.operationId",
        message: "must name a declared operation",
      });
    } else if (
      healthOperation &&
      healthOperation.safety.classification !== "read"
    ) {
      issues.push({
        path: "$.health.operationId",
        message: "must name a read operation",
      });
    }
    const healthPathOperation = manifest.health.path
      ? manifest.operations.find(
          (operation) =>
            operation.safety.classification === "read" &&
            operationRoutePath(operation) === manifest.health?.path,
        )
      : undefined;
    if (manifest.health.path && !healthPathOperation) {
      issues.push({
        path: "$.health.path",
        message: "must exactly match a declared read route",
      });
    }
    if (
      healthOperation &&
      manifest.health.path &&
      operationRoutePath(healthOperation) !== manifest.health.path
    ) {
      issues.push({
        path: "$.health",
        message: "operationId and path must identify the same read operation",
      });
    }
  }
  return issues;
}

export function assertAdminCapabilityManifest(
  manifest: AdminCapabilityManifest,
): void {
  const issues = validateAdminCapabilityManifest(manifest);
  if (issues.length > 0)
    throw new AdminError(
      "invalid_argument",
      `Invalid admin capability manifest: ${manifest.id}.`,
      { details: { issues } },
    );
}

export { stableSerialize };
