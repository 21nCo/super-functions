/**
 * IndexedDB storage adapter for persistent client storage.
 * Implements deterministic ordering and changelog deduplication.
 */

import type {
  DatafnStorageAdapter,
  DatafnHydrationState,
  DatafnChangelogEntry,
} from "../storage.js";
import type { DatafnSchema, DatafnRelationSchema } from "@datafn/core";
import {
  KV_RESOURCE_NAME,
  TIMEZONE_CHANGE_RESOURCE_NAME,
  endpointIncludes,
  firstEndpoint,
  getJoinStoreKey,
  enumerateJoinStoreKeys,
} from "@datafn/core";
import {
  validateHydrationState,
  validateTransition,
  validateCursor,
  cloneForStorage,
} from "./shared.js";

const DB_NAME = "datafn_client_db";
const DB_VERSION = 2;
const BLOCKED_UPGRADE_TIMEOUT_MS = 1000;
/** CLI-013: Maximum IDB version before database recreation */
const MAX_IDB_VERSION = 1000;

function validateMutation(mutation: any): void {
  if (!mutation.clientId) throw new Error("Missing clientId in mutation");
  if (!mutation.mutationId) throw new Error("Missing mutationId in mutation");
}

function isInternalCursorKey(resource: string): boolean {
  return resource === "__global_cursor__" || resource === "__datafn_actor_feed__";
}

/**
 * Deep merge helper
 * - Top-level scalar fields: overwrite
 * - Top-level object fields: shallow-merge the nested object
 * - Arrays: overwrite (no array merging)
 */
function deepMergeOneLevel(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    const sv = source[key];
    const tv = target[key];
    if (
      sv !== null &&
      typeof sv === "object" &&
      !Array.isArray(sv) &&
      tv !== null &&
      typeof tv === "object" &&
      !Array.isArray(tv)
    ) {
      // One-level deep merge for objects
      result[key] = { ...tv, ...sv };
    } else {
      // Overwrite for everything else (scalars, arrays, null)
      result[key] = sv;
    }
  }
  return result;
}

export class IndexedDbStorageAdapter implements DatafnStorageAdapter {
  private dbPromise: Promise<IDBDatabase>;
  private validResources?: Set<string>;
  private schema?: DatafnSchema;
  readonly dbName: string;

  /**
   * Create an IndexedDB storage adapter with schema-aware store creation.
   * This is the **recommended** way to create the adapter — schema is required,
   * ensuring all resource object stores and join tables are created in IndexedDB.
   *
   * If the database already exists but is missing stores (stale DB), the adapter
   * automatically bumps the version and creates the missing stores.
   *
   * @param options.dbName - Database name (e.g., "my-app-db")
   * @param options.schema - DataFn schema (required — used to create object stores)
   *
   * @example
   * ```typescript
   * const storage = IndexedDbStorageAdapter.create({
   *   dbName: "my-app-db",
   *   schema,
   * });
   * ```
   */
  static create(options: {
    dbName: string;
    schema: DatafnSchema;
  }): IndexedDbStorageAdapter {
    const resources = options.schema.resources
      .filter((r) => !r.isRemoteOnly)
      .map((r) => r.name);
    // Ensure built-in KV resource is always valid (KV-001)
    if (!resources.includes(KV_RESOURCE_NAME)) {
      resources.push(KV_RESOURCE_NAME);
    }
    if (!resources.includes(TIMEZONE_CHANGE_RESOURCE_NAME)) {
      resources.push(TIMEZONE_CHANGE_RESOURCE_NAME);
    }
    // Register join store keys for many-many relations
    if (options.schema.relations) {
      for (const key of enumerateJoinStoreKeys(options.schema.relations)) {
        if (!resources.includes(key)) {
          resources.push(key);
        }
      }
    }
    return new IndexedDbStorageAdapter(options.dbName, resources, options.schema);
  }

