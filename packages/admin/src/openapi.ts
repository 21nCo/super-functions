import { AdminError } from "./errors.js";
import type { AdminCapabilityRegistry, AdminRegistryOperation } from "./registry.js";
import { adminOperationMinimumScope } from "./scope.js";
import type { AdminJsonSchema, AdminObjectSchema } from "./types.js";

export interface AdminOpenApiOptions {
  title?: string;
  version?: string;
  description?: string;
  serverUrl?: string;
  /** Deployment/provider-owned schemes referenced by every protected operation. */
  securitySchemes: Readonly<Record<string, unknown>>;
  /** Exact provider-owned CSRF header to document for unsafe cookie-authenticated requests. */
  csrfHeader?: Readonly<{
    name: string;
    description?: string;
  }>;
}

export interface AdminOpenApiDocument {
  openapi: "3.1.0";
  info: { title: string; version: string; description?: string };
  servers?: readonly { url: string }[];
  paths: Record<string, Record<string, unknown>>;
  components: Record<string, unknown>;
  tags: readonly Record<string, unknown>[];
  [extension: `x-${string}`]: unknown;
}

const ERROR_SCHEMA: AdminObjectSchema = {
  type: "object",
  properties: {
    ok: { type: "boolean", const: false },
    error: {
      type: "object",
      properties: {
        code: { type: "string" },
        message: { type: "string" },
        status: { type: "integer" },
        details: {},
        retryable: { type: "boolean" },
      },
      required: ["code", "message", "status"],
      additionalProperties: false,
    },
    requestId: { type: "string" },
    correlationId: { type: "string" },
    auditId: { type: "string" },
    meta: { type: "object", additionalProperties: true },
  },
  required: ["ok", "error"],
  additionalProperties: false,
};

const SCOPE_QUERY_PARAMETERS: readonly Record<string, unknown>[] = [
  { name: "installationId", in: "query", required: false, description: "Override the authenticated installation root. Also accepted as X-SuperConsole-Installation-Id or X-Admin-Installation-Id.", schema: { type: "string", minLength: 1 } },
  { name: "organizationId", in: "query", required: false, deprecated: true, description: "Compatibility alias for installationId. Also accepted as X-SuperConsole-Organization-Id or X-Admin-Organization-Id.", schema: { type: "string", minLength: 1 } },
  { name: "workspaceId", in: "query", required: false, description: "Override the authenticated workspace. Also accepted as X-SuperConsole-Workspace-Id or X-Admin-Workspace-Id.", schema: { type: "string", minLength: 1 } },
  { name: "projectId", in: "query", required: false, description: "Override the authenticated project. Also accepted as X-SuperConsole-Project-Id or X-Admin-Project-Id.", schema: { type: "string", minLength: 1 } },
  { name: "environmentId", in: "query", required: false, description: "Override the authenticated environment. Also accepted as X-SuperConsole-Environment-Id or X-Admin-Environment-Id.", schema: { type: "string", minLength: 1 } },
  { name: "namespace", in: "query", required: false, description: "Optional execution namespace; also accepted as X-SuperConsole-Namespace.", schema: { type: "string" } },
  { name: "region", in: "query", required: false, description: "Optional execution region; also accepted as X-SuperConsole-Region.", schema: { type: "string" } },
];

export function adminOpenApiScopeParameters(): Record<string, unknown>[] {
  return SCOPE_QUERY_PARAMETERS.map((parameter) => ({ ...parameter }));
}

function route(entry: AdminRegistryOperation): { method: string; path: string; parameterNames: string[] } {
  const method = typeof entry.operation.route === "string"
    ? entry.operation.route.trim().split(/\s+/, 1)[0]!.toUpperCase()
    : entry.operation.route.method;
  const parameterNames: string[] = [];
  const path = entry.routePath
    .replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, (_, name: string) => { parameterNames.push(name); return `{${name}}`; })
    .replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_, name: string) => { if (!parameterNames.includes(name)) parameterNames.push(name); return `{${name}}`; });
  return { method, path, parameterNames };
}

function withoutProperties(schema: AdminJsonSchema, names: readonly string[]): AdminJsonSchema | undefined {
  if (schema.type !== "object" || !schema.properties) return schema;
  const properties = Object.fromEntries(Object.entries(schema.properties).filter(([name]) => !names.includes(name)));
  if (Object.keys(properties).length === 0) return undefined;
  return { ...schema, properties, required: schema.required?.filter((name) => !names.includes(name)) };
}

function parametersFor(schema: AdminJsonSchema, parameterNames: readonly string[], includeQuery: boolean): Record<string, unknown>[] {
  const parameters: Record<string, unknown>[] = [];
  for (const name of parameterNames) {
    parameters.push({ name, in: "path", required: true, schema: schema.properties?.[name] ?? { type: "string" } });
  }
  if (includeQuery && schema.type === "object") {
    for (const [name, property] of Object.entries(schema.properties ?? {})) {
      if (!parameterNames.includes(name)) {
        const types = property.type === undefined
          ? []
          : Array.isArray(property.type) ? property.type : [property.type];
        parameters.push({
          name,
          in: "query",
          required: schema.required?.includes(name) ?? false,
          ...(types.includes("object") || types.includes("array")
            ? {
                description: "JSON-encoded query parameter.",
                content: { "application/json": { schema: property } },
              }
            : { schema: property }),
        });
      }
    }
  }
  return parameters;
}

