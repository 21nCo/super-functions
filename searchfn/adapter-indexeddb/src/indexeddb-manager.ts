import {
  decodePostings,
  type PostingChunkEncoding,
  type QueryStorage,
  type StoredPostingChunk,
  type TermIdentifier,
} from "@searchfn/core";

const DATABASE_VERSION = 1;
const RESOURCE_INDEX = "resource";
const RESOURCE_TERM_INDEX = "resourceFieldTerm";

const STORE_NAMES = {
  terms: "terms",
  cacheState: "cacheState",
} as const;

type StoreName = (typeof STORE_NAMES)[keyof typeof STORE_NAMES];

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
  getCacheState(key: string): Promise<ArrayBuffer | undefined>;
  putCacheState(key: string, payload: ArrayBuffer): Promise<void>;
  putTermChunksBatch(chunks: StoredPostingChunk[]): Promise<void>;
  deleteTermChunksForTerm(field: string, term: string): Promise<void>;
  clearStore(storeName: StoreName): Promise<void>;
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

  private openDatabase(): Promise<IDBDatabase> {
    const factory = getIndexedDbFactory();
    const request = factory.open(this.dbName, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      const terms = database.createObjectStore(STORE_NAMES.terms, {
        keyPath: ["resource", "field", "term", "chunk"],
      });
      terms.createIndex(RESOURCE_INDEX, "resource");
      terms.createIndex(RESOURCE_TERM_INDEX, ["resource", "field", "term"]);
      const cacheState = database.createObjectStore(STORE_NAMES.cacheState, {
        keyPath: ["resource", "key"],
      });
      cacheState.createIndex(RESOURCE_INDEX, "resource");
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
    storeName: StoreName,
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
