/**
 * Table Registry
 *
 * Manages table handles with object identity caching.
 */

import type { DatafnSchema } from "@datafn/core";
import { createClientError } from "../errors.js";
import { createTable, type DatafnTable } from "./table.js";
import type { SignalRegistry } from "../signals/querySignal.js";

// Forward declaration for client interface
interface ClientWithQuery {
  query(q: unknown | unknown[]): Promise<unknown>;
  mutate(m: unknown | unknown[]): Promise<unknown>;
  subscribe(handler: any, filter?: any): () => void;
}

export class TableRegistry {
  private schema: DatafnSchema;
  private tables: Map<string, DatafnTable>;
  private client: ClientWithQuery;
  private signalRegistry: SignalRegistry;

  constructor(
    schema: DatafnSchema,
    client: ClientWithQuery,
    signalRegistry: SignalRegistry
  ) {
    this.schema = schema;
    this.tables = new Map();
    this.client = client;
    this.signalRegistry = signalRegistry;
  }

  /**
   * Get a table handle by name.
   * Caches table instances for object identity.
   * Throws DFQL_UNKNOWN_RESOURCE for unknown tables.
   */
  getTable(name: string): DatafnTable {
    // Check cache first
    const cached = this.tables.get(name);
    if (cached) {
      return cached;
    }

    // Find resource in schema
    const resource = this.schema.resources.find((r) => r.name === name);
    if (!resource) {
      createClientError("DFQL_UNKNOWN_RESOURCE", `Unknown resource: ${name}`, {
        path: "resource",
        resource: name,
      });
    }

    // Create and cache table
    const table = createTable(
      resource.name,
      resource.version,
      this.client,
      this.signalRegistry
    );
    this.tables.set(name, table);
    return table;
  }

  /**
   * Get all declared table names from schema
   */
  getTableNames(): string[] {
    return this.schema.resources.map((r) => r.name);
  }
}
