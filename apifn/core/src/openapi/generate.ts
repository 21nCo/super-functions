import { convertSchema } from "../schema/convert.js";
import type {
  IntrospectedRoute,
  JsonSchema,
  OpenAPIDocument,
  OpenAPIGenerateOptions,
  OperationObject,
  ParameterObject,
  PathItemObject,
  PathsObject,
  ResponseDescriptor,
  ResponseObject,
  SecurityRequirement,
  TagObject,
} from "../types.js";

const METHOD_ORDER = [
  "get",
  "put",
  "post",
  "delete",
  "options",
  "head",
  "patch",
  "trace",
] as const;

type HttpMethodKey = (typeof METHOD_ORDER)[number];

function methodKey(method: string): HttpMethodKey {
  return method.toLowerCase() as HttpMethodKey;
}

function toOperationId(route: IntrospectedRoute): string {
  if (route.operationId) {
    return route.operationId;
  }

  const method = route.method.toLowerCase();
  const pathToken = route.path
    .replace(/[{}]/g, "")
    .replace(/[^A-Za-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .map((segment, index) =>
      index === 0
        ? segment.toLowerCase()
        : segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase()
    )
    .join("");

  return `${method}${pathToken.charAt(0).toUpperCase()}${pathToken.slice(1)}`;
}

function sortedUnique(values: string[]): string[] {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeOptionalSchema(schema: JsonSchema): JsonSchema {
  if (!isObject(schema)) {
    return schema;
  }

  const anyOf = schema.anyOf;
  if (!Array.isArray(anyOf) || anyOf.length !== 2) {
    return schema;
  }

  const first = anyOf[0];
  const second = anyOf[1];
  if (isObject(first) && "not" in first && isObject(second)) {
    return second as JsonSchema;
  }

  return schema;
}

function toParameters(route: IntrospectedRoute): ParameterObject[] | undefined {
  if (!route.parameters.length) {
    return undefined;
  }

  const parameters = route.parameters.map((parameter) => ({
    name: parameter.name,
    in: parameter.in,
    required: parameter.required,
    description: parameter.description,
    deprecated: parameter.deprecated,
    schema: normalizeOptionalSchema(convertSchema(parameter.schema)),
  }));

  return parameters.sort((a, b) => {
    if (a.in !== b.in) {
      return a.in.localeCompare(b.in);
    }
    return a.name.localeCompare(b.name);
  });
}

function toResponses(route: IntrospectedRoute): Record<string, ResponseObject> {
  const entries = Object.entries(route.responses) as Array<
    [string, ResponseDescriptor]
  >;
  const withFallback: Array<[string, ResponseDescriptor]> = entries.length
    ? entries
    : [["200", { description: "Success" }]];

  const sorted = withFallback.sort(([a], [b]) => {
    const aNum = Number(a);
    const bNum = Number(b);

    if (Number.isNaN(aNum) || Number.isNaN(bNum)) {
      return a.localeCompare(b);
    }

    return aNum - bNum;
  });

  return Object.fromEntries(
    sorted.map(([status, response]) => {
      const normalized: ResponseObject = {
        description: response.description || "Success",
      };

      if (response.content?.["application/json"]?.schema) {
        normalized.content = {
          "application/json": {
                schema: normalizeOptionalSchema(
                  convertSchema(response.content["application/json"].schema)
                ),
          },
        };
      }

      if (response.headers) {
        normalized.headers = Object.fromEntries(
          Object.entries(response.headers)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([header, headerValue]) => [
              header,
              {
                description: headerValue.description,
                schema: normalizeOptionalSchema(convertSchema(headerValue.schema)),
              },
            ])
        );
      }

      return [status, normalized];
    })
  );
}

function toOperation(route: IntrospectedRoute): OperationObject {
  const operation: OperationObject = {
    operationId: toOperationId(route),
    responses: toResponses(route),
  };

  if (route.summary) {
    operation.summary = route.summary;
  }

  if (route.description) {
    operation.description = route.description;
  }

  if (route.deprecated !== undefined) {
    operation.deprecated = route.deprecated;
  }

  if (route.tags?.length) {
    operation.tags = sortedUnique(route.tags);
  }

  const parameters = toParameters(route);
  if (parameters?.length) {
    operation.parameters = parameters;
  }

  if (route.requestBody?.content?.["application/json"]?.schema) {
    operation.requestBody = {
      required: route.requestBody.required ?? true,
      description: route.requestBody.description,
      content: {
        "application/json": {
          schema: normalizeOptionalSchema(
            convertSchema(route.requestBody.content["application/json"].schema)
          ),
        },
      },
    };
  }

  if (route.security?.length) {
    operation.security = route.security as SecurityRequirement[];
  }

  return operation;
}

function toPaths(routes: IntrospectedRoute[]): PathsObject {
  const grouped = new Map<string, IntrospectedRoute[]>();

  for (const route of routes) {
    const existing = grouped.get(route.path) ?? [];
    existing.push(route);
    grouped.set(route.path, existing);
  }

  const sortedPaths = Array.from(grouped.entries()).sort(([a], [b]) =>
    a.localeCompare(b)
  );

  const paths: PathsObject = {};

  for (const [path, pathRoutes] of sortedPaths) {
    const item: PathItemObject = {};
    const sortedRoutes = [...pathRoutes].sort(
      (a, b) =>
        METHOD_ORDER.indexOf(methodKey(a.method)) -
        METHOD_ORDER.indexOf(methodKey(b.method))
    );

    for (const route of sortedRoutes) {
      const key = methodKey(route.method);
      (item as Record<HttpMethodKey, OperationObject>)[key] = toOperation(route);
    }

    paths[path] = item;
  }

  return paths;
}

function collectTags(routes: IntrospectedRoute[]): TagObject[] | undefined {
  const tags = sortedUnique(
    routes.flatMap((route) => route.tags ?? []).filter((tag) => Boolean(tag))
  );

  if (!tags.length) {
    return undefined;
  }

  return tags.map((name) => ({ name }));
}

function sortObjectDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => sortObjectDeep(item)) as T;
  }

  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    const sorted = Object.keys(object)
      .sort((a, b) => a.localeCompare(b))
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortObjectDeep(object[key]);
        return acc;
      }, {});

    return sorted as T;
  }

  return value;
}

export function generateOpenAPI(
  routes: IntrospectedRoute[],
  options: OpenAPIGenerateOptions
): OpenAPIDocument {
  const paths = toPaths(routes);
  const tags = collectTags(routes);

  const document: OpenAPIDocument = {
    openapi: "3.1.0",
    info: options.info,
    paths,
  };

  if (options.servers?.length) {
    document.servers = [...options.servers].sort((a, b) => a.url.localeCompare(b.url));
  }

  if (options.security?.length) {
    document.security = options.security;
  }

  if (options.externalDocs) {
    document.externalDocs = options.externalDocs;
  }

  if (tags?.length) {
    document.tags = tags;
  }

  if (options.securitySchemes && Object.keys(options.securitySchemes).length > 0) {
    document.components = {
      ...(document.components ?? {}),
      securitySchemes: Object.fromEntries(
        Object.entries(options.securitySchemes).sort(([a], [b]) => a.localeCompare(b))
      ),
    };
  }

  if (options.extensions) {
    for (const [key, value] of Object.entries(options.extensions)) {
      const extensionKey = key.startsWith("x-") ? key : `x-${key}`;
      document[extensionKey as `x-${string}`] = value;
    }
  }

  return sortObjectDeep(document);
}
