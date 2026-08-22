import type { DatafnExecutor } from "@datafn/server";
import {
  AdminError,
  decodeAdminCursor,
  encodeAdminCursor,
  normalizeAdminPageLimit,
  stableSerialize,
  type AdminOperationContext,
  type AdminOperationResult,
} from "@superfunctions/admin";
import type {
  DataFnActionOutput,
  DataFnAdminRecord,
  DataFnAdminService,
  DataFnCapabilityView,
  DataFnIndexView,
  DataFnItemOutput,
  DataFnListInput,
  DataFnPageOutput,
  DataFnRelationView,
  DataFnResourceView,
  DataFnSchemaView,
} from "./types.js";

export interface DataFnDomainAdminServiceOptions<TContext> {
  executor: DatafnExecutor<TContext>;
  /** Builds the exact DataFn context used by authorization and namespace providers. */
  context(admin: AdminOperationContext): TContext;
}

function object(value: unknown, name: string): DataFnAdminRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AdminError("invalid_argument", `${name} must be an object.`);
  }
  return value as DataFnAdminRecord;
}

function string(value: unknown, name: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new AdminError("invalid_argument", `${name} must be a non-empty string.`);
  }
  return value;
}

function resultItem<TItem extends object>(
  value: TItem,
): AdminOperationResult<DataFnItemOutput<TItem>> {
  return { ok: true, data: { item: { ...value } } };
}

function actionItem(
  value: DataFnAdminRecord,
): AdminOperationResult<DataFnActionOutput> {
  return { ok: true, data: { accepted: true, item: value } };
}

function page<TItem extends object>(
  values: readonly TItem[],
  input: DataFnListInput,
  context: AdminOperationContext,
): AdminOperationResult<DataFnPageOutput<TItem>> {
  const limit = normalizeAdminPageLimit(input.limit);
  const offset = typeof input.cursor === "string"
    ? decodeAdminCursor<{ offset: number }>(input.cursor, context.scope).offset
    : 0;
  if (!Number.isInteger(offset) || offset < 0) {
    throw new AdminError("invalid_argument", "The DataFn admin cursor is invalid.");
  }
  const items = values.slice(offset, offset + limit).map((entry) => ({ ...entry }));
  const next = offset + items.length;
  const nextCursor = next < values.length
    ? encodeAdminCursor(context.scope, { offset: next })
    : null;
  return {
    ok: true,
    data: { items, nextCursor },
    page: { nextCursor, hasMore: next < values.length },
  };
}

function relationId(value: object): string {
  return stableSerialize(value);
}

interface DataFnSchemaDocuments {
  schemas: DataFnSchemaView[];
  resources: DataFnResourceView[];
  relations: DataFnRelationView[];
  indices: DataFnIndexView[];
  capabilities: DataFnCapabilityView[];
}

function schemaDocuments<TContext>(executor: DatafnExecutor<TContext>): DataFnSchemaDocuments {
  return {
    schemas: [{
      id: `schema-v${executor.schema.version ?? 1}`,
      version: executor.schema.version ?? 1,
      namespaced: executor.schema.namespaced !== false,
      resourceCount: executor.schema.resources.length,
      relationCount: executor.schema.relations?.length ?? 0,
    }],
    resources: executor.schema.resources.map((resource) => ({
      ...resource,
      id: resource.name,
    })) as DataFnResourceView[],
    relations: (executor.schema.relations ?? []).map((relation) => ({
      ...relation,
      id: relationId(relation),
    })) as DataFnRelationView[],
    indices: executor.schema.resources.map((resource) => ({
      id: resource.name,
      resource: resource.name,
      indices: resource.indices ?? [],
    })),
    capabilities: executor.schema.resources.map((resource) => ({
      id: resource.name,
      resource: resource.name,
      capabilities: resource.capabilities ?? [],
      schemaCapabilities: executor.schema.capabilities ?? [],
    })),
  };
}

function findById<TItem extends { id: string }>(
  values: readonly TItem[],
  id: string,
  label: string,
): TItem {
  const value = values.find((entry) => entry.id === id);
  if (!value) throw new AdminError("not_found", `${label} was not found in the active DataFn schema.`);
  return value;
}

function splitRecordId(value: string): { resource: string; id: string } {
  const separator = value.indexOf(":");
  if (separator <= 0 || separator === value.length - 1) {
    throw new AdminError("invalid_argument", "DataFn record IDs use the form resource:id.");
  }
  try {
    return { resource: decodeURIComponent(value.slice(0, separator)), id: value.slice(separator + 1) };
  } catch (error) {
    throw new AdminError("invalid_argument", "DataFn resource names must be percent-encoded in record IDs.", { cause: error });
  }
}

function compositeRecordId(resource: string, id: string | number): string {
  return `${encodeURIComponent(resource)}:${id}`;
}

