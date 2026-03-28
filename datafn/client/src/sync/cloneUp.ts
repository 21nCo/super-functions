import type { DatafnSchema, DatafnResourceSchema, DatafnRelationSchema } from "@datafn/core";
import { getJoinStoreKey } from "@datafn/core";
import type { DatafnStorageAdapter } from "../storage.js";
import type { DatafnRemoteAdapter } from "../client.js";
import type { EventBus } from "../events/bus.js";
import { createClientError, isTransportError } from "../errors.js";
import { computeMutationHash } from "./cloneUp/hash.js";
import { sortRecordsById, sortJoinRows } from "./cloneUp/order.js";
import { batchMutations } from "./cloneUp/batch.js";

export type CloneUpOptions = {
  resources?: string[];
  includeManyMany?: boolean;
  recordOperation?: "merge" | "replace" | "insert";
  batchSize?: number;
  maxRetries?: number;
  failFast?: boolean;
  clearChangelogOnSuccess?: boolean;
  setGlobalCursorOnSuccess?: boolean;
  pullAfter?: boolean;
  mutationIdPrefix?: string;
};

export type CloneUpResult = {
  ok: boolean;
  cursor: string;
  stats: {
    resources: Record<string, { records: number; mutations: number }>;
    joinStores: Record<string, { rows: number; mutations: number }>;
    batches: number;
  };
  errors: Array<{
    mutationId: string;
    code: string;
    message: string;
    path: string;
  }>;
  /** Optional total count of uploaded records (for event context) */
  uploadedCount?: number;
};

export type CloneUpDeps = {
  schema: DatafnSchema;
  storage: DatafnStorageAdapter | undefined;
  remote: DatafnRemoteAdapter | undefined;
  clientId: string;
  syncConfig: { pushBatchSize?: number; pushMaxRetries?: number } | undefined;
  eventBus: EventBus;
  getTimestamp: () => number;
};

