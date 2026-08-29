import {
  getCapabilityFields,
  resolveCapabilities,
  type DatafnFieldSchema,
  type DatafnResourceSchema,
  type DatafnSchema,
} from "@datafn/core";
import {
  McpFnRegistry,
  McpFnValidationError,
  structuredResult,
  type McpFnJsonSchema,
  type McpFnToolDefinition,
} from "mcpfn";

import type {
  CreateDatafnMcpRegistryOptions,
  DatafnListToolOptions,
  DatafnReadToolOptions,
  DatafnResourceExposure,
  DatafnWriteToolOptions,
} from "./types.js";

type Operation = "list" | "get" | "create" | "update" | "delete";

function validateFieldList(label: string, fields: string[]): void {
  if (
    fields.length === 0 ||
    new Set(fields).size !== fields.length ||
    fields.some((field) => typeof field !== "string" || !field)
  ) {
    throw new McpFnValidationError(`${label} must be a non-empty, unique field list`);
  }
}

function validateLimit(label: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new McpFnValidationError(`${label} must be a positive safe integer`);
  }
}

async function resolveClientId<TMcpContext, TDatafnContext>(
  options: CreateDatafnMcpRegistryOptions<TMcpContext, TDatafnContext>,
  context: TMcpContext,
): Promise<string> {
  const clientId = typeof options.clientId === "string"
    ? options.clientId
    : await options.clientId(context);
  if (typeof clientId !== "string" || !clientId.trim()) {
    throw new McpFnValidationError("DataFn clientId must resolve to a non-empty string");
  }
  return clientId;
}

function safeSegment(value: string): string {
  let segment = "";
  let needsSeparator = false;
  for (const character of value) {
    const code = character.charCodeAt(0);
    const allowed =
      (code >= 48 && code <= 57) ||
      (code >= 65 && code <= 90) ||
      (code >= 97 && code <= 122) ||
      character === "_" || character === "." || character === "-";
    if (allowed) {
      if (needsSeparator && segment) segment += "_";
      segment += character;
      needsSeparator = false;
    } else {
      needsSeparator = true;
    }
  }
  let start = 0;
  let end = segment.length;
  while (start < end && segment[start] === "_") start += 1;
  while (end > start && segment[end - 1] === "_") end -= 1;
  return segment.slice(start, end);
}

function resourceDefaults(
  schema: DatafnSchema,
  resource: DatafnResourceSchema,
) {
  if (resource.permissions !== undefined || resource.defaultPermissions === false) {
    return undefined;
  }
  return schema.defaultPermissions;
}

function fieldSchema(field: DatafnFieldSchema): McpFnJsonSchema {
  const base: McpFnJsonSchema = (() => {
    switch (field.type) {
      case "number": return { type: "number" };
      case "boolean": return { type: "boolean" };
      case "array": return { type: "array", items: {} };
      case "object": return { type: "object", additionalProperties: true };
      case "json": return { type: ["string", "number", "boolean", "object", "array"] };
      case "date": return { type: ["string", "number"], format: "date-time" };
      case "file": return { type: "string" };
      default: return { type: "string" };
    }
  })();
  if (field.enum) base.enum = field.enum;
  if (field.min !== undefined) base.minimum = field.min;
  if (field.max !== undefined) base.maximum = field.max;
  if (field.minLength !== undefined) base.minLength = field.minLength;
  if (field.maxLength !== undefined) base.maxLength = field.maxLength;
  if (field.pattern !== undefined) base.pattern = field.pattern;
  if (field.nullable) {
    const currentTypes = Array.isArray(base.type) ? base.type : [base.type];
    base.type = [...new Set([...currentTypes, "null"])];
    if (Array.isArray(base.enum) && !base.enum.includes(null)) {
      base.enum = [...base.enum, null];
    }
  }
  return base;
}

function capabilitiesFor(
  schema: DatafnSchema,
  resource: DatafnResourceSchema,
) {
  return getCapabilityFields(
    resolveCapabilities(schema.capabilities as never, resource.capabilities as never) as never,
  );
}

