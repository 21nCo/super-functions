import {
  decodePostings,
  type PostingChunkEncoding,
  type QueryStorage,
  type StoredPostingChunk,
  type TermIdentifier,
} from "@searchfn/core";

const DATABASE_VERSION = 2;
const RESOURCE_INDEX = "resource";
const RESOURCE_TERM_INDEX = "resourceFieldTerm";
const LEGACY_MIGRATION_KEY = "per-resource-v1";

const STORE_NAMES = {
  terms: "terms",
  cacheState: "cacheState",
  migrationState: "migrationState",
} as const;

type StoreName = (typeof STORE_NAMES)[keyof typeof STORE_NAMES];
type ResourceStoreName = typeof STORE_NAMES.terms | typeof STORE_NAMES.cacheState;

interface TermChunkDbRecord {
  resource: string;
  field: string;
  term: string;
  chunk: number;
  payload: ArrayBuffer;
  docFrequency: number;
  inverseDocumentFrequency?: number;
  accessCount?: number;
  lastAccessedAt?: number;
  encoding: PostingChunkEncoding;
}

interface CacheStateDbRecord {
  resource: string;
  key: string;
  payload: ArrayBuffer;
  updatedAt: number;
}

interface MigrationStateDbRecord {
  resource: string;
  key: string;
  completedAt: number;
}

type LegacyTermChunkDbRecord = Omit<TermChunkDbRecord, "resource">;
type LegacyCacheStateDbRecord = Omit<CacheStateDbRecord, "resource">;

class IndexedDbStorageError extends Error {
  readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "IndexedDbStorageError";
    this.cause = cause;
  }
}

/** Provides a resource-scoped view over the shared IndexedDB database. */
export interface IndexedDbResourceStorage extends QueryStorage {
  open(): Promise<void>;
  migrateLegacyDatabase(dbName: string): Promise<void>;
  getCacheState(key: string): Promise<ArrayBuffer | undefined>;
  putCacheState(key: string, payload: ArrayBuffer): Promise<void>;
  putTermChunksBatch(chunks: StoredPostingChunk[]): Promise<void>;
  deleteTermChunksForTerm(field: string, term: string): Promise<void>;
  clearStore(storeName: ResourceStoreName): Promise<void>;
}

/** Owns one physical IndexedDB database and creates resource-scoped storage views. */
export class IndexedDbManager {
  private readonly dbName: string;
  private db?: IDBDatabase;
  private openPromise?: Promise<IDBDatabase>;

  constructor(dbName: string) {
    this.dbName = dbName;
  }

  /** Creates a storage view whose records are isolated by resource keys. */
  forResource(resource: string): IndexedDbResourceStorage {
    return {
      open: () => this.open(),
      migrateLegacyDatabase: (dbName) =>
        this.migrateLegacyDatabase(resource, dbName),
      getCacheState: (key) => this.getCacheState(resource, key),
      putCacheState: (key, payload) =>
        this.putCacheState(resource, key, payload),
      getTermChunk: (key) => this.getTermChunk(resource, key),
      decodeChunkPayload: (chunk) => this.decodeChunkPayload(chunk),
      putTermChunksBatch: (chunks) => this.putTermChunksBatch(resource, chunks),
      deleteTermChunksForTerm: (field, term) =>
        this.deleteTermChunksForTerm(resource, field, term),
      clearStore: (storeName) => this.clearStore(resource, storeName),
    };
  }

  /** Opens the shared IndexedDB database. */
  async open(): Promise<void> {
    if (this.db) return;
    if (!this.openPromise) {
      this.openPromise = this.openDatabase().catch((error) => {
        this.openPromise = undefined;
        throw error;
      });
    }
    this.db = await this.openPromise;
  }

  /** Closes the shared IndexedDB database handle. */
  async close(): Promise<void> {
    if (this.openPromise) {
      await this.openPromise.catch(() => undefined);
    }
    this.db?.close();
    this.db = undefined;
    this.openPromise = undefined;
  }