export async function cloneUp(
  deps: CloneUpDeps,
  options?: CloneUpOptions,
): Promise<CloneUpResult> {
  const storage = deps.storage;
  const remote = deps.remote;
  const schema = deps.schema;

  if (!storage) {
    throw createClientError(
      "DFQL_INVALID",
      "Invalid cloneUp: storage is required",
      { path: "storage" },
    );
  }

  if (!remote) {
    throw createClientError(
      "DFQL_INVALID",
      "Invalid cloneUp: sync.remote is required",
      { path: "sync.remote" },
    );
  }

  if (!schema) {
    throw createClientError(
      "INTERNAL",
      "Invalid cloneUp: schema is not available",
      { path: "schema" },
    );
  }

  const batchSize = options?.batchSize ?? deps.syncConfig?.pushBatchSize ?? 100;
  if (!Number.isInteger(batchSize) || batchSize <= 0) {
    throw createClientError(
      "DFQL_INVALID",
      "Invalid cloneUp: batchSize must be a positive integer",
      { path: "batchSize" },
    );
  }

  const maxRetries = options?.maxRetries ?? deps.syncConfig?.pushMaxRetries ?? 3;
  if (!Number.isInteger(maxRetries) || maxRetries < 0) {
    throw createClientError(
      "DFQL_INVALID",
      "Invalid cloneUp: maxRetries must be a non-negative integer",
      { path: "maxRetries" },
    );
  }

  const recordOperation = options?.recordOperation ?? "merge";
  const prefix = options?.mutationIdPrefix ?? "cloneup";
  const failFast = options?.failFast ?? true;
  const includeManyMany = options?.includeManyMany ?? true;

  const resolvedResources = resolveResourceScope(schema, options?.resources);

  const resourceSchemaMap = new Map<string, DatafnResourceSchema>();
  for (const r of schema.resources) {
    resourceSchemaMap.set(r.name, r);
  }

  const result: CloneUpResult = {
    ok: true,
    cursor: "0",
    stats: {
      resources: {},
      joinStores: {},
      batches: 0,
    },
    errors: [],
  };

  let highestCursor = "0";
  let hasErrors = false;

  // --- Stage A: Upload records ---
  for (const resourceName of resolvedResources) {
    const resourceSchema = resourceSchemaMap.get(resourceName)!;
    const fieldNames = new Set(resourceSchema.fields.map((f) => f.name));

    const rawRecords = await storage.listRecords(resourceName);
    const sortedRecords = sortRecordsById(rawRecords);

    const mutations: Record<string, unknown>[] = [];
    let recordIndex = 0;

    for (const record of sortedRecords) {
      if (typeof record.id !== "string") {
        throw createClientError(
          "DFQL_INVALID",
          "Invalid cloneUp: record id must be a string",
          { path: `records[${recordIndex}].id` },
        );
      }

      const filteredRecord: Record<string, unknown> = {};
      for (const key of Object.keys(record)) {
        if (key !== "id" && fieldNames.has(key)) {
          filteredRecord[key] = record[key];
        }
      }

      const hashInput = {
        kind: "rec",
        resource: resourceName,
        operation: recordOperation,
        id: record.id,
        record: filteredRecord,
      };
      const hash = computeMutationHash(hashInput);
      const mutationId = `${prefix}:rec:${resourceName}:${record.id}:${hash}`;

      mutations.push({
        resource: resourceName,
        version: resourceSchema.version,
        operation: recordOperation,
        id: record.id,
        record: filteredRecord,
        clientId: deps.clientId,
        mutationId,
      });

      recordIndex++;
    }

    // Only include resources in stats if they have records
    if (sortedRecords.length > 0) {
      result.stats.resources[resourceName] = {
        records: sortedRecords.length,
        mutations: mutations.length,
      };
    }

    const batches = batchMutations(mutations, batchSize);
    for (const batch of batches) {
      const pushResult = await pushBatchWithRetry(
        remote,
        deps.clientId,
        batch,
        maxRetries,
      );

      result.stats.batches += pushResult.attempts;

      if (pushResult.cursor) {
        highestCursor = maxCursorStr(highestCursor, pushResult.cursor);
      }

      if (pushResult.errors.length > 0) {
        result.errors.push(...pushResult.errors);
        hasErrors = true;
        if (failFast) {
          result.ok = false;
          result.cursor = highestCursor;
          deps.eventBus.emit({
            type: "sync_failed",
            timestampMs: deps.getTimestamp(),
            context: { phase: "cloneup", error: { errors: result.errors } },
          });
          return result;
        }
      }
    }
  }

  // --- Stage B: Many-many join rows ---
  if (includeManyMany && schema.relations) {
    const resolvedResourceSet = new Set(resolvedResources);
    const joinStoreEntries = enumerateJoinStores(schema.relations, resolvedResourceSet);
    const sortedJoinStoreNames = joinStoreEntries.map((e) => e.storeName).sort();

    for (const storeName of sortedJoinStoreNames) {
      const entry = joinStoreEntries.find((e) => e.storeName === storeName)!;
      const { fromResource, relationName, relation } = entry;
      const fromSchema = resourceSchemaMap.get(fromResource)!;
      const metaFieldNames = new Set(
        (relation.metadata ?? []).map((m) => m.name),
      );

      let rawJoinRows: Record<string, unknown>[];
      try {
        rawJoinRows = await storage.listJoinRows(storeName);
      } catch {
        rawJoinRows = [];
      }

      let rowIndex = 0;
      for (const row of rawJoinRows) {
        if (typeof row.from !== "string") {
          throw createClientError(
            "DFQL_INVALID",
            "Invalid cloneUp: join row from/to must be a string",
            { path: `joinRows[${rowIndex}].from` },
          );
        }
        if (typeof row.to !== "string") {
          throw createClientError(
            "DFQL_INVALID",
            "Invalid cloneUp: join row from/to must be a string",
            { path: `joinRows[${rowIndex}].to` },
          );
        }

        for (const key of Object.keys(row)) {
          if (key === "from" || key === "to") continue;
          if (!metaFieldNames.has(key)) {
            throw createClientError(
              "DFQL_UNKNOWN_FIELD",
              "Invalid cloneUp: unknown join metadata field",
              { path: `joinRows[${rowIndex}].${key}` },
            );
          }
        }
        rowIndex++;
      }

      const sortedRows = sortJoinRows(rawJoinRows);

      const mutations: Record<string, unknown>[] = [];
      for (const row of sortedRows) {
        const metaFiltered: Record<string, unknown> = {};
        for (const key of Object.keys(row)) {
          if (key !== "from" && key !== "to" && metaFieldNames.has(key)) {
            metaFiltered[key] = row[key];
          }
        }

        const hashInput = {
          kind: "rel",
          joinStore: storeName,
          resource: fromResource,
          relation: relationName,
          from: row.from,
          to: row.to,
          metadata: metaFiltered,
        };
        const hash = computeMutationHash(hashInput);
        const mutationId = `${prefix}:rel:${storeName}:${row.from}:${row.to}:${hash}`;

        mutations.push({
          resource: fromResource,
          version: fromSchema.version,
          operation: "relate",
          id: row.from,
          relations: { [relationName]: { $ref: row.to, ...metaFiltered } },
          clientId: deps.clientId,
          mutationId,
        });
      }

      result.stats.joinStores[storeName] = {
        rows: rawJoinRows.length,
        mutations: mutations.length,
      };

      const batches = batchMutations(mutations, batchSize);
      for (const batch of batches) {
        const pushResult = await pushBatchWithRetry(
          remote,
          deps.clientId,
          batch,
          maxRetries,
        );

        result.stats.batches += pushResult.attempts;

        if (pushResult.cursor) {
          highestCursor = maxCursorStr(highestCursor, pushResult.cursor);
        }

        if (pushResult.errors.length > 0) {
          result.errors.push(...pushResult.errors);
          hasErrors = true;
          if (failFast) {
            result.ok = false;
            result.cursor = highestCursor;
            deps.eventBus.emit({
              type: "sync_failed",
              timestampMs: deps.getTimestamp(),
              context: { phase: "cloneup", error: { errors: result.errors } },
            });
            return result;
          }
        }
      }
    }
  }

  if (hasErrors) {
    result.ok = false;
  }

  result.cursor = highestCursor;

  if (hasErrors) {
    deps.eventBus.emit({
      type: "sync_failed",
      timestampMs: deps.getTimestamp(),
      context: { phase: "cloneup", error: { errors: result.errors } },
    });
    return result;
  }

  // --- Finalization ---
  const startingCursor = (await storage.getCursor("__global_cursor__")) ?? "0";

  // pullAfter: catch-up loop from startingCursor
  if (options?.pullAfter !== false) {
    let pullCursor = startingCursor;
    let caughtUp = false;

    while (!caughtUp) {
      let pullResponse: any;
      try {
        pullResponse = await remote.pull({
          clientId: deps.clientId,
          cursor: pullCursor,
          limit: 100,
        });
      } catch (err) {
        if (isTransportError(err)) {
          throw err;
        }
        throw err;
      }

      const pullResult = pullResponse?.result ?? pullResponse;
      const changes: any[] = pullResult?.changes ?? [];
      const nextCursor: string | null = pullResult?.nextCursor ?? null;

      for (const change of changes) {
        if (change.op === "upsert" && change.record) {
          await storage.upsertRecord(change.resource, change.record);
        } else if (change.op === "delete") {
          await storage.deleteRecord(change.resource, change.id);
        }
      }

      if (nextCursor !== null) {
        await setCursorMonotonically(storage, nextCursor);
        pullCursor = nextCursor;
      } else if (changes.length > 0) {
        const lastSeq = String(changes[changes.length - 1].serverSeq);
        await setCursorMonotonically(storage, lastSeq);
        pullCursor = lastSeq;
        caughtUp = true;
      } else {
        caughtUp = true;
      }

      if (nextCursor === null) {
        caughtUp = true;
      }
    }
  }

  // setGlobalCursorOnSuccess: monotonic set to max push cursor
  if (options?.setGlobalCursorOnSuccess !== false) {
    await setCursorMonotonically(storage, highestCursor);
  }

  // clearChangelogOnSuccess: drain changelog
  if (options?.clearChangelogOnSuccess !== false) {
    let draining = true;
    while (draining) {
      const pending = await storage.changelogList({ limit: 1000 });
      if (pending.length === 0) {
        draining = false;
      } else {
        await storage.changelogAck({ throughSeq: pending[pending.length - 1].seq });
      }
    }
  }

  deps.eventBus.emit({
    type: "sync_applied",
    timestampMs: deps.getTimestamp(),
    context: { phase: "cloneup", cursor: result.cursor, stats: result.stats },
  });

  return result;
}

