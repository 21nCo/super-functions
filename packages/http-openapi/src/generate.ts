import type { OpenApiRouteMeta, Route, Router } from "@superfunctions/http";

const METHOD_ORDER = ["get", "post", "put", "patch", "delete", "options", "head"] as const;

export interface OpenApiRouter {
  getRoutes(): Route[];
}

export interface GenerateOpenApiDocumentInput {
  title: string;
  version: string;
  routers: Array<Pick<Router, "getRoutes"> | OpenApiRouter>;
}

export interface OpenApiGenerationErrorDetails {
  method?: string;
  path?: string;
}

export class OpenApiGenerationError extends Error {
  readonly code: "OPENAPI_META_INCOMPLETE";
  readonly details?: OpenApiGenerationErrorDetails;

  constructor(message: string, details?: OpenApiGenerationErrorDetails) {
    super(message);
    this.name = "OpenApiGenerationError";
    this.code = "OPENAPI_META_INCOMPLETE";
    this.details = details;
  }
}

export function generateOpenApiDocument(input: GenerateOpenApiDocumentInput): Record<string, unknown> {
  const pathEntries = new Map<string, Map<string, Record<string, unknown>>>();

  for (const route of collectRoutes(input.routers)) {
    const meta = route.meta?.openapi;
    if (!meta || meta.include === false) {
      continue;
    }

    if (!meta.operationId) {
      throw new OpenApiGenerationError("route OpenAPI metadata requires operationId", {
        method: route.method,
        path: route.path
      });
    }

    const normalizedPath = normalizeOpenApiPath(route.path);
    const normalizedMethod = route.method.toLowerCase();
    const operations = pathEntries.get(normalizedPath) ?? new Map<string, Record<string, unknown>>();
    if (operations.has(normalizedMethod)) {
      throw new OpenApiGenerationError("duplicate OpenAPI operation for method and path", {
        method: route.method,
        path: normalizedPath
      });
    }
    operations.set(normalizedMethod, buildOperation(meta, normalizedPath, route.method));
    pathEntries.set(normalizedPath, operations);
  }

  const paths = Object.fromEntries(
    [...pathEntries.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([path, operations]) => [
        path,
        Object.fromEntries(
          [...operations.entries()].sort(([left], [right]) => compareMethods(left, right))
        )
      ])
  );

  return {
    openapi: "3.1.0",
    info: {
      title: input.title,
      version: input.version
    },
    paths
  };
}

function collectRoutes(routers: GenerateOpenApiDocumentInput["routers"]): Route[] {
  return routers.flatMap((router) => router.getRoutes());
}

function buildOperation(
  meta: OpenApiRouteMeta,
  normalizedPath: string,
  method: string
): Record<string, unknown> {
  const operation: Record<string, unknown> = {
    operationId: meta.operationId
  };

  if (meta.summary) {
    operation.summary = meta.summary;
  }

  if (meta.description) {
    operation.description = meta.description;
  }

  if (meta.tags && meta.tags.length > 0) {
    operation.tags = [...meta.tags].sort((left, right) => left.localeCompare(right));
  }

  if (meta.requestBodySchema) {
    operation.requestBody = {
      required: true,
      content: {
        "application/json": {
          schema: sortObject(meta.requestBodySchema)
        }
      }
    };
  }

  const pathParameters = createPathParameters(normalizedPath);
  if (pathParameters.length > 0) {
    operation.parameters = pathParameters;
  }

  operation.responses = createResponses(meta.responseSchemas, {
    method,
    path: normalizedPath,
  });
  return operation;
}

function createResponses(
  responseSchemas: OpenApiRouteMeta["responseSchemas"],
  details: OpenApiGenerationErrorDetails
): Record<string, Record<string, unknown>> {
  if (!responseSchemas || Object.keys(responseSchemas).length === 0) {
    return {
      "200": {
        description: "Success"
      }
    };
  }

  return Object.fromEntries(
    Object.entries(responseSchemas)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([statusCode, schema]) => [
        statusCode,
        {
          description: `HTTP ${statusCode} response`,
          content: {
            "application/json": {
              schema: sortObject(assertSchemaObject(schema, details))
            }
          }
        }
      ])
  );
}

function normalizeOpenApiPath(path: string): string {
  return path.replace(/:([A-Za-z0-9_]+)/g, "{$1}");
}

function createPathParameters(path: string): Array<Record<string, unknown>> {
  const matches = path.matchAll(/\{([A-Za-z0-9_]+)\}/g);
  return [...matches].map((match) => ({
    name: match[1],
    in: "path",
    required: true,
    schema: {
      type: "string"
    }
  }));
}

function compareMethods(left: string, right: string): number {
  const orderDiff = getMethodOrder(left) - getMethodOrder(right);
  return orderDiff !== 0 ? orderDiff : left.localeCompare(right);
}

function getMethodOrder(method: string): number {
  const normalized = method.toLowerCase();
  const index = METHOD_ORDER.indexOf(normalized as (typeof METHOD_ORDER)[number]);
  return index >= 0 ? index : METHOD_ORDER.length;
}

function sortObject(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entryValue]) => [key, sortValue(entryValue)])
  );
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sortValue(item));
  }

  if (value && typeof value === "object") {
    return sortObject(value as Record<string, unknown>);
  }

  return value;
}

function assertSchemaObject(
  schema: unknown,
  details: OpenApiGenerationErrorDetails
): Record<string, unknown> {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
    throw new OpenApiGenerationError("route OpenAPI response schema must be an object", details);
  }

  return schema as Record<string, unknown>;
}