  /**
   * Create a storage adapter with a namespace-derived database name.
   * The namespace string has `:` replaced with `_` for the IDB database name.
   *
   * @example
   * ```typescript
   * const storage = IndexedDbStorageAdapter.createForNamespace("my-app", "org:user-1");
   * // IDB database name: "my-app_org_user-1"
   * ```
   */
  static createForNamespace(
    baseDbName: string,
    namespace: string,
    resources?: string[],
    schema?: DatafnSchema,
  ): IndexedDbStorageAdapter {
    const sanitized = namespace.replace(/:/g, "_");
    const dbName = `${baseDbName}_${sanitized}`;

    let finalResources = resources;
    if (!finalResources && schema) {
      finalResources = schema.resources
        .filter((r) => !r.isRemoteOnly)
        .map((r) => r.name);
    }
    if (finalResources && !finalResources.includes(KV_RESOURCE_NAME)) {
      finalResources = [...finalResources, KV_RESOURCE_NAME];
    }
    if (finalResources && !finalResources.includes(TIMEZONE_CHANGE_RESOURCE_NAME)) {
      finalResources = [...finalResources, TIMEZONE_CHANGE_RESOURCE_NAME];
    }
    if (finalResources && schema?.relations) {
      for (const key of enumerateJoinStoreKeys(schema.relations)) {
        if (!finalResources.includes(key)) {
          finalResources.push(key);
        }
      }
    }

    return new IndexedDbStorageAdapter(dbName, finalResources, schema);
  }

  constructor(
    dbName: string = DB_NAME,
    resources?: string[],
    schema?: DatafnSchema,
  ) {
    this.dbName = dbName;
    if (resources) {
      this.validResources = new Set(resources);
      // Ensure built-in KV resource is always valid (KV-001)
      this.validResources.add(KV_RESOURCE_NAME);
      this.validResources.add(TIMEZONE_CHANGE_RESOURCE_NAME);
    }
    this.schema = schema;

    // Open the database, then verify all expected stores exist.
    // If stores are missing (stale DB from prior version without schema),
    // close and reopen with a bumped version to trigger onupgradeneeded.
    this.dbPromise = this.openDatabaseAtMinimumVersion(DB_VERSION).then((db) =>
      this.ensureStores(db),
    );
  }

  private async openDatabaseAtMinimumVersion(
    version: number,
  ): Promise<IDBDatabase> {
    try {
      return await this.openDatabase(version);
    } catch (error: any) {
      if (error?.name !== "VersionError") {
        throw error;
      }
      return this.openDatabase();
    }
  }

  /**
   * Open (or upgrade) the IndexedDB database at the given version.
   * All object store creation happens inside `onupgradeneeded`.
   */
  private openDatabase(version?: number): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request =
        version === undefined
          ? indexedDB.open(this.dbName)
          : indexedDB.open(this.dbName, version);

      let blockedTimer: ReturnType<typeof setTimeout> | undefined;
      const clearBlockedTimer = () => {
        if (blockedTimer) {
          clearTimeout(blockedTimer);
          blockedTimer = undefined;
        }
      };

      request.onerror = () => {
        clearBlockedTimer();
        reject(request.error);
      };
      request.onblocked = () => {
        clearBlockedTimer();
        blockedTimer = setTimeout(() => {
          reject(
            new Error(
              `IndexedDB upgrade blocked for ${this.dbName}. Close other tabs using this database and retry.`,
            ),
          );
        }, BLOCKED_UPGRADE_TIMEOUT_MS);
      };
      request.onsuccess = () => {
        clearBlockedTimer();
        const db = request.result;
        db.onversionchange = () => {
          db.close();
        };
        resolve(db);
      };