async function setCursorMonotonically(
  storage: DatafnStorageAdapter,
  newCursor: string,
): Promise<void> {
  const existing = await storage.getCursor("__global_cursor__");
  const existingNum = parseInt(existing ?? "0", 10) || 0;
  const newNum = parseInt(newCursor, 10) || 0;
  if (newNum > existingNum) {
    await storage.setCursor("__global_cursor__", newCursor);
  }
}

function resolveResourceScope(
  schema: DatafnSchema,
  requestedResources?: string[],
): string[] {
  if (requestedResources) {
    const schemaResourceMap = new Map<string, DatafnResourceSchema>();
    for (const r of schema.resources) {
      schemaResourceMap.set(r.name, r);
    }

    for (let i = 0; i < requestedResources.length; i++) {
      const name = requestedResources[i];
      const res = schemaResourceMap.get(name);

      if (!res) {
        throw createClientError(
          "DFQL_UNKNOWN_RESOURCE",
          "Invalid cloneUp: unknown resource",
          { path: `resources[${i}]` },
        );
      }

      if (res.isRemoteOnly) {
        throw createClientError(
          "DFQL_INVALID",
          "Invalid cloneUp: remote-only resources are not allowed",
          { path: `resources[${i}]` },
        );
      }
    }

    return requestedResources;
  }

  return schema.resources
    .filter((r) => !r.isRemoteOnly)
    .map((r) => r.name);
}

