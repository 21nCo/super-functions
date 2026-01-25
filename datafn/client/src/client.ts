/**
 * DataFn client factory
 */

import type { DatafnSchema, DatafnPlugin } from "@datafn/core";
import { validateSchema } from "@datafn/core";
import { EventBus, type EventHandler } from "./events/bus.js";
import type { EventFilter } from "./events/filter.js";
import { createClientError } from "./errors.js";
import { TableRegistry } from "./tables/registry.js";
import type { DatafnTable } from "./tables/table.js";
import { executeQuery } from "./query.js";
import { executeMutation } from "./mutate.js";
import { executeTransact } from "./transact.js";
import { SignalRegistry } from "./signals/querySignal.js";
import { createSyncFacade, type SyncFacade } from "./sync.js";
import type { DatafnStorageAdapter } from "./storage.js";

export interface DatafnRemoteAdapter {
  query(q: unknown): Promise<unknown>;
  mutation(m: unknown): Promise<unknown>;
  transact(t: unknown): Promise<unknown>;
  seed(payload: unknown): Promise<unknown>;
  clone(payload: unknown): Promise<unknown>;
  pull(payload: unknown): Promise<unknown>;
  push(payload: unknown): Promise<unknown>;
}

export interface DatafnClientConfig {
  schema: DatafnSchema;
  remote: DatafnRemoteAdapter;
  /**
   * Optional plugins for client-side hook execution
   */
  plugins?: DatafnPlugin[];
  /**
   * Stable client/device identifier used for idempotency and offline change logs.
   * Required when `storage` is provided.
   */
  clientId?: string;
  /**
   * Local persistence adapter. When provided, sync results are applied to local storage.
   */
  storage?: DatafnStorageAdapter;
  getTimestamp?: () => number; // For testing with fake clock
}

export interface DatafnClient {
  table<TRecord = unknown>(name: string): DatafnTable<TRecord>;
  query(q: unknown | unknown[]): Promise<unknown>;
  mutate(mutation: unknown | unknown[]): Promise<unknown>;
  transact(payload: unknown): Promise<unknown>;
  subscribe(handler: EventHandler, filter?: EventFilter): () => void;
  sync: SyncFacade;
}

/**
 * Create a DataFn client
 */
export function createDatafnClient(config: DatafnClientConfig): DatafnClient {
  // Validate schema at client creation (CLIENT-API-001)
  const validationResult = validateSchema(config.schema);
  if (!validationResult.ok) {
    createClientError(
      validationResult.error.code,
      validationResult.error.message,
      validationResult.error.details as {
        path: string;
        [key: string]: unknown;
      },
    );
  }

  const schema = validationResult.result;
  const eventBus = new EventBus();
  const getTimestamp = config.getTimestamp || (() => Date.now());

  // Reserved keys that should not trigger table lookup (CLIENT-REG-002)
  const RESERVED_KEYS = new Set(["then", "toJSON", "inspect"]);

  // Create the client object first (will add table() method after registry is created)
  const client: DatafnClient = {
    table: null as any, // Will be set below

    /**
     * Execute a query (CLIENT-QUERY-001, CLIENT-OFFLINE-QUERY-001)
     */
    async query(q: unknown | unknown[]) {
      return executeQuery(
        config.remote,
        q,
        config.storage,
        config.plugins || [],
        schema,
      );
    },

    /**
     * Sync facade (CLIENT-SYNC-001, CLIENT-SYNC-APPLY-001)
     */
    sync: createSyncFacade(config.remote, config.storage),

    /**
     * Execute a transaction (CLIENT-TX-001)
     */
    async transact(payload: unknown) {
      return executeTransact(config.remote, payload);
    },

    /**
     * Execute a mutation (CLIENT-MUT-001, CLIENT-OFFLINE-MUT-001)
     */
    async mutate(mutation: unknown | unknown[]) {
      return executeMutation(
        config.remote,
        eventBus,
        getTimestamp,
        mutation,
        config.storage,
        config.plugins || [],
        schema,
      );
    },

    /**
     * Subscribe to events
     */
    subscribe(handler: EventHandler, filter?: EventFilter) {
      return eventBus.subscribe(handler, filter);
    },
  };

  // Create signal registry (CLIENT-SIGNAL-001)
  const signalRegistry = new SignalRegistry(client, eventBus);

  // Create table registry with client and signal registry (CLIENT-REG-001)
  const registry = new TableRegistry(schema, client, signalRegistry);

  // Set table method now that registry exists
  client.table = (name: string) => registry.getTable(name);

  // Wrap client in Proxy for table property access (CLIENT-REG-001, CLIENT-REG-002)
  return new Proxy(client, {
    get(target, prop) {
      // Handle reserved keys - return undefined without throwing
      if (typeof prop === "string" && RESERVED_KEYS.has(prop)) {
        return undefined;
      }

      // If property exists on target, return it
      if (prop in target) {
        return target[prop as keyof typeof target];
      }

      // Check if it's a table name
      if (typeof prop === "string") {
        return registry.getTable(prop);
      }

      return undefined;
    },
  });
}
