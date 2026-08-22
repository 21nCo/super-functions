import type { SearchAdapter, SearchDocument } from "@searchfn/adapter-contracts";
import {
  AdminError,
  decodeAdminCursor,
  encodeAdminCursor,
  normalizeAdminPageLimit,
  type AdminOperationContext,
  type AdminOperationResult,
} from "@superfunctions/admin";
import type {
  SearchFnAdminRecord,
  SearchFnAdminService,
  SearchFnItemOutput,
  SearchFnListInput,
  SearchFnListOutput,
  SearchFnMutationOutput,
} from "./types.js";

type JsonRecord = Record<string, unknown>;

function pageIdentity(operationId: string, input: SearchFnListInput): string {
  const filter = Object.entries(input.filter ?? {}).sort(([left], [right]) => left.localeCompare(right));
  const sort = (input.sort ?? []).map((descriptor) => [descriptor.field ?? null, descriptor.direction ?? null]);
  return JSON.stringify([operationId, input.search?.trim().toLowerCase() ?? null, filter, sort]);
}

export interface SearchFnDomainAdminServiceOptions {
  /** Must resolve an adapter already isolated to the active scope and optional namespace/region. */
  adapter(context: AdminOperationContext): SearchAdapter | Promise<SearchAdapter>;
  /** Returns the configured index names visible inside the same isolated adapter. */
  resources(context: AdminOperationContext): readonly string[] | Promise<readonly string[]>;
}

function object(value: unknown, name: string): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AdminError("invalid_argument", `${name} must be an object.`);
  }
  return value as JsonRecord;
}

function string(value: unknown, name: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new AdminError("invalid_argument", `${name} must be a non-empty string.`);
  }
  return value;
}

function item(value: object): AdminOperationResult<SearchFnItemOutput> {
  return { ok: true, data: { item: { ...value } } };
}

function list(
  values: object[],
  input: SearchFnListInput,
  context: AdminOperationContext,
  operationId: string,
): AdminOperationResult<SearchFnListOutput> {
  let records = values.map((value) => ({ ...value }) as JsonRecord);
  if (input.search?.trim()) {
    const query = input.search.trim().toLowerCase();
    records = records.filter((value) => JSON.stringify(value).toLowerCase().includes(query));
  }
  if (input.filter) {
    records = records.filter((value) =>
      Object.entries(input.filter!).every(([key, expected]) => Object.is(value[key], expected)));
  }
  const sorts = input.sort ?? [];
  records.sort((left, right) => {
    for (const descriptor of sorts) {
      const field = typeof descriptor.field === "string" ? descriptor.field : undefined;
      if (!field) continue;
      const direction = descriptor.direction === "desc" ? -1 : 1;
      const compared = String(left[field] ?? "").localeCompare(String(right[field] ?? ""));
      if (compared !== 0) return compared * direction;
    }
    return String(left.id ?? "").localeCompare(String(right.id ?? ""));
  });
  const identity = pageIdentity(operationId, input);
  const decoded = input.cursor
    ? decodeAdminCursor<{ identity?: unknown; offset?: unknown }>(input.cursor, context.scope)
    : { identity, offset: 0 };
  if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) {
    throw new AdminError("invalid_argument", "The SearchFn cursor is invalid.");
  }
  if (decoded.identity !== identity) {
    throw new AdminError("invalid_argument", "The SearchFn cursor does not belong to this index-list query.");
  }
  const offset = decoded.offset ?? 0;
  if (!Number.isSafeInteger(offset) || (offset as number) < 0) {
    throw new AdminError("invalid_argument", "The SearchFn cursor is invalid.");
  }
  const limit = normalizeAdminPageLimit(input.limit, { defaultLimit: 50, maxLimit: 200 });
  const items = records.slice(offset as number, (offset as number) + limit);
  const nextOffset = (offset as number) + items.length;
  return {
    ok: true,
    data: {
      items,
      nextCursor: nextOffset < records.length
        ? encodeAdminCursor(context.scope, { identity, offset: nextOffset })
        : null,
    },
  };
}

function accepted(value: JsonRecord): AdminOperationResult<SearchFnMutationOutput> {
  return { ok: true, data: { accepted: true, ...value } };
}

function splitDocumentId(value: string): { resource: string; id: string | number } {
  const separator = value.indexOf(":");
  if (separator <= 0 || separator === value.length - 1) {
    throw new AdminError("invalid_argument", "SearchFn document targets use the form resource:id.");
  }
  const resource = value.slice(0, separator);
  let decodedResource: string;
  try {
    decodedResource = decodeURIComponent(resource);
  } catch (error) {
    throw new AdminError("invalid_argument", "SearchFn resource names must be percent-encoded in document targets.", { cause: error });
  }
  const encodedId = value.slice(separator + 1);
  if (encodedId.startsWith("number:")) {
    const numericText = encodedId.slice("number:".length);
    const numericId = Number(numericText);
    if (!/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(numericText) || !Number.isFinite(numericId)) {
      throw new AdminError("invalid_argument", "SearchFn numeric document targets use resource:number:<finite number>.");
    }
    return { resource: decodedResource, id: numericId };
  }
  let stringId = encodedId;
  if (encodedId.startsWith("string:")) {
    try {
      stringId = decodeURIComponent(encodedId.slice("string:".length));
    } catch (error) {
      throw new AdminError("invalid_argument", "SearchFn escaped string document IDs must be percent-encoded.", { cause: error });
    }
  }
  if (stringId.length === 0) {
    throw new AdminError("invalid_argument", "SearchFn document IDs must be non-empty.");
  }
  return { resource: decodedResource, id: stringId };
}