export function createAdminOpenApiDocument(
  registry: AdminCapabilityRegistry,
  options: AdminOpenApiOptions,
): AdminOpenApiDocument {
  const securitySchemes = options?.securitySchemes;
  if (!securitySchemes?.operatorSession || !securitySchemes.operatorApiKey) {
    throw new AdminError(
      "invalid_argument",
      "OpenAPI security schemes must define operatorSession and operatorApiKey because protected operations reference both schemes.",
    );
  }
  if (options.csrfHeader && !options.csrfHeader.name.trim()) {
    throw new AdminError("invalid_argument", "OpenAPI CSRF header metadata must define a nonblank provider header name.");
  }
  const paths: Record<string, Record<string, unknown>> = {};
  for (const entry of registry.operations) {
    const { method, path, parameterNames } = route(entry);
    const input = entry.operation.inputSchema;
    const output = entry.operation.outputSchema;
    if (!input || !output) throw new AdminError("internal", `Operation ${entry.operation.id} has incomplete schemas.`);
    const isReadMethod = method === "GET" || method === "DELETE";
    const parameters = parametersFor(input, parameterNames, isReadMethod);
    for (const scopeParameter of adminOpenApiScopeParameters()) {
      if (!parameters.some((parameter) => parameter.name === scopeParameter.name && parameter.in === scopeParameter.in)) {
        parameters.push(scopeParameter);
      }
    }
    if (entry.operation.safety.classification !== "read" && entry.operation.safety.idempotent) {
      parameters.push({
        name: "Idempotency-Key",
        in: "header",
        required: true,
        description: "Unique key scoped to actor, tenant scope, and operation.",
        schema: { type: "string", minLength: 1 },
      });
    }
    if (entry.operation.safety.classification !== "read" && options.csrfHeader) {
      parameters.push({
        name: options.csrfHeader.name,
        in: "header",
        required: false,
        description: options.csrfHeader.description
          ?? "Required for unsafe requests authenticated by the provider's cookie session; bearer/API-key authentication does not use CSRF validation.",
        schema: { type: "string", minLength: 1 },
      });
    }
    if (entry.operation.safety.requiresConfirmation) {
      parameters.push({
        name: "X-Admin-Confirmation",
        in: "header",
        required: true,
        description: "Expiring actor/scope/operation/input-bound confirmation token.",
        schema: { type: "string", minLength: 1 },
      });
    }
    const bodySchema = isReadMethod ? undefined : withoutProperties(input, parameterNames);
    const successSchema: AdminObjectSchema = {
      type: "object",
      properties: {
        ok: { type: "boolean", const: true },
        data: output,
        requestId: { type: "string" },
        correlationId: { type: "string" },
        auditId: { type: "string" },
        page: {
          type: "object",
          properties: {
            nextCursor: { type: ["string", "null"] },
            hasMore: { type: "boolean" },
          },
          additionalProperties: false,
        },
        warnings: { type: "array", items: { type: "string" } },
        meta: { type: "object", additionalProperties: true },
      },
      required: ["ok", "data"],
      additionalProperties: true,
    };
    const operation: Record<string, unknown> = {
      operationId: entry.operation.id,
      summary: entry.operation.title,
      description: entry.operation.description,
      tags: [entry.manifest.displayName],
      security: [{ operatorSession: [] }, { operatorApiKey: [] }],
      ...(parameters.length ? { parameters } : {}),
      ...(bodySchema ? { requestBody: { required: true, content: { "application/json": { schema: bodySchema } } } } : {}),
      responses: {
        "200": { description: "Administration operation completed.", content: { "application/json": { schema: successSchema } } },
        "4XX": { description: "Administration request rejected.", content: { "application/json": { schema: { $ref: "#/components/schemas/AdminError" } } } },
        "5XX": { description: "Administration dependency or server failure.", content: { "application/json": { schema: { $ref: "#/components/schemas/AdminError" } } } },
      },
      "x-superfunctions-module": entry.moduleId,
      "x-superfunctions-capability-version": entry.manifest.version,
      "x-superfunctions-permission": entry.operation.permission,
      "x-superfunctions-minimum-scope": adminOperationMinimumScope(entry.manifest, entry.operation),
      "x-superfunctions-safety": entry.operation.safety,
      ...(entry.operation.pagination ? { "x-superfunctions-pagination": entry.operation.pagination } : {}),
      ...(entry.operation.target ? { "x-superfunctions-target": entry.operation.target } : {}),
      ...(entry.operation.redaction ? { "x-superfunctions-redaction": {
        ...(entry.operation.redaction.inputFields ? { inputFields: entry.operation.redaction.inputFields } : {}),
        ...(entry.operation.redaction.outputFields ? { outputFields: entry.operation.redaction.outputFields } : {}),
        ...(entry.operation.redaction.allowOutputPaths ? { oneTimeOutputPaths: entry.operation.redaction.allowOutputPaths } : {}),
      } } : {}),
    };
    paths[path] ??= {};
    if (paths[path]![method.toLowerCase()]) throw new AdminError("conflict", `OpenAPI operation collision: ${method} ${path}.`);
    paths[path]![method.toLowerCase()] = operation;
  }

  return {
    openapi: "3.1.0",
    info: {
      title: options.title ?? "Super Console Administration API",
      version: options.version ?? "1.0.0",
      ...(options.description ? { description: options.description } : {}),
    },
    ...(options.serverUrl ? { servers: [{ url: options.serverUrl }] } : {}),
    paths,
    components: {
      schemas: { AdminError: ERROR_SCHEMA },
      securitySchemes,
    },
    tags: registry.manifests.map((manifest) => ({
      name: manifest.displayName,
      description: manifest.description,
      "x-superfunctions-module": manifest.id,
      ...(manifest.owner ? { "x-superfunctions-owner": manifest.owner } : {}),
    })),
    "x-superfunctions-enabled-modules": registry.enabledModuleIds,
    "x-superfunctions-registry-schema": "1.0",
  };
}

export const generateAdminOpenApi = createAdminOpenApiDocument;