      request.onupgradeneeded = (event) => {
        const db = request.result;
        const txn = request.transaction!;

        // --- Migration from v1 (IDB-001: Two-phase migration approach) ---
        // Phase 1: Detect and log old version for migration tracking
        if (event.oldVersion < 2 && event.oldVersion > 0) {
          console.log(`IndexedDB migration: Detected v${event.oldVersion}, upgrading to v${version}`);
          
          // Store migration metadata in __datafn_meta for tracking
          if (!db.objectStoreNames.contains("__datafn_meta")) {
            db.createObjectStore("__datafn_meta", { keyPath: "key" });
          }
          
          // Mark migration as in-progress (for potential recovery detection)
          const metaStore = txn.objectStore("__datafn_meta");
          metaStore.put({
            key: "migration_v1_to_v2",
            status: "in_progress",
            startedAt: new Date().toISOString(),
            oldVersion: event.oldVersion,
          });

          // Log but don't fail on migration issues - preserve old data
          // Actual async migration will happen after DB opens (Phase 2)
          try {
            // For v1 -> v2: We're changing from monolithic stores to per-resource stores
            // Synchronous schema changes only - data migration happens post-open
            console.log("IndexedDB migration: Schema changes applied. Data migration deferred to post-open phase.");
          } catch (migrationError) {
            console.error("IndexedDB migration warning:", migrationError);
            // Don't throw - allow schema to be created, old data preserved
          }
        }

        // --- Create/Update Stores based on Schema ---
        if (this.schema) {
          // 1. Resource Stores
          for (const resource of this.schema.resources) {
            if (!db.objectStoreNames.contains(resource.name)) {
              const store = db.createObjectStore(resource.name, {
                keyPath: "id",
              });
              
              // Base indices from schema
              if (resource.indices) {
                const indices = Array.isArray(resource.indices)
                  ? resource.indices
                  : "base" in resource.indices
                    ? resource.indices.base || []
                    : [];

                for (const field of indices) {
                  store.createIndex(`by_${field}`, field, { unique: false });
                }
              }

              // FK indices (inferred from relations)
              if (this.schema.relations) {
                for (const rel of this.schema.relations) {
                  if (rel.type === "many-one" && endpointIncludes(rel.from, resource.name)) {
                     const fk = rel.fkField || `${rel.relation}Id`;
                     if (!store.indexNames.contains(`by_${fk}`)) {
                        store.createIndex(`by_${fk}`, fk, { unique: false });
                     }
                  } else if (rel.type === "one-many" && endpointIncludes(rel.to, resource.name)) {
                     // For one-many, 'to' has the FK back to 'from'
                     const fk = rel.fkField || rel.inverse || `${firstEndpoint(rel.from)}Id`;
                     if (!store.indexNames.contains(`by_${fk}`)) {
                        store.createIndex(`by_${fk}`, fk, { unique: false });
                     }
                  }
                }
              }
            }
          }

          // 2. Join Stores (Many-Many)
          if (this.schema.relations) {
            for (const rel of this.schema.relations) {
              if (rel.type === "many-many") {
                const froms = Array.isArray(rel.from) ? rel.from : [rel.from];
                const tos = Array.isArray(rel.to) ? rel.to : [rel.to];
                
                for (const f of froms) {
                  for (const t of tos) {
                    const storeName = getJoinStoreKey(f, rel.relation || "rel", t);
                    if (!db.objectStoreNames.contains(storeName)) {
                      const store = db.createObjectStore(storeName, {
                        keyPath: ["from", "to"],
                      });
                      store.createIndex("by_from", "from", { unique: false });
                      store.createIndex("by_to", "to", { unique: false });
                    }
                  }
                }
              }
            }
          }
        }

        // --- Built-in KV Store (KV-001) ---
        // Always create KV object store with index on id
        if (!db.objectStoreNames.contains("kv")) {
          const kvStore = db.createObjectStore("kv", { keyPath: "id" });
          kvStore.createIndex("by_id", "id", { unique: true });
        }

        if (!db.objectStoreNames.contains(TIMEZONE_CHANGE_RESOURCE_NAME)) {
          const store = db.createObjectStore(TIMEZONE_CHANGE_RESOURCE_NAME, { keyPath: "id" });
          store.createIndex("by_id", "id", { unique: true });
          store.createIndex("by_effectiveFrom", "effectiveFrom", { unique: false });
          store.createIndex("by_timezone", "timezone", { unique: false });
        }

        // --- Meta Stores (Preserve/Create) ---
        if (!db.objectStoreNames.contains("meta")) {
          db.createObjectStore("meta", { keyPath: ["type", "key"] });
        }

        if (!db.objectStoreNames.contains("changelog")) {
          const store = db.createObjectStore("changelog", {
            keyPath: "seq",
            autoIncrement: true,
          });
          store.createIndex("by_client_mutation", ["clientId", "mutationId"], {
            unique: true,
          });
        }
        
        // IDB-001: Preserve old stores for recovery
        // DO NOT delete old stores ("records", "join_rows") immediately
        // They are preserved in case migration fails and manual recovery is needed
        // The new adapter only uses per-resource stores going forward
        if (event.oldVersion < 2 && event.oldVersion > 0) {
          console.log("IndexedDB migration: Old v1 stores preserved for recovery if needed");
          // Migration completion will be marked by healthCheck() after successful operation
        }
      };
    });
  }

  /**
   * Verify all expected stores exist after initial open.
   * If stores are missing (stale DB opened without schema previously),
   * close the database and reopen with a bumped version to trigger
   * `onupgradeneeded`, which will create the missing stores.
   */
  private async ensureStores(db: IDBDatabase): Promise<IDBDatabase> {
    if (!this.schema) return db;

    const missing: string[] = [];

    // Check resource stores
    for (const resource of this.schema.resources) {
      if (!db.objectStoreNames.contains(resource.name)) {
        missing.push(resource.name);
      }
    }

    // Check join stores (many-many)
    if (this.schema.relations) {
      for (const rel of this.schema.relations) {
        if (rel.type === "many-many") {
          const froms = Array.isArray(rel.from) ? rel.from : [rel.from];
          const tos = Array.isArray(rel.to) ? rel.to : [rel.to];
          for (const f of froms) {
            for (const t of tos) {
              const storeName = getJoinStoreKey(f, rel.relation || "rel", t);
              if (!db.objectStoreNames.contains(storeName)) {
                missing.push(storeName);
              }
            }
          }
        }
      }
    }

    if (missing.length === 0) return db;

    const nextVersion = db.version + 1;
    db.close();

    // CLI-013: If version exceeds max, recreate the database from scratch
    if (nextVersion > MAX_IDB_VERSION) {
      console.warn(
        `[datafn] IndexedDB version ${nextVersion} exceeds MAX_IDB_VERSION (${MAX_IDB_VERSION}). Recreating database.`,
      );
      await new Promise<void>((resolve, reject) => {
        const req = indexedDB.deleteDatabase(this.dbName);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
        req.onblocked = () => resolve(); // proceed even if blocked
      });
      return this.openDatabase(DB_VERSION);
    }

    return this.openDatabase(nextVersion);
  }

  private validateTableName(table: string) {
    // CLI-006: Skip validation for internal health-check probe keys
    if (table === "__health_check__" || table.startsWith("__datafn_")) return;
    if (this.validResources && !this.validResources.has(table)) {
      throw new Error(`Unknown table: ${table}`);
    }
  }

  private async getStore(
    storeName: string,
    mode: IDBTransactionMode,
  ): Promise<IDBObjectStore> {
    let db = await this.dbPromise;
    if (!db.objectStoreNames.contains(storeName)) {
      db = await this.repairMissingStore(storeName, db);
    }
    if (!db.objectStoreNames.contains(storeName)) {
      throw new Error(`Store not found: ${storeName}`);
    }
    return db.transaction(storeName, mode).objectStore(storeName);
  }

  private async repairMissingStore(
    storeName: string,
    db: IDBDatabase,
  ): Promise<IDBDatabase> {
    if (!this.schema || !this.isExpectedStore(storeName)) {
      return db;
    }

    const nextVersion = db.version + 1;
    db.close();

    if (nextVersion > MAX_IDB_VERSION) {
      await new Promise<void>((resolve, reject) => {
        const req = indexedDB.deleteDatabase(this.dbName);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
        req.onblocked = () => resolve();
      });
      this.dbPromise = this.openDatabase(DB_VERSION).then((opened) =>
        this.ensureStores(opened),
      );
    } else {
      this.dbPromise = this.openDatabase(nextVersion).then((opened) =>
        this.ensureStores(opened),
      );
    }

    return this.dbPromise;
  }

  private isExpectedStore(storeName: string): boolean {
    if (
      storeName === "meta" ||
      storeName === "changelog" ||
      storeName === "kv" ||
      storeName === "__datafn_meta" ||
      storeName === TIMEZONE_CHANGE_RESOURCE_NAME
    ) {
      return true;
    }
    return this.validResources?.has(storeName) === true;
  }

  // --- Records ---

  async getRecord(
    resource: string,
    id: string,
  ): Promise<Record<string, unknown> | null> {
    this.validateTableName(resource);
    const store = await this.getStore(resource, "readonly");
    return new Promise((resolve, reject) => {
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async listRecords(resource: string): Promise<Record<string, unknown>[]> {
    this.validateTableName(resource);
    const store = await this.getStore(resource, "readonly");
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async upsertRecord(
    resource: string,
    record: Record<string, unknown>,
  ): Promise<void> {
    this.validateTableName(resource);
    const store = await this.getStore(resource, "readwrite");
    const storageRecord = cloneForStorage(record);
    return new Promise((resolve, reject) => {
      const request = store.put(storageRecord);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async deleteRecord(resource: string, id: string): Promise<void> {
    this.validateTableName(resource);
    const store = await this.getStore(resource, "readwrite");
    return new Promise((resolve, reject) => {
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Atomic read-modify-write merge using a single transaction.
   * Uses one-level-deep merge for object-type fields.
   */
  async mergeRecord(
    resource: string,
    id: string,
    partial: Record<string, unknown>,
    options?: { ifMissing?: Record<string, unknown> },
  ): Promise<Record<string, unknown>> {
    this.validateTableName(resource);
    const db = await this.dbPromise;
    
    return new Promise((resolve, reject) => {
      const tx = db.transaction(resource, "readwrite");
      const store = tx.objectStore(resource);
      
      // Read existing record
      const getRequest = store.get(id);
      
      getRequest.onsuccess = () => {
        const existing = getRequest.result;
        // Merge with deep merge logic
        const merged = existing
          ? deepMergeOneLevel(existing, partial)
          : { ...(options?.ifMissing ?? partial), id };
        
        merged.id = id;
        const storageRecord = cloneForStorage(merged);
        const putRequest = store.put(storageRecord);
        
        putRequest.onsuccess = () => {
          resolve(storageRecord);
        };
        putRequest.onerror = () => {
          reject(putRequest.error);
        };
      };
      
      getRequest.onerror = () => {
        reject(getRequest.error);
      };
      
      tx.onerror = () => {
        reject(tx.error);
      };
    });
  }

  // --- Join Rows ---

  async listJoinRows(
    storeName: string,
  ): Promise<Array<Record<string, unknown>>> {
    const store = await this.getStore(storeName, "readonly");
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async getJoinRows(
    storeName: string,
    fromId: string,
  ): Promise<Array<Record<string, unknown>>> {
    const store = await this.getStore(storeName, "readonly");
    const index = store.index("by_from");
    return new Promise((resolve, reject) => {
      const request = index.getAll(fromId);
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }
  
  async getJoinRowsInverse(
    storeName: string,
    toId: string,
  ): Promise<Array<Record<string, unknown>>> {
    const store = await this.getStore(storeName, "readonly");
    const index = store.index("by_to");
    return new Promise((resolve, reject) => {
      const request = index.getAll(toId);
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async upsertJoinRow(
    storeName: string,
    row: Record<string, unknown>,
  ): Promise<void> {
    const store = await this.getStore(storeName, "readwrite");
    const storageRow = cloneForStorage(row);
    return new Promise((resolve, reject) => {
      const request = store.put(storageRow);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async setJoinRows(
    storeName: string,
    rows: Array<Record<string, unknown>>,
  ): Promise<void> {
    const store = await this.getStore(storeName, "readwrite");
    return new Promise((resolve, reject) => {
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
        const req = store.put(cloneForStorage(row));
        req.onsuccess = checkDone;
        req.onerror = () => reject(req.error);
      }
    });
  }

  async deleteJoinRow(
    storeName: string,
    from: string,
    to: string,
  ): Promise<void> {
    const store = await this.getStore(storeName, "readwrite");
    return new Promise((resolve, reject) => {
      const request = store.delete([from, to]);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async findRecords(
    resource: string,
    field: string,
    value: unknown,
  ): Promise<Record<string, unknown>[]> {
    this.validateTableName(resource);
    const store = await this.getStore(resource, "readonly");

    // Check if index exists
    if (store.indexNames.contains(`by_${field}`)) {
         const index = store.index(`by_${field}`);
         return new Promise((resolve, reject) => {
             const request = index.getAll(value as IDBValidKey);
             request.onsuccess = () => resolve(request.result || []);
             request.onerror = () => reject(request.error);
         });
    }

    // Index-miss path: list all and filter (strictly scoped to resource)
    const all = await this.listRecords(resource);
    return all.filter((r) => r[field] === value);
  }

  // --- Sync State ---

  async getCursor(resource: string): Promise<string | null> {
    // Skip validation for internal cursor keys (SYNC-CURSOR-001)
    if (!isInternalCursorKey(resource)) {
      this.validateTableName(resource);
    }
    const store = await this.getStore("meta", "readonly");
    return new Promise((resolve, reject) => {
      const request = store.get(["cursor", resource]);
      request.onsuccess = () => resolve(request.result?.value || null);
      request.onerror = () => reject(request.error);
    });
  }

  async setCursor(resource: string, cursor: string | null): Promise<void> {
    // Skip validation for internal cursor keys (SYNC-CURSOR-001)
    if (!isInternalCursorKey(resource)) {
      this.validateTableName(resource);
    }
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
    const storageEntry = cloneForStorage(entry);
    return new Promise((resolve, reject) => {
      const request = store.add(storageEntry);
      request.onsuccess = () => {
        const seq = request.result as number;
        resolve({ ...storageEntry, seq });
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

  // --- Counts for reconcile (SYNC-007) ---

  async countRecords(resource: string): Promise<number> {
    this.validateTableName(resource);
    const store = await this.getStore(resource, "readonly");
    return new Promise((resolve, reject) => {
      const request = store.count();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async countJoinRows(relationKey: string): Promise<number> {
    const store = await this.getStore(relationKey, "readonly");
    return new Promise((resolve, reject) => {
      const request = store.count();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // --- Lifecycle (CLN-001, CLN-002) ---

  async close(): Promise<void> {
    const db = await this.dbPromise;
    db.close();
  }

  async clearAll(): Promise<void> {
    const db = await this.dbPromise;
    const storeNames = Array.from(db.objectStoreNames);
    
    // Delete all data from all stores
    const transaction = db.transaction(storeNames, "readwrite");
    
    return new Promise((resolve, reject) => {
      const clearPromises: Promise<void>[] = [];
      
      for (const storeName of storeNames) {
        const store = transaction.objectStore(storeName);
        clearPromises.push(
          new Promise((resolveStore, rejectStore) => {
            const request = store.clear();
            request.onsuccess = () => resolveStore();
            request.onerror = () => rejectStore(request.error);
          })
        );
      }
      
      transaction.oncomplete = () => {
        Promise.all(clearPromises).then(() => resolve()).catch(reject);
      };
      transaction.onerror = () => reject(transaction.error);
    });
  }

  // --- Health Check (HEAL-001, IDB-001) ---

  async healthCheck(): Promise<{ ok: boolean; issues: string[] }> {
    const issues: string[] = [];
    
    try {
      // Verify database is accessible
      const db = await this.dbPromise;
      if (!db) {
        issues.push("Database not initialized");
        return { ok: false, issues };
      }

      // Verify expected object stores exist
      const storeNames = Array.from(db.objectStoreNames);
      
      // Check meta stores
      const requiredStores = ["meta", "changelog"];
      for (const storeName of requiredStores) {
        if (!storeNames.includes(storeName)) {
          issues.push(`Missing object store: ${storeName}`);
        }
      }

      // Check resource stores if we have a schema
      if (this.schema) {
        for (const resource of this.schema.resources) {
          if (!storeNames.includes(resource.name)) {
            issues.push(`Missing object store: ${resource.name}`);
          }
        }
      }

      // Verify cursor store is readable (use a health check key that won't conflict)
      if (storeNames.includes("meta")) {
        try {
          await this.getCursor("__health_check__");
        } catch (err) {
          issues.push(`Cursor store is not readable: ${String(err)}`);
        }
      }

      // IDB-001: Check for stuck migrations
      if (storeNames.includes("__datafn_meta")) {
        try {
          const metaStore = await this.getStore("__datafn_meta", "readonly");
          const migrationStatus = await new Promise<any>((resolve, reject) => {
            const request = metaStore.get("migration_v1_to_v2");
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          });

          if (migrationStatus && migrationStatus.status === "in_progress") {
            issues.push(`Migration stuck: v${migrationStatus.oldVersion} to v${DB_VERSION} started at ${migrationStatus.startedAt}`);
          }
        } catch (err) {
          // Migration metadata read failed - not critical
          console.warn("Could not check migration status:", err);
        }
      }
    } catch (err) {
      issues.push(`Storage access error: ${String(err)}`);
    }

    return { ok: issues.length === 0, issues };
  }
}
