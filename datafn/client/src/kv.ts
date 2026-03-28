/**
 * KV API implementation for datafn
 * Provides a first-class key-value store that works with signals and events.
 */

import { kvId, KV_RESOURCE_NAME, type DatafnSignal } from "@datafn/core";
import type { DatafnStorageAdapter } from "./storage.js";
import { EventBus } from "./events/bus.js";
import type { DatafnTable } from "./tables/table.js";
import { DebouncerMap } from "./debounce.js";

// Re-export for convenience
export { kvId, KV_RESOURCE_NAME } from "@datafn/core";

export interface DatafnKvApi {
  get<T = unknown>(key: string): Promise<T | null>;
  set<T = unknown>(
    key: string,
    value: T,
    params?: { context?: Record<string, unknown>; debounceMs?: number },
  ): Promise<{ ok: true; key: string } | { ok: false; error: unknown }>;
  merge(
    key: string,
    patch: Record<string, unknown>,
    params?: { context?: Record<string, unknown>; debounceMs?: number },
  ): Promise<{ ok: true; key: string } | { ok: false; error: unknown }>;
  delete(
    key: string,
    params?: { context?: Record<string, unknown> },
  ): Promise<{ ok: true; key: string } | { ok: false; error: unknown }>;
  getOrSeed<T = unknown>(key: string, defaults: T): Promise<T>;
  flush(key?: string): Promise<void>;
  signal<T = unknown>(
    key: string,
    options?: { defaultValue?: T },
  ): DatafnSignal<T>;
}

export interface KvApiDeps {
  storage?: DatafnStorageAdapter;
  kvTable: DatafnTable;
  eventBus: EventBus;
  clientId: string;
  debouncerMap: DebouncerMap;
}

/**
 * Create the KV API facade.
 */
