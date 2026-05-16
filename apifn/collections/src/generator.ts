import { fromRouter, type OpenAPIDocument, type Router } from "@apifn/core";
import type {
  Collection,
  CollectionGenerateOptions,
  CollectionItem,
  OpenCollectionRequest,
  RouterCollectionOptions,
} from "./types.js";

const HTTP_METHODS = [
  "get",
  "put",
  "post",
  "delete",
  "options",
  "head",
  "patch",
  "trace",
] as const;

type HttpMethod = (typeof HTTP_METHODS)[number];

interface OperationRecord {
  path: string;
  method: HttpMethod;
  operation: NonNullable<OpenAPIDocument["paths"][string][HttpMethod]>;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function toTitle(value: string): string {
  return value
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim();
}

function pathToTemplate(pathname: string): string {
  return pathname.replace(/\{([^}]+)\}/g, "{{$1}}");
}

function defaultFromSchema(schema: unknown): unknown {
  if (!schema || typeof schema !== "object") {
    return undefined;
  }

  const record = schema as Record<string, unknown>;

  if (record.example !== undefined) {
    return record.example;
  }

  if (Array.isArray(record.enum) && record.enum.length > 0) {
    return record.enum[0];
  }

  const typeValue = record.type;
  const type = Array.isArray(typeValue) ? typeValue.find((t) => t !== "null") : typeValue;

  if (type === "object") {
    const properties = record.properties as Record<string, unknown> | undefined;
    if (!properties) {
      return {};
    }

    const result: Record<string, unknown> = {};
    for (const [key, propertySchema] of Object.entries(properties)) {
      const value = defaultFromSchema(propertySchema);
      if (value !== undefined) {
        result[key] = value;
      }
    }
    return result;
  }

  if (type === "array") {
    const itemSchema = record.items;
    const item = defaultFromSchema(itemSchema);
    return item === undefined ? [] : [item];
  }

  if (type === "string") {
    return "string";
  }

  if (type === "integer" || type === "number") {
    return 0;
  }

  if (type === "boolean") {
    return true;
  }

  return undefined;
}

function explicitExampleValue(example: unknown): unknown {
  if (!example || typeof example !== "object" || Array.isArray(example)) {
    return example;
  }

  if ("value" in example) {
    return (example as { value: unknown }).value;
  }

  return undefined;
}

function inferRequestBody(operation: OperationRecord["operation"]): OpenCollectionRequest["http"]["body"] | undefined {
  const media = operation.requestBody && "content" in operation.requestBody
    ? operation.requestBody.content["application/json"]
    : undefined;

  if (!media) {
    return undefined;
  }

  const namedExample = media.examples ? explicitExampleValue(Object.values(media.examples)[0]) : undefined;
  const explicitExample = media.example ?? namedExample;
  const payload = explicitExample !== undefined ? explicitExample : defaultFromSchema(media.schema);

  if (payload === undefined) {
    return undefined;
  }

  return {
    type: "json",
    data: JSON.stringify(payload, null, 2),
  };
}

function operationToRequest(
  operationRecord: OperationRecord,
  baseUrlVariable = "{{baseUrl}}"
): OpenCollectionRequest {
  const requestName = operationRecord.operation.operationId
    ? operationRecord.operation.operationId
    : operationRecord.operation.summary
    ? operationRecord.operation.summary
    : toTitle(`${operationRecord.method} ${operationRecord.path}`);

  return {
    info: {
      name: requestName,
      type: "http",
    },
    http: {
      method: operationRecord.method.toUpperCase(),
      url: `${baseUrlVariable}${pathToTemplate(operationRecord.path)}`,
      ...(inferRequestBody(operationRecord.operation)
        ? { body: inferRequestBody(operationRecord.operation) }
        : {}),
    },
  };
}