function fieldMaps(
  schema: DatafnSchema,
  resource: DatafnResourceSchema,
) {
  const schemaFields = new Map(resource.fields.map((field) => [field.name, field]));
  for (const field of capabilitiesFor(schema, resource)) {
    schemaFields.set(field.name, field as DatafnFieldSchema);
  }
  const defaults = resourceDefaults(schema, resource);
  const readDefault = typeof defaults === "string" ? defaults : defaults?.read;
  const writeDefault = typeof defaults === "string" ? defaults : defaults?.write;
  const defaultFields = ["id", ...resource.fields.map((field) => field.name)];
  const readable = new Set([
    "id",
    ...(resource.permissions?.read?.fields ??
      (readDefault === "allResourceFields" ? defaultFields : [])),
  ]);
  for (const field of capabilitiesFor(schema, resource)) readable.add(field.name);
  const writable = new Set(
    resource.permissions?.write?.fields ??
      (writeDefault === "allResourceFields" ? defaultFields : []),
  );
  return { schemaFields, readable, writable };
}

function validateReadFields(
  schema: DatafnSchema,
  resource: DatafnResourceSchema,
  fields: string[],
): void {
  const defaults = resourceDefaults(schema, resource);
  const readDefault = typeof defaults === "string" ? defaults : defaults?.read;
  if (!resource.permissions?.read && readDefault !== "allResourceFields") {
    throw new McpFnValidationError(
      `DataFn resource ${resource.name} has no read policy and cannot be exposed`,
    );
  }
  const { schemaFields, readable } = fieldMaps(schema, resource);
  for (const field of fields) {
    if (field !== "id" && !schemaFields.has(field)) {
      throw new McpFnValidationError(
        `Unknown exposed field ${resource.name}.${field}`,
      );
    }
    if (!readable.has(field)) {
      throw new McpFnValidationError(
        `Field ${resource.name}.${field} is not readable by DataFn policy`,
      );
    }
  }
}

function validateWriteFields(
  schema: DatafnSchema,
  resource: DatafnResourceSchema,
  fields: string[],
): void {
  const defaults = resourceDefaults(schema, resource);
  const writeDefault = typeof defaults === "string" ? defaults : defaults?.write;
  if (!resource.permissions?.write && writeDefault !== "allResourceFields") {
    throw new McpFnValidationError(
      `DataFn resource ${resource.name} has no write policy and cannot expose mutations`,
    );
  }
  const { schemaFields, writable } = fieldMaps(schema, resource);
  for (const field of fields) {
    const definition = schemaFields.get(field);
    if (!definition) {
      throw new McpFnValidationError(`Unknown write field ${resource.name}.${field}`);
    }
    if (definition.readonly || !writable.has(field)) {
      throw new McpFnValidationError(
        `Field ${resource.name}.${field} is not writable by DataFn policy`,
      );
    }
  }
}

function operationOptions<T>(value: boolean | T | undefined, enabledByDefault: boolean): T | undefined {
  if (value === false) return undefined;
  if (value === true) return {} as T;
  if (value === undefined) return enabledByDefault ? ({} as T) : undefined;
  return value;
}

function outputSchema() {
  return {
    type: "object" as const,
    properties: {
      resource: { type: "string" },
      operation: { type: "string" },
      result: {},
    },
    required: ["resource", "operation", "result"],
    additionalProperties: false,
  };
}

function defaultName(prefix: string, resource: string, operation: Operation): string {
  return [prefix, safeSegment(resource), operation].filter(Boolean).join("_");
}

function assertUniqueToolNames<TMcpContext>(
  registry: McpFnRegistry<TMcpContext>,
  expose: Record<string, DatafnResourceExposure>,
  prefix: string,
): void {
  const owners = new Map<string, string>();
  for (const resourceName of Object.keys(expose).sort()) {
    const exposure = expose[resourceName]!;
    const operations: Array<[Operation, DatafnReadToolOptions | DatafnWriteToolOptions | undefined]> = [
      ["list", operationOptions<DatafnListToolOptions>(exposure.list, true)],
      ["get", operationOptions<DatafnReadToolOptions>(exposure.get, true)],
      ["create", exposure.create || undefined],
      ["update", exposure.update || undefined],
      ["delete", operationOptions<Omit<DatafnWriteToolOptions, "fields">>(exposure.delete, false)],
    ];
    for (const [operation, config] of operations) {
      if (!config) continue;
      const name = config.name ?? defaultName(prefix, resourceName, operation);
      const owner = `${resourceName}.${operation}`;
      const existing = owners.get(name);
      if (existing || registry.has(name)) {
        throw new McpFnValidationError(
          `DataFn tool name collision for ${name}: ${existing ?? "existing registry tool"} and ${owner}`,
        );
      }
      owners.set(name, owner);
    }
  }
}