export function createKvApi(deps: KvApiDeps): DatafnKvApi {
  const { storage, kvTable, eventBus, clientId, debouncerMap } = deps;

  // CLI-007: Per-key serialization for merge to prevent read-modify-write races.
  // Concurrent merges on the same key are chained so they execute sequentially.
  const mergeLocks = new Map<string, Promise<unknown>>();
  function withMergeLock<T>(
    key: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    const prev = mergeLocks.get(key) ?? Promise.resolve();
    const next = prev.then(fn, (_) => fn()); // run fn even if prev failed
    const cleanup = next.then(
      () => { if (mergeLocks.get(key) === next) mergeLocks.delete(key); },
      () => { if (mergeLocks.get(key) === next) mergeLocks.delete(key); },
    );
    void cleanup;
    mergeLocks.set(key, next);
    return next;
  }

  return {
    async get<T = unknown>(key: string): Promise<T | null> {
      if (typeof key !== "string") {
        throw new Error("Invalid KV key: must be string");
      }

      const id = kvId(key);

      // Try storage first (offline-first)
      if (storage) {
        const record = await storage.getRecord(KV_RESOURCE_NAME, id);
        if (record) {
          return (record.value as T) ?? null;
        }
      }

      // Query path (remote or local)
      const result = (await kvTable.query({
        resource: KV_RESOURCE_NAME,
        version: 1,
        filters: { id: { eq: id } },
        select: ["id", "value"],
      } as any)) as any;

      if (!result || !("data" in result) || !Array.isArray(result.data)) {
        return null;
      }

      const records = result.data;
      if (records.length === 0) {
        return null;
      }

      return (records[0].value as T) ?? null;
    },

    async set<T = unknown>(
      key: string,
      value: T,
      params?: { context?: Record<string, unknown>; debounceMs?: number },
    ): Promise<{ ok: true; key: string } | { ok: false; error: unknown }> {
      if (typeof key !== "string") {
        return {
          ok: false as const,
          error: {
            code: "DFQL_INVALID",
            message: "Invalid KV key: must be string",
            details: { path: "key" },
          },
        };
      }

      const id = kvId(key);

      const executeMutation = async () => {
        // Use merge operation for upsert semantics (create-or-update)
        const result = (await kvTable.mutate({
          resource: KV_RESOURCE_NAME,
          version: 1,
          operation: "merge",
          id,
          record: { value },
          clientId,
          mutationId: `kv-set-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          context: params?.context,
        } as any)) as any;

        if (!result || typeof result !== "object" || !("ok" in result)) {
          return { ok: false as const, error: result };
        }

        if (!result.ok) {
          return { ok: false as const, error: result };
        }

        return { ok: true as const, key };
      };

      try {
        // If debounceMs is provided, use the DebouncerMap
        if (params?.debounceMs !== undefined && params.debounceMs > 0) {
          const debounceKey = `kv:${key}`;
          await debouncerMap.set(
            debounceKey,
            {
              resource: KV_RESOURCE_NAME,
              operation: "merge",
              id,
              record: { value },
              clientId,
              mutationId: `kv-set-${Date.now()}-${Math.random().toString(36).slice(2)}`,
              context: params?.context,
            },
            params.debounceMs,
            async (mutation) => {
              // Execute the mutation directly through kvTable
              const result = (await kvTable.mutate(mutation as any)) as any;
              if (!result || typeof result !== "object" || !("ok" in result)) {
                throw result;
              }
              if (!result.ok) {
                throw result;
              }
            },
          );
          return { ok: true as const, key };
        }

        // Without debounce, execute immediately
        return await executeMutation();
      } catch (error) {
        return { ok: false as const, error };
      }
    },

    async merge(
      key: string,
      patch: Record<string, unknown>,
      params?: { context?: Record<string, unknown>; debounceMs?: number },
    ): Promise<{ ok: true; key: string } | { ok: false; error: unknown }> {
      if (typeof key !== "string") {
        return {
          ok: false as const,
          error: {
            code: "DFQL_INVALID",
            message: "Invalid KV key: must be string",
            details: { path: "key" },
          },
        };
      }

      if (
        typeof patch !== "object" ||
        patch === null ||
        Array.isArray(patch)
      ) {
        return {
          ok: false as const,
          error: {
            code: "DFQL_INVALID",
            message: "Invalid KV merge: patch must be a plain object",
            details: { path: "patch" },
          },
        };
      }

      const id = kvId(key);

      const executeMutation = async () => {
        // Get existing value
        const existing = await this.get<Record<string, unknown>>(key);

        // Validate existing value is an object
        if (
          existing !== null &&
          (typeof existing !== "object" ||
            Array.isArray(existing))
        ) {
          return {
            ok: false as const,
            error: {
              code: "DFQL_INVALID",
              message:
                "Invalid KV merge: existing value is not an object",
              details: { path: "value" },
            },
          };
        }

        // Send patch as { value: patch } and let the deep merge logic handle it
        // The storage adapter's mergeRecord will do one-level deep merge:
        // existing: { id: "kv:k", value: { a: 1, b: 2 } }
        // patch: { value: { a: 10 } }
        // result: { id: "kv:k", value: { a: 10, b: 2 } }
        const result = (await kvTable.mutate({
          resource: KV_RESOURCE_NAME,
          version: 1,
          operation: "merge",
          id,
          record: { value: patch }, // Send patch, not merged value
          clientId,
          mutationId: `kv-merge-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          context: params?.context,
        } as any)) as any;

        if (!result || typeof result !== "object" || !("ok" in result)) {
          return { ok: false as const, error: result };
        }

        if (!result.ok) {
          return { ok: false as const, error: result };
        }

        return { ok: true as const, key };
      };

      try {
        // If debounceMs is provided, use the DebouncerMap
        if (params?.debounceMs !== undefined && params.debounceMs > 0) {
          const debounceKey = `kv:${key}`;
          // Store patch fields at the top level of record so they merge correctly
          await debouncerMap.set(
            debounceKey,
            {
              resource: KV_RESOURCE_NAME,
              operation: "merge",
              id,
              record: patch, // Store patch fields directly (not nested under 'value')
              clientId,
              mutationId: `kv-merge-${Date.now()}-${Math.random().toString(36).slice(2)}`,
              context: params?.context,
            },
            params.debounceMs,
            async (mutation) => {
              // Validate existing value is an object (before mutation)
              const existing = await this.get<Record<string, unknown>>(key);
              
              if (
                existing !== null &&
                (typeof existing !== "object" || Array.isArray(existing))
              ) {
                throw {
                  code: "DFQL_INVALID",
                  message: "Invalid KV merge: existing value is not an object",
                  details: { path: "value" },
                };
              }
              
              // mutation.record now contains the accumulated patch fields
              // Wrap it in { value: patch } and let deep merge handle it
              const patchValue = mutation.record as Record<string, unknown>;
              
              // Execute the mutation with patch wrapped in value field
              const result = (await kvTable.mutate({
                ...mutation,
                record: { value: patchValue },
              } as any)) as any;
              
              if (!result || typeof result !== "object" || !("ok" in result)) {
                throw result;
              }
              if (!result.ok) {
                throw result;
              }
            },
          );
          return { ok: true as const, key };
        }

        // Without debounce, execute immediately with per-key lock (CLI-007)
        return await withMergeLock(key, executeMutation);
      } catch (error) {
        return { ok: false as const, error };
      }
    },

    async delete(
      key: string,
      params?: { context?: Record<string, unknown> },
    ): Promise<{ ok: true; key: string } | { ok: false; error: unknown }> {
      if (typeof key !== "string") {
        return {
          ok: false as const,
          error: {
            code: "DFQL_INVALID",
            message: "Invalid KV key: must be string",
            details: { path: "key" },
          },
        };
      }

      const id = kvId(key);

      try {
        const result = (await kvTable.mutate({
          resource: KV_RESOURCE_NAME,
          version: 1,
          operation: "delete",
          id,
          clientId,
          mutationId: `kv-delete-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          context: params?.context,
        } as any)) as any;

        if (!result || typeof result !== "object" || !("ok" in result)) {
          return { ok: false as const, error: result };
        }

        if (!result.ok) {
          return { ok: false as const, error: result };
        }

        return { ok: true as const, key };
      } catch (error) {
        return { ok: false as const, error };
      }
    },

    async getOrSeed<T = unknown>(key: string, defaults: T): Promise<T> {
      if (typeof key !== "string") {
        throw new Error("Invalid KV key: must be string");
      }

      const id = kvId(key);

      // Check if the record exists in storage
      if (storage) {
        const record = await storage.getRecord(KV_RESOURCE_NAME, id);
        if (record !== null) {
          // Record exists, return its value (even if null)
          return (record.value as T) ?? null as T;
        }
      } else {
        // No storage, query to check existence
        const result = (await kvTable.query({
          resource: KV_RESOURCE_NAME,
          version: 1,
          filters: { id: { eq: id } },
          select: ["id", "value"],
        } as any)) as any;

        if (result && "data" in result && Array.isArray(result.data) && result.data.length > 0) {
          // Record exists, return its value (even if null)
          return (result.data[0].value as T) ?? null as T;
        }
      }

      // Record doesn't exist, seed with defaults
      await this.set(key, defaults);
      return defaults;
    },

    async flush(key?: string): Promise<void> {
      if (key !== undefined) {
        // Flush specific key
        const debounceKey = `kv:${key}`;
        await debouncerMap.flush(debounceKey);
      } else {
        // Flush all KV debounced mutations
        await debouncerMap.flushAll();
      }
    },

    signal<T = unknown>(
      key: string,
      options?: { defaultValue?: T },
    ): DatafnSignal<T> {
      if (typeof key !== "string") {
        throw new Error("Invalid KV key: must be string");
      }

      const id = kvId(key);

      // Create a signal scoped to this specific KV id
      const baseSignal = kvTable.signal({
        resource: KV_RESOURCE_NAME,
        version: 1,
        filters: { id: { eq: id } },
        select: ["id", "value"],
      } as any);

      // Transform the signal to extract the value field.
      // After the query signal unwrap, baseSignal emits the record array directly.
      const transformedSignal: DatafnSignal<T> = {
        subscribe: (handler: (value: T) => void) => {
          return baseSignal.subscribe((records: any) => {
            if (Array.isArray(records) && records.length > 0) {
              handler(records[0].value as T);
            } else {
              handler(options?.defaultValue ?? (null as T));
            }
          });
        },
        get: () => {
          const records = baseSignal.get() as any;
          if (Array.isArray(records) && records.length > 0) {
            return records[0].value as T;
          }
          return options?.defaultValue ?? (null as T);
        },
        get loading() { return baseSignal.loading; },
        get error() { return baseSignal.error; },
        get refreshing() { return baseSignal.refreshing; },
        get nextCursor() { return baseSignal.nextCursor; },
        dispose: () => baseSignal.dispose(),
      };

      return transformedSignal;
    },
  };
}