function collectOperations(document: OpenAPIDocument): OperationRecord[] {
  const records: OperationRecord[] = [];

  for (const [pathname, pathItem] of Object.entries(document.paths)) {
    for (const method of HTTP_METHODS) {
      const operation = pathItem[method];
      if (operation && typeof operation === "object") {
        records.push({
          path: pathname,
          method,
          operation,
        });
      }
    }
  }

  return records;
}

function groupKeyByPath(pathname: string): string {
  const firstSegment = pathname.split("/").filter(Boolean)[0];
  return firstSegment ? slugify(firstSegment) : "root";
}

function createRequestItem(
  groupKey: string,
  request: OpenCollectionRequest,
  operationRecord: OperationRecord,
  seq: number
): CollectionItem {
  const nameSlug = slugify(request.info.name);
  const methodPrefix = operationRecord.method.toLowerCase();
  const fallbackPathSlug = slugify(operationRecord.path.replace(/[{}]/g, "")) || "root";
  const fileName = `${nameSlug || `${methodPrefix}-${fallbackPathSlug}`}.yml`;

  return {
    kind: "request",
    name: request.info.name,
    path: `${groupKey}/${fileName}`,
    request: {
      ...request,
      info: {
        ...request.info,
        seq,
      },
    },
    seq,
  };
}

function toFolderItems(
  grouped: Map<string, OperationRecord[]>,
  options: CollectionGenerateOptions
): CollectionItem[] {
  const folders: CollectionItem[] = [];

  const sortedGroups = Array.from(grouped.entries()).sort(([a], [b]) =>
    a.localeCompare(b)
  );

  for (let index = 0; index < sortedGroups.length; index += 1) {
    const [groupKey, operations] = sortedGroups[index];
    const sortedOperations = [...operations].sort((a, b) => {
      if (a.path !== b.path) {
        return a.path.localeCompare(b.path);
      }
      return a.method.localeCompare(b.method);
    });

    const children = sortedOperations.map((operation, seq) => {
      const request = operationToRequest(operation);
      return createRequestItem(groupKey, request, operation, seq + 1);
    });

    folders.push({
      kind: "folder",
      name: toTitle(groupKey),
      path: groupKey,
      children,
      seq: index + 1,
    });
  }

  return folders;
}

export function openAPIToCollection(
  document: OpenAPIDocument,
  options: CollectionGenerateOptions = {}
): Collection {
  const operations = collectOperations(document);
  const grouped = new Map<string, OperationRecord[]>();
  const groupBy = options.groupBy ?? "tag";

  for (const operation of operations) {
    const tag = operation.operation.tags?.[0];
    const groupKey = groupBy === "tag"
      ? slugify(tag ?? groupKeyByPath(operation.path))
      : groupKeyByPath(operation.path);

    const existing = grouped.get(groupKey) ?? [];
    existing.push(operation);
    grouped.set(groupKey, existing);
  }

  const baseUrl = options.baseUrl ?? document.servers?.[0]?.url ?? "http://localhost:3000";
  const environmentName = options.environmentName ?? "development";

  return {
    info: {
      name: document.info.title,
      version: document.info.version,
      description: document.info.description,
      type: "collection",
    },
    rootDir: "",
    environments: {
      [environmentName]: {
        name: environmentName,
        variables: {
          baseUrl,
        },
      },
    },
    items: toFolderItems(grouped, options),
  };
}

export function routerToCollection(
  router: Router<unknown>,
  options: RouterCollectionOptions & {
    info?: OpenAPIDocument["info"];
    servers?: OpenAPIDocument["servers"];
  } = {}
): Collection {
  const openApi = fromRouter(router, {
    info: options.info ?? { title: "API", version: "1.0.0" },
    servers: options.servers,
    include: options.include,
    exclude: options.exclude,
    basePath: options.basePath,
  });

  return openAPIToCollection(openApi, {
    baseUrl: options.baseUrl,
    groupBy: options.groupBy,
    includeExamples: options.includeExamples,
  });
}