export function createDatafnMcpRegistry<TMcpContext, TDatafnContext>(
  options: CreateDatafnMcpRegistryOptions<TMcpContext, TDatafnContext>,
): McpFnRegistry<TMcpContext> {
  const registry = options.registry ?? new McpFnRegistry<TMcpContext>();
  const schema = options.executor.schema;
  const prefix = safeSegment(options.toolPrefix ?? "datafn");
  if (typeof options.clientId === "string" && !options.clientId.trim()) {
    throw new McpFnValidationError("DataFn clientId must be a non-empty string");
  }
  assertUniqueToolNames(registry, options.expose, prefix);

  for (const resourceName of Object.keys(options.expose).sort()) {
    const exposure = options.expose[resourceName]!;
    const resource = schema.resources.find((candidate) => candidate.name === resourceName);
    if (!resource) {
      throw new McpFnValidationError(`Unknown DataFn resource: ${resourceName}`);
    }
    const list = operationOptions<DatafnListToolOptions>(exposure.list, true);
    const get = operationOptions<DatafnReadToolOptions>(exposure.get, true);
    validateFieldList(`DataFn resource ${resourceName} projection`, exposure.fields);
    if (list || get) validateReadFields(schema, resource, exposure.fields);
    const maps = fieldMaps(schema, resource);

    if (list) {
      const filterFields = list.filterFields ?? exposure.fields;
      const sortFields = list.sortFields ?? ["id"];
      validateFieldList(`DataFn resource ${resourceName} filterFields`, filterFields);
      validateFieldList(`DataFn resource ${resourceName} sortFields`, sortFields);
      validateReadFields(schema, resource, [...filterFields, ...sortFields]);
      const filterProperties = Object.fromEntries(
        filterFields.map((field) => [
          field,
          field === "id" ? { type: "string" } : fieldSchema(maps.schemaFields.get(field)!),
        ]),
      );
      const maxLimit = list.maxLimit ?? 100;
      validateLimit(`DataFn resource ${resourceName} maxLimit`, maxLimit);
      const defaultLimit = list.defaultLimit ?? Math.min(50, maxLimit);
      validateLimit(`DataFn resource ${resourceName} defaultLimit`, defaultLimit);
      if (defaultLimit > maxLimit) {
        throw new McpFnValidationError(
          `DataFn resource ${resourceName} defaultLimit cannot exceed maxLimit`,
        );
      }
      const definition: McpFnToolDefinition<TMcpContext> = {
        name: list.name ?? defaultName(prefix, resourceName, "list"),
        description:
          list.description ?? `List ${resourceName} records visible to the authenticated DataFn context.`,
        inputSchema: {
          type: "object",
          properties: {
            filters: {
              type: "object",
              properties: filterProperties,
              additionalProperties: false,
            },
            sort: {
              type: "array",
              items: {
                type: "string",
                enum: sortFields.flatMap((field) => [`${field}:asc`, `${field}:desc`]),
              },
              maxItems: Math.max(1, sortFields.length),
            },
            cursor: { type: "object", additionalProperties: true },
            limit: { type: "integer", minimum: 1, maximum: maxLimit },
          },
          additionalProperties: false,
        },
        outputSchema: outputSchema(),
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
        metadata: { "mcpfn/datafn": { resource: resourceName, operation: "list" } },
        handler: async (args, context) => {
          const requestedSort = args.sort as string[] | undefined;
          const querySort = requestedSort?.length
            ? [
                ...requestedSort.filter((term) => !term.startsWith("id:")),
                requestedSort.find((term) => term.startsWith("id:")) ?? "id:asc",
              ]
            : undefined;
          const result = await options.executor.query(
            {
              resource: resourceName,
              version: String(resource.version),
              select: exposure.fields,
              ...(args.filters ? { filters: args.filters } : {}),
              ...(querySort ? { sort: querySort } : {}),
              ...(args.cursor ? { cursor: args.cursor } : {}),
              limit: Math.min(Number(args.limit ?? defaultLimit), maxLimit),
            },
            await options.context(context),
          );
          return structuredResult({ resource: resourceName, operation: "list", result });
        },
      };
      registry.register(definition);
    }

    if (get) {
      registry.register({
        name: get.name ?? defaultName(prefix, resourceName, "get"),
        description: get.description ?? `Get one ${resourceName} record by ID.`,
        inputSchema: {
          type: "object",
          properties: { id: { type: "string", minLength: 1 } },
          required: ["id"],
          additionalProperties: false,
        },
        outputSchema: outputSchema(),
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
        metadata: { "mcpfn/datafn": { resource: resourceName, operation: "get" } },
        handler: async ({ id }, context) => {
          const result = await options.executor.query(
            {
              resource: resourceName,
              version: String(resource.version),
              select: exposure.fields,
              filters: { id },
              limit: 1,
            },
            await options.context(context),
          );
          return structuredResult({ resource: resourceName, operation: "get", result });
        },
      });
    }

    const registerWrite = (
      operation: "create" | "update",
      config: DatafnWriteToolOptions,
    ) => {
      validateFieldList(
        `DataFn resource ${resourceName} ${operation} fields`,
        config.fields,
      );
      validateWriteFields(schema, resource, config.fields);
      const requiredCreateFields = [...maps.schemaFields.values()]
        .filter((field) =>
          field.name !== "id" &&
          field.required &&
          field.default === undefined &&
          !field.readonly)
        .map((field) => field.name)
        .sort();
      if (operation === "create") {
        const missingRequiredFields = requiredCreateFields.filter(
          (field) => !config.fields.includes(field),
        );
        if (missingRequiredFields.length) {
          throw new McpFnValidationError(
            `DataFn resource ${resourceName} create fields omit required writable fields: ${missingRequiredFields.join(", ")}`,
          );
        }
      }
      const properties = Object.fromEntries(
        config.fields.map((field) => [field, fieldSchema(maps.schemaFields.get(field)!)]),
      );
      const recordRequired = operation === "create"
        ? requiredCreateFields
        : [];
      registry.register({
        name: config.name ?? defaultName(prefix, resourceName, operation),
        description: config.description ?? `${operation === "create" ? "Create" : "Update"} one ${resourceName} record.`,
        inputSchema: {
          type: "object",
          properties: {
            ...(operation === "create" ? { id: { type: "string", minLength: 1 } } : {}),
            ...(operation === "update" ? { id: { type: "string", minLength: 1 } } : {}),
            mutationId: { type: "string", minLength: 1 },
            record: {
              type: "object",
              properties,
              ...(recordRequired.length ? { required: recordRequired } : {}),
              additionalProperties: false,
            },
          },
          required: ["mutationId", "record", ...(operation === "update" ? ["id"] : [])],
          additionalProperties: false,
        },
        outputSchema: outputSchema(),
        annotations: {
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
        metadata: { "mcpfn/datafn": { resource: resourceName, operation } },
        handler: async (args, context) => {
          const clientId = await resolveClientId(options, context);
          const result = await options.executor.mutate(
            {
              resource: resourceName,
              version: String(resource.version),
              operation: operation === "create" ? "insert" : "merge",
              clientId,
              mutationId: args.mutationId,
              ...(args.id ? { id: args.id } : {}),
              record: args.record,
            },
            await options.context(context),
          );
          return structuredResult({ resource: resourceName, operation, result });
        },
      });
    };

    if (exposure.create) registerWrite("create", exposure.create);
    if (exposure.update) registerWrite("update", exposure.update);
    const remove = operationOptions<Omit<DatafnWriteToolOptions, "fields">>(
      exposure.delete,
      false,
    );
    if (remove) {
      const config = remove;
      const defaults = resourceDefaults(schema, resource);
      const writeDefault = typeof defaults === "string" ? defaults : defaults?.write;
      if (!resource.permissions?.write && writeDefault !== "allResourceFields") {
        throw new McpFnValidationError(
          `DataFn resource ${resourceName} has no write policy and cannot expose delete`,
        );
      }
      registry.register({
        name: config.name ?? defaultName(prefix, resourceName, "delete"),
        description: config.description ?? `Delete one ${resourceName} record by ID.`,
        inputSchema: {
          type: "object",
          properties: {
            id: { type: "string", minLength: 1 },
            mutationId: { type: "string", minLength: 1 },
          },
          required: ["id", "mutationId"],
          additionalProperties: false,
        },
        outputSchema: outputSchema(),
        annotations: {
          readOnlyHint: false,
          destructiveHint: true,
          idempotentHint: true,
          openWorldHint: false,
        },
        metadata: { "mcpfn/datafn": { resource: resourceName, operation: "delete" } },
        handler: async ({ id, mutationId }, context) => {
          const clientId = await resolveClientId(options, context);
          const result = await options.executor.mutate(
            {
              resource: resourceName,
              version: String(resource.version),
              operation: "delete",
              clientId,
              mutationId,
              id,
            },
            await options.context(context),
          );
          return structuredResult({ resource: resourceName, operation: "delete", result });
        },
      });
    }
  }

  return registry;
}