function documents(value: unknown): SearchDocument[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new AdminError("invalid_argument", "payload.documents must be a non-empty array.");
  }
  return value.map((entry, index) => {
    const document = object(entry, `payload.documents[${index}]`);
    const id = document.id;
    if (typeof id !== "string" && typeof id !== "number") {
      throw new AdminError("invalid_argument", `payload.documents[${index}].id must be a string or number.`);
    }
    const fields = object(document.fields, `payload.documents[${index}].fields`);
    if (Object.values(fields).some((field) => typeof field !== "string")) {
      throw new AdminError("invalid_argument", `payload.documents[${index}].fields values must be strings.`);
    }
    return { id, fields: fields as Record<string, string> };
  });
}

/** Delegates to the configured SearchAdapter; no raw backend or cross-scope query is constructed here. */
export function createSearchFnDomainAdminService(
  options: SearchFnDomainAdminServiceOptions,
): SearchFnAdminService {
  const state = async (context: AdminOperationContext) => {
    const adapter = await options.adapter(context);
    const resources = [...await options.resources(context)];
    return {
      adapter,
      resources,
      adapterInfo: {
        id: adapter.name,
        name: adapter.name,
        status: "available",
        capabilities: adapter.capabilities ?? {},
      } satisfies SearchFnAdminRecord,
      indexInfo: resources.map((resource) => ({ id: resource, name: resource, status: "available" })),
    };
  };

  return {
    async listAdapters(input, context) {
      const { adapterInfo } = await state(context);
      return list([adapterInfo], input, context, "searchfn.adapters.list");
    },
    async getAdapter(input, context) {
      const { adapter, adapterInfo } = await state(context);
      if (string(input.id, "id") !== adapter.name) {
        throw new AdminError("not_found", "SearchFn adapter was not found in the active scope.");
      }
      return item(adapterInfo);
    },
    async listIndexes(input, context) {
      return list((await state(context)).indexInfo, input, context, "searchfn.indexes-collections.list");
    },
    async getIndex(input, context) {
      const { indexInfo } = await state(context);
      const found = indexInfo.find((entry) => entry.id === string(input.id, "id"));
      if (!found) throw new AdminError("not_found", "SearchFn index was not found in the active scope.");
      return item(found);
    },
    async listHealth(input, context) {
      const { adapter } = await state(context);
      return list([{ id: adapter.name, adapter: adapter.name, state: "ok", capabilities: adapter.capabilities ?? {} }], input, context, "searchfn.health.list");
    },
    async getHealth(input, context) {
      const { adapter } = await state(context);
      if (string(input.id, "id") !== adapter.name) {
        throw new AdminError("not_found", "SearchFn health target was not found.");
      }
      return item({ id: adapter.name, adapter: adapter.name, state: "ok", capabilities: adapter.capabilities ?? {} });
    },
    async indexDocument(input, context) {
      const { adapter, resources } = await state(context);
      const inputValue = object(input, "input");
      const target = splitDocumentId(string(inputValue.id, "id"));
      if (!resources.includes(target.resource)) throw new AdminError("not_found", "SearchFn index was not found in the active scope.");
      const fields = object(object(inputValue.payload, "payload").fields, "payload.fields");
      if (Object.values(fields).some((field) => typeof field !== "string")) {
        throw new AdminError("invalid_argument", "payload.fields values must be strings.");
      }
      await adapter.index({
        resource: target.resource,
        documents: [{ id: target.id, fields: fields as Record<string, string> }],
        signal: context.signal,
      });
      return accepted({ indexed: 1, resource: target.resource });
    },
    async batchIndex(input, context) {
      const { adapter, resources } = await state(context);
      const payload = object(object(input, "input").payload, "payload");
      const resource = string(payload.resource, "payload.resource");
      if (!resources.includes(resource)) throw new AdminError("not_found", "SearchFn index was not found in the active scope.");
      const entries = documents(payload.documents);
      await adapter.index({ resource, documents: entries, signal: context.signal });
      return accepted({ indexed: entries.length, resource });
    },
    async removeDocument(input, context) {
      const { adapter, resources } = await state(context);
      const target = splitDocumentId(string(input.id, "id"));
      if (!resources.includes(target.resource)) throw new AdminError("not_found", "SearchFn index was not found in the active scope.");
      await adapter.remove({ resource: target.resource, ids: [target.id], signal: context.signal });
      return accepted({ removed: 1, resource: target.resource });
    },
    async clearIndex(input, context) {
      const { adapter, resources } = await state(context);
      const resource = string(input.id, "id");
      if (!resources.includes(resource)) throw new AdminError("not_found", "SearchFn index was not found in the active scope.");
      await adapter.clear(resource, context.signal);
      return accepted({ cleared: resource });
    },
  };
}
