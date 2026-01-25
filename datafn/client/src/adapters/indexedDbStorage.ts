/**
 * IndexedDB storage adapter for persistent client storage.
 * Implements deterministic ordering and changelog deduplication.
 */

import type {
  DatafnStorageAdapter,
  DatafnHydrationState,
  DatafnChangelogEntry,
} from "../storage.js";

const DB_NAME = "datafn_client_db";
const DB_VERSION = 1;

function validateHydrationState(state: string): DatafnHydrationState {
  if (state !== "notStarted" && state !== "hydrating" && state !== "ready") {
    throw new Error(`Invalid hydration state: ${state}`);
  }
  return state as DatafnHydrationState;
}

function validateTransition(
  from: DatafnHydrationState,
  to: DatafnHydrationState,
): void {
  if (from === to) return;
  if (from === "notStarted" && to === "hydrating") return;
  if (from === "hydrating" && to === "ready") return;
  if (from === "ready" && to === "hydrating") return;
  throw new Error(`Invalid hydration state transition: ${from} -> ${to}`);
}

function validateCursor(cursor: unknown): void {
  if (cursor !== null && typeof cursor !== "string") {
    throw new Error("Invalid cursor format");
  }
}

function validateMutation(mutation: any): void {
  if (!mutation.clientId) throw new Error("Missing clientId in mutation");
  if (!mutation.mutationId) throw new Error("Missing mutationId in mutation");
}

export class IndexedDbStorageAdapter implements DatafnStorageAdapter {
  private dbPromise: Promise<IDBDatabase>;
  private validResources?: Set<string>;