  /** Deletes the shared IndexedDB database. */
  async deleteDatabase(): Promise<void> {
    await this.close();
    const factory = getIndexedDbFactory();
    await new Promise<void>((resolve, reject) => {
      const request = factory.deleteDatabase(this.dbName);
      request.onsuccess = () => resolve();
      request.onerror = () =>
        reject(
          new IndexedDbStorageError(
            "Failed to delete IndexedDB database",
            request.error,
          ),
        );
    });
  }

  private async migrateLegacyDatabase(
    resource: string,
    legacyDbName: string,
  ): Promise<void> {
    await this.open();
    if (await this.hasMigrationMarker(resource)) return;

    // A version-1 shared database may already contain newer data. Never let
    // an older per-resource database overwrite it during the upgrade.
    if (await this.resourceHasData(resource)) {
      await this.markMigrationComplete(resource);
      return;
    }

    const legacy = await this.readLegacyDatabase(legacyDbName);
    await this.withTransaction(
      [STORE_NAMES.terms, STORE_NAMES.cacheState, STORE_NAMES.migrationState],
      "readwrite",
      async (transaction) => {
        const terms = transaction.objectStore(STORE_NAMES.terms);
        const cacheState = transaction.objectStore(STORE_NAMES.cacheState);
        const writes: Array<Promise<unknown>> = [
          transaction.objectStore(STORE_NAMES.migrationState).put({
            resource,
            key: LEGACY_MIGRATION_KEY,
            completedAt: Date.now(),
          } satisfies MigrationStateDbRecord),
        ].map((request) => this.requestToPromise(request));
        writes.push(...(legacy?.terms ?? []).map((record) =>
          this.requestToPromise(terms.put({ resource, ...record }))
        ));
        writes.push(...(legacy?.cacheState ?? []).map((record) =>
          this.requestToPromise(cacheState.put({ resource, ...record }))
        ));
        await Promise.all(writes);
      },
    );
  }

