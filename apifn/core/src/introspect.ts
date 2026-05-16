import type {
  IntrospectOptions,
  IntrospectedRoute,
  JsonSchema,
  ParameterDescriptor,
  RequestBodyDescriptor,
  ResponseDescriptor,
  Route,
  Router,
  SchemaDescriptor,
  SchemaDescriptorResponse,
} from "./types.js";

const KNOWN_DESCRIPTOR_KEYS = [
  "body",
  "query",
  "params",
  "responses",
  "summary",
  "operationId",
  "tags",
  "description",
  "deprecated",
  "headers",
  "security",
] as const;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasSchemaDescriptor(meta: unknown): meta is SchemaDescriptor {
  if (!isObject(meta)) {
    return false;
  }

  return KNOWN_DESCRIPTOR_KEYS.some((key) => key in meta);
}

function normalizePathSegment(path: string): string {
  if (!path.startsWith("/")) {
    return `/${path}`;
  }

  return path;
}

function withBasePath(path: string, basePath?: string): string {
  const routePath = normalizePathSegment(path);

  if (!basePath) {
    return routePath;
  }

  const normalizedBasePath = normalizePathSegment(basePath).replace(/\/+$/, "");
  const normalizedRoutePath = routePath.replace(/^\/+/, "");

  if (!normalizedRoutePath) {
    return normalizedBasePath || "/";
  }

  if (normalizedBasePath === "/") {
    return `/${normalizedRoutePath}`;
  }

  return `${normalizedBasePath}/${normalizedRoutePath}`;
}

function toOpenApiPath(path: string): { path: string; pathParams: string[] } {
  const params: string[] = [];
  let openApiPath = "";
  let index = 0;

  while (index < path.length) {
    const char = path[index];
    if (char !== ":") {
      openApiPath += char;
      index += 1;
      continue;
    }

    let end = index + 1;
    while (end < path.length && /[A-Za-z0-9_]/.test(path[end])) {
      end += 1;
    }

    if (end === index + 1) {
      openApiPath += char;
      index += 1;
      continue;
    }

    const param = path.slice(index + 1, end);
    params.push(param);
    openApiPath += `{${param}}`;
    index = end;
  }

  return { path: openApiPath, pathParams: params };
}

function pathParamsToDescriptors(pathParams: string[]): ParameterDescriptor[] {
  return pathParams.map((name) => ({
    name,
    in: "path",
    required: true,
    schema: { type: "string" },
  }));
}

function applyParameterRecord(
  parameters: ParameterDescriptor[],
  source: Record<string, unknown> | undefined,
  location: ParameterDescriptor["in"],
  required: boolean
): void {
  if (!source) {
    return;
  }

  for (const [name, schema] of Object.entries(source)) {
    const existingIndex = parameters.findIndex(
      (parameter) => parameter.in === location && parameter.name === name
    );
    const descriptor: ParameterDescriptor = {
      name,
      in: location,
      required,
      schema: schema as JsonSchema,
    };

    if (existingIndex >= 0) {
      parameters[existingIndex] = descriptor;
    } else {
      parameters.push(descriptor);
    }
  }
}

function toRequestBody(descriptor: SchemaDescriptor): RequestBodyDescriptor | undefined {
  if (descriptor.body === undefined) {
    return undefined;
  }

  return {
    required: true,
    content: {
      "application/json": {
        schema: descriptor.body as JsonSchema,
      },
    },
  };
}

function toResponse(response: SchemaDescriptorResponse): ResponseDescriptor {
  const normalized: ResponseDescriptor = {
    description: response.description || "Success",
  };

  if (response.schema !== undefined) {
    normalized.content = {
      "application/json": {
        schema: response.schema as JsonSchema,
      },
    };
  }

  if (response.headers && isObject(response.headers)) {
    normalized.headers = Object.fromEntries(
      Object.entries(response.headers).map(([name, schema]) => [
        name,
        {
          schema: schema as JsonSchema,
        },
      ])
    );
  }

  return normalized;
}

function toResponses(descriptor?: SchemaDescriptor): Record<string, ResponseDescriptor> {
  if (!descriptor?.responses || Object.keys(descriptor.responses).length === 0) {
    return { "200": { description: "Success" } };
  }

  const responses: Record<string, ResponseDescriptor> = {};

  for (const [status, response] of Object.entries(descriptor.responses)) {
    responses[String(status)] = toResponse(response);
  }

  return responses;
}

function shouldIncludePath(path: string, prefixes?: string[]): boolean {
  if (!prefixes || prefixes.length === 0) {
    return true;
  }

  return prefixes.some((prefix) => path.startsWith(prefix));
}

function shouldExcludePath(path: string, prefixes?: string[]): boolean {
  if (!prefixes || prefixes.length === 0) {
    return false;
  }

  return prefixes.some((prefix) => path.startsWith(prefix));
}

function toIntrospectedRoute(
  route: Route<unknown>,
  options: IntrospectOptions
): IntrospectedRoute | null {
  const fullPath = withBasePath(route.path, options.basePath);

  if (!shouldIncludePath(fullPath, options.include)) {
    return null;
  }

  if (shouldExcludePath(fullPath, options.exclude)) {
    return null;
  }

  const { path, pathParams } = toOpenApiPath(fullPath);
  const rawMeta = route.meta;
  const meta = isObject(rawMeta) ? rawMeta : {};
  const descriptor: SchemaDescriptor | undefined = hasSchemaDescriptor(rawMeta)
    ? rawMeta
    : undefined;
  const parameters = pathParamsToDescriptors(pathParams);

  if (descriptor) {
    applyParameterRecord(parameters, descriptor.params, "path", true);
    applyParameterRecord(parameters, descriptor.query, "query", false);
    applyParameterRecord(parameters, descriptor.headers, "header", false);
  }

  return {
    method: route.method,
    path,
    operationId: descriptor?.operationId,
    summary: descriptor?.summary,
    description: descriptor?.description,
    tags: descriptor?.tags,
    deprecated: descriptor?.deprecated,
    parameters,
    requestBody: descriptor ? toRequestBody(descriptor) : undefined,
    responses: toResponses(descriptor),
    security: descriptor?.security,
    meta,
  };
}

export function introspectRouter(
  router: Router<unknown>,
  options: IntrospectOptions = {}
): IntrospectedRoute[] {
  const routes = router.getRoutes();
  const introspected: IntrospectedRoute[] = [];

  for (const route of routes) {
    const item = toIntrospectedRoute(route, options);
    if (item) {
      introspected.push(item);
    }
  }

  return introspected;
}