type JoinStoreEntry = {
  storeName: string;
  fromResource: string;
  relationName: string;
  relation: DatafnRelationSchema;
};

function enumerateJoinStores(
  relations: DatafnRelationSchema[],
  resolvedResourceSet: Set<string>,
): JoinStoreEntry[] {
  const entries: JoinStoreEntry[] = [];

  for (const rel of relations) {
    if (rel.type !== "many-many") continue;

    const fromResources = Array.isArray(rel.from) ? rel.from : [rel.from];
    const toResources = Array.isArray(rel.to) ? rel.to : [rel.to];
    const relName = rel.relation ?? "rel";

    for (const f of fromResources) {
      if (!resolvedResourceSet.has(f)) continue;
      for (const t of toResources) {
        entries.push({
          storeName: getJoinStoreKey(f, relName, t),
          fromResource: f,
          relationName: relName,
          relation: rel,
        });
      }
    }
  }

  return entries;
}

type PushBatchResult = {
  cursor: string | null;
  errors: Array<{ mutationId: string; code: string; message: string; path: string }>;
  attempts: number;
};

async function pushBatchWithRetry(
  remote: DatafnRemoteAdapter,
  clientId: string,
  mutations: Record<string, unknown>[],
  maxRetries: number,
): Promise<PushBatchResult> {
  let attempts = 0;

  while (true) {
    attempts++;
    try {
      const response = (await remote.push({
        clientId,
        mutations,
      })) as any;

      const pushResult = response?.result ?? response;

      return {
        cursor: pushResult?.cursor ?? null,
        errors: pushResult?.errors ?? [],
        attempts,
      };
    } catch (err) {
      if (isTransportError(err) && attempts <= maxRetries) {
        // CLI-010: Exponential backoff between retries
        const backoffMs = 1000 * Math.pow(2, attempts - 1);
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
        continue;
      }
      throw err;
    }
  }
}

function maxCursorStr(a: string, b: string): string {
  const an = parseInt(a, 10) || 0;
  const bn = parseInt(b, 10) || 0;
  return an >= bn ? a : b;
}