  private openDatabase(): Promise<IDBDatabase> {
    const factory = getIndexedDbFactory();
    const request = factory.open(this.dbName, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAMES.terms)) {
        const terms = database.createObjectStore(STORE_NAMES.terms, {
          keyPath: ["resource", "field", "term", "chunk"],
        });
        terms.createIndex(RESOURCE_INDEX, "resource");
        terms.createIndex(RESOURCE_TERM_INDEX, ["resource", "field", "term"]);
      }
      if (!database.objectStoreNames.contains(STORE_NAMES.cacheState)) {
        const cacheState = database.createObjectStore(STORE_NAMES.cacheState, {
          keyPath: ["resource", "key"],
        });
        cacheState.createIndex(RESOURCE_INDEX, "resource");
      }
      if (!database.objectStoreNames.contains(STORE_NAMES.migrationState)) {
        database.createObjectStore(STORE_NAMES.migrationState, {
          keyPath: ["resource", "key"],
        });
      }
    };
    return new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => {
        const database = request.result;
        database.onversionchange = () => database.close();
        resolve(database);
      };
      request.onerror = () =>
        reject(
          new IndexedDbStorageError(
            "Failed to open IndexedDB database",
            request.error,
          ),
        );
    });
  }

  private async hasMigrationMarker(resource: string): Promise<boolean> {
    return this.withTransaction(
      [STORE_NAMES.migrationState],
      "readonly",
      async (transaction) => Boolean(await this.requestToPromise(
        transaction.objectStore(STORE_NAMES.migrationState).get([
          resource,
          LEGACY_MIGRATION_KEY,
        ]),
      )),
    );
  }

  private async markMigrationComplete(resource: string): Promise<void> {
    await this.withTransaction(
      [STORE_NAMES.migrationState],
      "readwrite",
      async (transaction) => {
        await this.requestToPromise(
          transaction.objectStore(STORE_NAMES.migrationState).put({
            resource,
            key: LEGACY_MIGRATION_KEY,
            completedAt: Date.now(),
          } satisfies MigrationStateDbRecord),
        );
      },
    );
  }

  private async resourceHasData(resource: string): Promise<boolean> {
    return this.withTransaction(
      [STORE_NAMES.terms, STORE_NAMES.cacheState],
      "readonly",
      async (transaction) => {
        const [termCount, cacheCount] = await Promise.all([
          this.requestToPromise<number>(
            transaction.objectStore(STORE_NAMES.terms).index(RESOURCE_INDEX).count(resource),
          ),
          this.requestToPromise<number>(
            transaction.objectStore(STORE_NAMES.cacheState).index(RESOURCE_INDEX).count(resource),
          ),
        ]);
        return termCount > 0 || cacheCount > 0;
      },
    );
  }

  private async readLegacyDatabase(legacyDbName: string): Promise<{
    terms: LegacyTermChunkDbRecord[];
    cacheState: LegacyCacheStateDbRecord[];
  } | null> {
    const factory = getIndexedDbFactory();
    const factoryWithListing = factory as IDBFactory & {
      databases?: () => Promise<Array<{ name?: string }>>;
    };
    if (factoryWithListing.databases) {
      const databases = await factoryWithListing.databases();
      if (!databases.some((database) => database.name === legacyDbName)) {
        return null;
      }
    }

    let created = false;
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = factory.open(legacyDbName);
      request.onupgradeneeded = () => {
        created = true;
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new IndexedDbStorageError(
        "Failed to open legacy IndexedDB database",
        request.error,
      ));
    });

    if (created) {
      database.close();
      await new Promise<void>((resolve) => {
        const deletion = factory.deleteDatabase(legacyDbName);
        deletion.onsuccess = () => resolve();
        deletion.onerror = () => resolve();
        deletion.onblocked = () => resolve();
      });
      return null;
    }

    const stores = [STORE_NAMES.terms, STORE_NAMES.cacheState].filter((store) =>
      database.objectStoreNames.contains(store)
    );
    if (stores.length === 0) {
      database.close();
      return null;
    }

    try {
      const transaction = database.transaction(stores, "readonly");
      const completion = new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onabort = () => reject(transaction.error);
        transaction.onerror = () => reject(transaction.error);
      });
      const termsPromise = database.objectStoreNames.contains(STORE_NAMES.terms)
        ? this.requestToPromise<LegacyTermChunkDbRecord[]>(
            transaction.objectStore(STORE_NAMES.terms).getAll(),
          )
        : Promise.resolve([]);
      const cacheStatePromise = database.objectStoreNames.contains(STORE_NAMES.cacheState)
        ? this.requestToPromise<LegacyCacheStateDbRecord[]>(
            transaction.objectStore(STORE_NAMES.cacheState).getAll(),
          )
        : Promise.resolve([]);
      const [terms, cacheState] = await Promise.all([termsPromise, cacheStatePromise]);
      await completion;
      return { terms, cacheState };
    } finally {
      database.close();
    }
  }

  private assertDb(): IDBDatabase {
    if (!this.db) {
      throw new IndexedDbStorageError("IndexedDB database is not open");
    }
    return this.db;
  }

  private async withTransaction<T>(
    stores: StoreName[],
    mode: IDBTransactionMode,
    fn: (transaction: IDBTransaction) => Promise<T>,
  ): Promise<T> {
    const transaction = this.assertDb().transaction(stores, mode);
    const completion = new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onabort = () =>
        reject(
          new IndexedDbStorageError(
            "IndexedDB transaction aborted",
            transaction.error,
          ),
        );
      transaction.onerror = () =>
        reject(
          new IndexedDbStorageError(
            "IndexedDB transaction failed",
            transaction.error,
          ),
        );
    });
    try {
      const result = await fn(transaction);
      await completion;
      return result;
    } catch (error) {
      try {
        transaction.abort();
      } catch {}
      await completion.catch(() => undefined);
      if (error instanceof IndexedDbStorageError) throw error;
      throw new IndexedDbStorageError(
        "IndexedDB transaction callback failed",
        error,
      );
    }
  }

  private async putTermChunksBatch(
    resource: string,
    chunks: StoredPostingChunk[],
  ): Promise<void> {
    if (chunks.length === 0) return;
    await this.withTransaction(
      [STORE_NAMES.terms],
      "readwrite",
      async (transaction) => {
        const store = transaction.objectStore(STORE_NAMES.terms);
        await Promise.all(
          chunks.map((chunk) => {
            const record: TermChunkDbRecord = {
              resource,
              field: chunk.key.field,
              term: chunk.key.term,
              chunk: chunk.key.chunk,
              payload: chunk.payload,
              docFrequency: chunk.docFrequency,
              inverseDocumentFrequency: chunk.inverseDocumentFrequency,
              accessCount: chunk.accessCount,
              lastAccessedAt: chunk.lastAccessedAt,
              encoding: chunk.encoding ?? "delta-varint",
            };
            return this.requestToPromise(store.put(record));
          }),
        );
      },
    );
  }

  private async getTermChunk(
    resource: string,
    key: TermIdentifier,
  ): Promise<StoredPostingChunk | undefined> {
    return this.withTransaction(
      [STORE_NAMES.terms],
      "readonly",
      async (transaction) => {
        const store = transaction.objectStore(STORE_NAMES.terms);
        const record = await this.requestToPromise<
          TermChunkDbRecord | undefined
        >(store.get([resource, key.field, key.term, key.chunk]));
        if (!record) return undefined;
        return {
          key,
          payload: record.payload,
          docFrequency: record.docFrequency,
          inverseDocumentFrequency: record.inverseDocumentFrequency,
          accessCount: record.accessCount,
          lastAccessedAt: record.lastAccessedAt,
          encoding: record.encoding,
        };
      },
    );
  }

  private async deleteTermChunksForTerm(
    resource: string,
    field: string,
    term: string,
  ): Promise<void> {
    await this.withTransaction(
      [STORE_NAMES.terms],
      "readwrite",
      async (transaction) => {
        const index = transaction
          .objectStore(STORE_NAMES.terms)
          .index(RESOURCE_TERM_INDEX);
        await this.deleteByCursor(index.openCursor([resource, field, term]));
      },
    );
  }

  private async putCacheState(
    resource: string,
    key: string,
    payload: ArrayBuffer,
  ): Promise<void> {
    await this.withTransaction(
      [STORE_NAMES.cacheState],
      "readwrite",
      async (transaction) => {
        const record: CacheStateDbRecord = {
          resource,
          key,
          payload,
          updatedAt: Date.now(),
        };
        await this.requestToPromise(
          transaction.objectStore(STORE_NAMES.cacheState).put(record),
        );
      },
    );
  }

  private async getCacheState(
    resource: string,
    key: string,
  ): Promise<ArrayBuffer | undefined> {
    return this.withTransaction(
      [STORE_NAMES.cacheState],
      "readonly",
      async (transaction) => {
        const record = await this.requestToPromise<
          CacheStateDbRecord | undefined
        >(transaction.objectStore(STORE_NAMES.cacheState).get([resource, key]));
        return record?.payload;
      },
    );
  }

  private async clearStore(
    resource: string,
    storeName: ResourceStoreName,
  ): Promise<void> {
    await this.withTransaction(
      [storeName],
      "readwrite",
      async (transaction) => {
        const index = transaction.objectStore(storeName).index(RESOURCE_INDEX);
        await this.deleteByCursor(index.openCursor(resource));
      },
    );
  }

  private decodeChunkPayload(
    chunk: StoredPostingChunk,
  ): ReturnType<typeof decodePostings> {
    return decodePostings(chunk.payload, chunk.encoding ?? "delta-varint");
  }

  private deleteByCursor(request: IDBRequest<IDBCursorWithValue | null>) {
    return new Promise<void>((resolve, reject) => {
      request.onerror = () =>
        reject(
          new IndexedDbStorageError(
            "Failed to delete IndexedDB records",
            request.error,
          ),
        );
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) {
          resolve();
          return;
        }
        const deletion = cursor.delete();
        deletion.onerror = () =>
          reject(
            new IndexedDbStorageError(
              "Failed to delete IndexedDB record",
              deletion.error,
            ),
          );
        deletion.onsuccess = () => cursor.continue();
      };
    });
  }

  private requestToPromise<T>(request: IDBRequest): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result as T);
      request.onerror = () =>
        reject(
          new IndexedDbStorageError("IndexedDB request failed", request.error),
        );
    });
  }
}

function getIndexedDbFactory(): IDBFactory {
  const factory = globalThis.indexedDB;
  if (!factory) {
    throw new IndexedDbStorageError(
      "IndexedDB is unavailable in the current environment",
    );
  }
  return factory;
}