/** Uses DataFn's transport-neutral executor so namespace, policy, hooks, and limits remain authoritative. */
export function createDataFnDomainAdminService<TContext>(
  options: DataFnDomainAdminServiceOptions<TContext>,
): DataFnAdminService {
  const { executor } = options;

  function documents(context: AdminOperationContext): DataFnSchemaDocuments {
    // Context resolution is part of the binding contract even for global schema metadata.
    options.context(context);
    return schemaDocuments(executor);
  }

  return {
    async listSchemas(input, context) {
      return page(documents(context).schemas, input, context);
    },
    async getSchema(input, context) {
      return resultItem(findById(documents(context).schemas, string(input.id, "id"), "schema"));
    },
    async listResources(input, context) {
      return page(documents(context).resources, input, context);
    },
    async getResource(input, context) {
      return resultItem(findById(documents(context).resources, string(input.id, "id"), "resource"));
    },
    async listRelations(input, context) {
      return page(documents(context).relations, input, context);
    },
    async getRelation(input, context) {
      return resultItem(findById(documents(context).relations, string(input.id, "id"), "relation"));
    },
    async listIndices(input, context) {
      return page(documents(context).indices, input, context);
    },
    async getIndex(input, context) {
      return resultItem(findById(documents(context).indices, string(input.id, "id"), "index"));
    },
    async listCapabilities(input, context) {
      return page(documents(context).capabilities, input, context);
    },
    async getCapability(input, context) {
      return resultItem(findById(documents(context).capabilities, string(input.id, "id"), "capability"));
    },
    async listRecords(input, context) {
      const filter = object(input.filter, "filter");
      const target = string(filter.resource, "filter.resource");
      const definition = executor.schema.resources.find((entry) => entry.name === target);
      if (!definition) throw new AdminError("not_found", "DataFn resource was not found in the active schema.");
      const decoded = input.cursor
        ? decodeAdminCursor<{
            operationId: "datafn.records.list";
            resource: string;
            cursor: { after?: Record<string, unknown>; before?: Record<string, unknown> };
          }>(input.cursor, context.scope)
        : undefined;
      if (decoded && (decoded.operationId !== "datafn.records.list" || decoded.resource !== target)) {
        throw new AdminError("invalid_argument", "The DataFn admin cursor does not belong to this record collection.");
      }
      const select = Array.isArray(filter.select)
        ? [...new Set(["id", ...filter.select.filter((field): field is string => typeof field === "string")])]
        : undefined;
      const domain = await executor.query<DataFnAdminRecord>({
        ...filter,
        resource: target,
        version: String(filter.version ?? definition.version),
        limit: input.limit,
        ...(select ? { select } : {}),
        ...(decoded ? { cursor: decoded.cursor } : {}),
      }, options.context(context));
      const values = Array.isArray(domain.data) ? domain.data : [];
      const nextCursor = domain.nextCursor && typeof domain.nextCursor === "object" && !Array.isArray(domain.nextCursor)
        ? encodeAdminCursor(context.scope, {
            operationId: "datafn.records.list",
            resource: target,
            cursor: { after: domain.nextCursor as Record<string, unknown> },
          })
        : null;
      return {
        ok: true,
        data: {
          items: values.map((value) => {
            const recordId = value.id;
            if (typeof recordId !== "string" && typeof recordId !== "number") {
              throw new AdminError("dependency_unavailable", "DataFn returned a record without a usable id.");
            }
            return { ...value, id: compositeRecordId(target, recordId) };
          }),
          nextCursor,
        },
        page: {
          nextCursor,
          hasMore: nextCursor !== null,
        },
      };
    },
    async getRecord(input, context) {
      const target = splitRecordId(string(input.id, "id"));
      const definition = executor.schema.resources.find((entry) => entry.name === target.resource);
      if (!definition) throw new AdminError("not_found", "DataFn resource was not found in the active schema.");
      const domain = await executor.query<DataFnAdminRecord>({
        resource: target.resource,
        version: String(definition.version),
        filters: { id: target.id },
        limit: 1,
      }, options.context(context));
      const value = Array.isArray(domain.data) ? domain.data[0] : undefined;
      if (!value || typeof value !== "object") throw new AdminError("not_found", "DataFn record was not found.");
      return resultItem({ ...value, id: compositeRecordId(target.resource, target.id) });
    },
    async query(input, context) {
      const value = await executor.query<DataFnAdminRecord>(object(input.payload, "payload"), options.context(context));
      return actionItem(object(value, "DataFn query result"));
    },
    async mutate(input, context) {
      const target = splitRecordId(string(input.id, "id"));
      const payload = object(input.payload, "payload");
      if (string(payload.resource, "payload.resource") !== target.resource || string(payload.id, "payload.id") !== target.id) {
        throw new AdminError("invalid_argument", "DataFn mutation audit target must match payload.resource and payload.id.");
      }
      const value = await executor.mutate<DataFnAdminRecord>(payload, options.context(context));
      return actionItem(object(value, "DataFn mutation result"));
    },
    async transact(input, context) {
      const value = await executor.transact<DataFnAdminRecord>(object(input.payload, "payload"), options.context(context));
      return actionItem(object(value, "DataFn transaction result"));
    },
  };
}
