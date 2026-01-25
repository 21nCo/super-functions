/**
 * DataFn Table Handle
 *
 * Represents a table/resource from the schema with methods for query, mutation, signals, and subscriptions.
 */

import type { DatafnSignal } from "@datafn/core";
import type { EventHandler } from "../events/bus.js";
import type { EventFilter } from "../events/filter.js";
import type { SignalRegistry } from "../signals/querySignal.js";

export interface DatafnTable<TRecord = unknown> {
  name: string;
  version: number;

  query(q: unknown): Promise<unknown>;
  mutate(m: unknown): Promise<unknown>;
  transact(payload: unknown): Promise<unknown>;
  signal(q: unknown): DatafnSignal<unknown>;
  subscribe(handler: EventHandler, filter?: EventFilter): () => void;
}

// Forward declaration for client interface
interface ClientWithQuery {
  query(q: unknown | unknown[]): Promise<unknown>;
  mutate(m: unknown | unknown[]): Promise<unknown>;
  transact(payload: unknown): Promise<unknown>;
  subscribe(handler: EventHandler, filter?: EventFilter): () => void;
}

/**
 * Create a table handle (internal factory)
 */
export function createTable(
  name: string,
  version: number,
  client: ClientWithQuery,
  signalRegistry: SignalRegistry
): DatafnTable {
  return {
    name,
    version,

    /**
     * Execute a query with resource/version merged (CLIENT-QUERY-001)
     */
    async query(q: unknown): Promise<unknown> {
      // Merge query fragment with table resource/version
      const fragment = (typeof q === "object" && q !== null ? q : {}) as Record<
        string,
        unknown
      >;

      // Remove resource/version from fragment if present (table is authoritative)
      const { resource: _r, version: _v, ...rest } = fragment;

      // Build full query
      const fullQuery = {
        resource: name,
        version,
        ...rest,
      };

      // Delegate to client.query and return single result
      return client.query(fullQuery);
    },

    /**
     * Execute a mutation with resource/version merged (CLIENT-MUT-001)
     */
    async mutate(m: unknown): Promise<unknown> {
      // Merge mutation fragment with table resource/version
      const fragment = (typeof m === "object" && m !== null ? m : {}) as Record<
        string,
        unknown
      >;

      // Remove resource/version from fragment if present (table is authoritative)
      const { resource: _r, version: _v, ...rest } = fragment;

      // Build full mutation
      const fullMutation = {
        resource: name,
        version,
        ...rest,
      };

      // Delegate to client.mutate and return single result
      return client.mutate(fullMutation);
    },

    /**
     * Execute a transaction (CLIENT-TX-001)
     */
    async transact(payload: unknown): Promise<unknown> {
      // Delegate directly to client.transact without modification
      return client.transact(payload);
    },

    /**
     * Create reactive query signal (CLIENT-SIGNAL-001)
     */
    signal(q: unknown): DatafnSignal<unknown> {
      // Merge query fragment with table resource/version
      const fragment = (typeof q === "object" && q !== null ? q : {}) as Record<
        string,
        unknown
      >;

      // Remove resource/version from fragment if present (table is authoritative)
      const { resource: _r, version: _v, ...rest } = fragment;

      // Build full query
      const fullQuery = {
        resource: name,
        version,
        ...rest,
      };

      // Get or create signal from registry (ensures caching by dfqlKey)
      return signalRegistry.getSignal(fullQuery);
    },

    /**
     * Subscribe to events for this table's resource (CLIENT-SUB-001)
     */
    subscribe(handler: EventHandler, filter?: EventFilter): () => void {
      // Inject resource filter (table is authoritative)
      const tableFilter: EventFilter = {
        ...filter,
        resource: name, // Always use table's resource, ignore user-provided
      };

      return client.subscribe(handler, tableFilter);
    },
  };
}