  constructor(dbName: string = DB_NAME, resources?: string[]) {
    if (resources) {
      this.validResources = new Set(resources);
    }
    this.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(dbName, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);

      request.onupgradeneeded = (event) => {
        const db = request.result;

        // Records store: Key [resource, id]
        // This effectively groups by resource and allows range queries
        if (!db.objectStoreNames.contains("records")) {
          const store = db.createObjectStore("records", {
            keyPath: ["resource", "id"],
          });
          store.createIndex("by_resource", "resource", { unique: false });
        }

        // Join rows store: Key [relationKey, from, to]
        if (!db.objectStoreNames.contains("join_rows")) {
          const store = db.createObjectStore("join_rows", {
            keyPath: ["relationKey", "from", "to"],
          });
          store.createIndex("by_relation", "relationKey", { unique: false });
        }

        // Meta store: Key [type, key] (e.g. ["cursor", "task"], ["hydration", "task"])
        if (!db.objectStoreNames.contains("meta")) {
          db.createObjectStore("meta", { keyPath: ["type", "key"] });
        }

        // Changelog store: Key seq (autoIncrement)
        if (!db.objectStoreNames.contains("changelog")) {
          const store = db.createObjectStore("changelog", {
            keyPath: "seq",
            autoIncrement: true,
          });
          // Unique index for deduplication
          store.createIndex("by_client_mutation", ["clientId", "mutationId"], {
            unique: true,
          });
        }
      };
    });
  }

  private validateTableName(table: string) {
    if (this.validResources && !this.validResources.has(table)) {
      throw new Error(`Unknown table: ${table}`);
    }
  }

  private async getStore(
    storeName: string,
    mode: IDBTransactionMode,
  ): Promise<IDBObjectStore> {
    const db = await this.dbPromise;
    return db.transaction(storeName, mode).objectStore(storeName);
  }

  // --- Records ---

  async getRecord(
    resource: string,
    id: string,
  ): Promise<Record<string, unknown> | null> {
    this.validateTableName(resource);
    const store = await this.getStore("records", "readonly");
    return new Promise((resolve, reject) => {
      const request = store.get([resource, id]);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async listRecords(resource: string): Promise<Record<string, unknown>[]> {
    this.validateTableName(resource);
    const store = await this.getStore("records", "readonly");
    const index = store.index("by_resource");
    return new Promise((resolve, reject) => {
      // Get all records for resource
      // Since keyPath is [resource, id], the natural index order for "by_resource" might not guarantee id sort?
      // Actually, if we use the primary key range on the store itself:
      // IDB sorts by key path. [resource, id] sorts by resource, then id.
      // So retrieving a range matching [resource, -Infinity] to [resource, Infinity]
      // from the object store directly will return them sorted by id!

      const range = IDBKeyRange.bound([resource, ""], [resource, "\uffff"]);

      const request = store.getAll(range);
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async upsertRecord(
    resource: string,
    record: Record<string, unknown>,
  ): Promise<void> {
    this.validateTableName(resource);
    const store = await this.getStore("records", "readwrite");
    return new Promise((resolve, reject) => {
      // Ensure resource is set in record for storage (though it might be redundant with key)
      // The keyPath requires 'resource' and 'id' properties on the object.
      const recordWithKey = { ...record, resource };
      const request = store.put(recordWithKey);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async deleteRecord(resource: string, id: string): Promise<void> {
    this.validateTableName(resource);
    const store = await this.getStore("records", "readwrite");
    return new Promise((resolve, reject) => {
      const request = store.delete([resource, id]);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // --- Join Rows ---

  async listJoinRows(
    relationKey: string,
  ): Promise<Array<Record<string, unknown>>> {
    const store = await this.getStore("join_rows", "readonly");

    // Similarly, keyPath [relationKey, from, to] guarantees sorting by from, then to.
    const range = IDBKeyRange.bound(
      [relationKey, "", ""],
      [relationKey, "\uffff", "\uffff"],
    );

    return new Promise((resolve, reject) => {
      const request = store.getAll(range);
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async getJoinRows(
    relationKey: string,
    fromId: string,
  ): Promise<Array<Record<string, unknown>>> {
    const store = await this.getStore("join_rows", "readonly");
    const range = IDBKeyRange.bound(
      [relationKey, fromId, ""],
      [relationKey, fromId, "\uffff"],
    );

    return new Promise((resolve, reject) => {
      const request = store.getAll(range);
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async upsertJoinRow(
    relationKey: string,
    row: Record<string, unknown>,
  ): Promise<void> {
    const store = await this.getStore("join_rows", "readwrite");
    return new Promise((resolve, reject) => {
      const rowWithKey = { ...row, relationKey };
      const request = store.put(rowWithKey);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async setJoinRows(
    relationKey: string,
    rows: Array<Record<string, unknown>>,
  ): Promise<void> {
    const store = await this.getStore("join_rows", "readwrite");
    return new Promise((resolve, reject) => {
      // Transaction commits when all requests done
      // Loop
      let count = 0;
      if (rows.length === 0) {
        resolve();
        return;
      }
      const checkDone = () => {
        count++;
        if (count === rows.length) resolve();
      };

      for (const row of rows) {
        const rowWithKey = { ...row, relationKey };
        const req = store.put(rowWithKey);
        req.onsuccess = checkDone;
        req.onerror = () => reject(req.error);
      }
    });
  }

  async deleteJoinRow(
    relationKey: string,
    from: string,
    to: string,
  ): Promise<void> {
    const store = await this.getStore("join_rows", "readwrite");
    return new Promise((resolve, reject) => {
      const request = store.delete([relationKey, from, to]);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async findRecords(
    resource: string,
    field: string,
    value: unknown,
  ): Promise<Record<string, unknown>[]> {
    // Optimization for ID lookup
    if (field === "id") {
      const record = await this.getRecord(resource, value as string);
      return record ? [record] : [];
    }

    // Fallback: list all and filter
    // Since this is client-side, scanning usually acceptable for typical local datasets
    const all = await this.listRecords(resource);
    return all.filter((r) => r[field] === value);
  }

  // --- Sync State ---

  async getCursor(resource: string): Promise<string | null> {
    this.validateTableName(resource);
    const store = await this.getStore("meta", "readonly");
    return new Promise((resolve, reject) => {
      const request = store.get(["cursor", resource]);
      request.onsuccess = () => resolve(request.result?.value || null);
      request.onerror = () => reject(request.error);
    });
  }

  async setCursor(resource: string, cursor: string | null): Promise<void> {
    this.validateTableName(resource);
    validateCursor(cursor);
    const store = await this.getStore("meta", "readwrite");
    return new Promise((resolve, reject) => {
      if (cursor === null) {
        const request = store.delete(["cursor", resource]);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      } else {
        const request = store.put({
          type: "cursor",
          key: resource,
          value: cursor,
        });
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      }
    });
  }

  async getHydrationState(resource: string): Promise<DatafnHydrationState> {
    this.validateTableName(resource);
    const store = await this.getStore("meta", "readonly");
    return new Promise((resolve, reject) => {
      const request = store.get(["hydration", resource]);
      request.onsuccess = () => resolve(request.result?.value || "notStarted");
      request.onerror = () => reject(request.error);
    });
  }

  async setHydrationState(
    resource: string,
    state: DatafnHydrationState,
  ): Promise<void> {
    this.validateTableName(resource);
    validateHydrationState(state);
    const current = await this.getHydrationState(resource);
    validateTransition(current, state);

    const store = await this.getStore("meta", "readwrite");
    return new Promise((resolve, reject) => {
      const request = store.put({
        type: "hydration",
        key: resource,
        value: state,
      });
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // --- Changelog ---

  async changelogAppend(
    entry: Omit<DatafnChangelogEntry, "seq">,
  ): Promise<DatafnChangelogEntry> {
    validateMutation(entry);
    const store = await this.getStore("changelog", "readwrite");
    const index = store.index("by_client_mutation");

    // Check for duplicate
    const existing = await new Promise<DatafnChangelogEntry | undefined>(
      (resolve, reject) => {
        const request = index.get([entry.clientId, entry.mutationId]);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      },
    );

    if (existing) {
      return existing;
    }

    // Insert new
    return new Promise((resolve, reject) => {
      // Don't pass seq, let autoIncrement handle it
      const request = store.add(entry);
      request.onsuccess = () => {
        const seq = request.result as number;
        resolve({ ...entry, seq });
      };
      request.onerror = () => reject(request.error);
    });
  }

  async changelogList(
    options: { limit?: number } = {},
  ): Promise<DatafnChangelogEntry[]> {
    const store = await this.getStore("changelog", "readonly");
    return new Promise((resolve, reject) => {
      const limit = options.limit || 100;
      // getAll allows limit
      const request = store.getAll(null, limit);
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async changelogAck(options: { throughSeq: number }): Promise<void> {
    const store = await this.getStore("changelog", "readwrite");

    // Delete range <= throughSeq
    const range = IDBKeyRange.upperBound(options.throughSeq);

    return new Promise((resolve, reject) => {
      const request = store.delete(range);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}
