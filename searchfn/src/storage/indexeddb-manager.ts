import { DEFAULT_STORAGE_OPTIONS, STORE_NAMES, type StoreName } from "../config/defaults";
import type {
  DocumentVectorRecord,
  MetadataRecord,
  StoredDocumentRecord,
  StoredPostingChunk,
  StorageInitOptions,
  TermIdentifier,
  TransactionMode
} from "../types";
import { defaultLogger } from "../utils/logger";
import { getIndexedDB } from "../utils/env";
import { decodePostings } from "./chunk-serializer";
import { StorageError } from "./errors";

interface TermChunkDbRecord {
  field: string;
  term: string;
  chunk: number;
  payload: ArrayBuffer;
  docFrequency: number;
  inverseDocumentFrequency?: number;
  accessCount?: number;
  lastAccessedAt?: number;
  encoding: "delta-varint" | "json";
}

interface VectorDbRecord {
  field: string;
  docId: string;
  vector: ArrayBuffer;
  updatedAt: number;
}

interface DocumentDbRecord {
  docId: string;
  payload: Record<string, unknown>;
  updatedAt: number;
}

interface CacheStateDbRecord {
  key: string;
  payload: ArrayBuffer;
  updatedAt: number;
}

function normaliseDocId(id: string | number): string {
  return typeof id === "string" ? id : String(id);
}

export class IndexedDbManager {
  private options: Required<StorageInitOptions>;
  private db?: IDBDatabase;
  private readonly logger = defaultLogger;

  constructor(options: StorageInitOptions) {
    const defaults = DEFAULT_STORAGE_OPTIONS;
    this.options = {
      dbName: options.dbName,
      version: options.version ?? defaults.version,
      chunkSize: options.chunkSize ?? defaults.chunkSize!
    };
  }

  async open(): Promise<void> {
    if (this.db) return;

    const factory = getIndexedDB();
    const request = factory.open(this.options.dbName, this.options.version);

    request.onupgradeneeded = () => {
      const database = request.result;
      this.logger.info("Applying IndexedDB schema upgrade", {
        name: database.name,
        version: database.version
      });

      this.ensureObjectStore(database, STORE_NAMES.metadata, {
        keyPath: "key"
      });

      this.ensureObjectStore(database, STORE_NAMES.terms, {
        keyPath: ["field", "term", "chunk"],
        autoIncrement: false
      });

      this.ensureObjectStore(database, STORE_NAMES.vectors, {
        keyPath: ["field", "docId"],
        autoIncrement: false
      });

      this.ensureObjectStore(database, STORE_NAMES.documents, {
        keyPath: "docId",
        autoIncrement: false
      });

      this.ensureObjectStore(database, STORE_NAMES.cacheState, {
        keyPath: "key",
        autoIncrement: false
      });
    };

    this.db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Failed to open IndexedDB"));
    });
  }

  private ensureObjectStore(
    database: IDBDatabase,
    name: StoreName,
    options: IDBObjectStoreParameters
  ) {
    if (database.objectStoreNames.contains(name)) return;
    database.createObjectStore(name, options);
  }

  private assertDb(): IDBDatabase {
    if (!this.db) {
      throw new StorageError("IndexedDB database is not open");
    }
    return this.db;
  }

  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = undefined;
    }
    // Maintain async signature for API symmetry.
    await Promise.resolve();
  }

  async deleteDatabase(): Promise<void> {
    await this.close();
    const factory = getIndexedDB();
    await new Promise<void>((resolve, reject) => {
      const request = factory.deleteDatabase(this.options.dbName);
      request.onsuccess = () => resolve();
      request.onerror = () =>
        reject(new StorageError("Failed to delete IndexedDB", { cause: request.error ?? undefined }));
    });
  }

  private async withTransaction<T>(
    stores: StoreName[],
    mode: TransactionMode,
    fn: (tx: IDBTransaction) => Promise<T>
  ): Promise<T> {
    const database = this.assertDb();
    const tx = database.transaction(stores, mode);

    const completionPromise = new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () =>
        reject(new StorageError("IndexedDB transaction failed", { cause: tx.error ?? undefined }));
    });

    let result: T;
    try {
      result = await fn(tx);
    } catch (error) {
      try {
        tx.abort();
      } catch (abortError) {
        this.logger.warn("Failed to abort transaction", { abortError });
      }
      throw new StorageError("Transaction callback rejected", { cause: error });
    }

    await completionPromise;
    return result;
  }

  async putMetadata<TValue>(record: MetadataRecord<TValue>): Promise<void> {
    await this.withTransaction([STORE_NAMES.metadata], "readwrite", async (tx) => {
      const store = tx.objectStore(STORE_NAMES.metadata);
      await this.requestToPromise(store.put(record));
    });
  }

  async getMetadata<TValue>(key: string): Promise<TValue | undefined> {
    return this.withTransaction([STORE_NAMES.metadata], "readonly", async (tx) => {
      const store = tx.objectStore(STORE_NAMES.metadata);
      const record = (await this.requestToPromise<MetadataRecord<TValue> | undefined>(
        store.get(key)
      )) ?? undefined;
      return record?.value;
    });
  }

  async putTermChunk(chunk: StoredPostingChunk): Promise<void> {
    await this.withTransaction([STORE_NAMES.terms], "readwrite", async (tx) => {
      const store = tx.objectStore(STORE_NAMES.terms);
      const encoding = chunk.encoding ?? "delta-varint";
      const record: TermChunkDbRecord = {
        field: chunk.key.field,
        term: chunk.key.term,
        chunk: chunk.key.chunk,
        payload: chunk.payload,
        docFrequency: chunk.docFrequency,
        inverseDocumentFrequency: chunk.inverseDocumentFrequency,
        accessCount: chunk.accessCount,
        lastAccessedAt: chunk.lastAccessedAt,
        encoding
      };
      await this.requestToPromise(store.put(record));
    });
  }

  /**
   * Batch write multiple term chunks in a single transaction.
   * Much more efficient than individual putTermChunk calls for bulk operations.
   * 
   * @param chunks Array of term chunks to write
   */
  async putTermChunksBatch(chunks: StoredPostingChunk[]): Promise<void> {
    if (chunks.length === 0) return;
    
    await this.withTransaction([STORE_NAMES.terms], "readwrite", async (tx) => {
      const store = tx.objectStore(STORE_NAMES.terms);
      
      const putPromises = chunks.map(chunk => {
        const encoding = chunk.encoding ?? "delta-varint";
        const record: TermChunkDbRecord = {
          field: chunk.key.field,
          term: chunk.key.term,
          chunk: chunk.key.chunk,
          payload: chunk.payload,
          docFrequency: chunk.docFrequency,
          inverseDocumentFrequency: chunk.inverseDocumentFrequency,
          accessCount: chunk.accessCount,
          lastAccessedAt: chunk.lastAccessedAt,
          encoding
        };
        return this.requestToPromise(store.put(record));
      });
      
      // Execute all puts in parallel within the transaction
      await Promise.all(putPromises);
    });
  }

  async getTermChunk(key: TermIdentifier): Promise<StoredPostingChunk | undefined> {
    return this.withTransaction([STORE_NAMES.terms], "readonly", async (tx) => {
      const store = tx.objectStore(STORE_NAMES.terms);
      const dbRecord = (await this.requestToPromise<TermChunkDbRecord | undefined>(
        store.get([key.field, key.term, key.chunk])
      )) ?? undefined;
      if (!dbRecord) return undefined;
      return {
        key,
        payload: dbRecord.payload,
        docFrequency: dbRecord.docFrequency,
        inverseDocumentFrequency: dbRecord.inverseDocumentFrequency,
        accessCount: dbRecord.accessCount,
        lastAccessedAt: dbRecord.lastAccessedAt,
        encoding: dbRecord.encoding
      };
    });
  }

  async deleteTermChunksForTerm(field: string, term: string): Promise<void> {
    await this.withTransaction([STORE_NAMES.terms], "readwrite", async (tx) => {
      const store = tx.objectStore(STORE_NAMES.terms);
      // TODO: Future enhancement - iterate through all chunk indices for complete cleanup
      // Currently only chunk 0 is used, but multi-chunk support should delete all chunks
      await this.requestToPromise(store.delete([field, term, 0]));
    });
  }

  async putVector(record: DocumentVectorRecord): Promise<void> {
    await this.withTransaction([STORE_NAMES.vectors], "readwrite", async (tx) => {
      const store = tx.objectStore(STORE_NAMES.vectors);
      const dbRecord: VectorDbRecord = {
        field: record.field,
        docId: normaliseDocId(record.docId),
        vector: record.vector,
        updatedAt: record.updatedAt
      };
      await this.requestToPromise(store.put(dbRecord));
    });
  }

  async getVector(docId: string | number, field: string): Promise<DocumentVectorRecord | undefined> {
    return this.withTransaction([STORE_NAMES.vectors], "readonly", async (tx) => {
      const store = tx.objectStore(STORE_NAMES.vectors);
      const record = (await this.requestToPromise<VectorDbRecord | undefined>(
        store.get([field, normaliseDocId(docId)])
      )) ?? undefined;
      if (!record) return undefined;
      return {
        docId,
        field: record.field,
        vector: record.vector,
        updatedAt: record.updatedAt
      };
    });
  }

  async putDocument(record: StoredDocumentRecord): Promise<void> {
    await this.withTransaction([STORE_NAMES.documents], "readwrite", async (tx) => {
      const store = tx.objectStore(STORE_NAMES.documents);
      const dbRecord: DocumentDbRecord = {
        docId: normaliseDocId(record.docId),
        payload: record.payload,
        updatedAt: record.updatedAt
      };
      await this.requestToPromise(store.put(dbRecord));
    });
  }

  /**
   * Batch write multiple documents in a single transaction.
   * More efficient than calling putDocument() in a loop.
   */
  async putDocumentsBatch(records: StoredDocumentRecord[]): Promise<void> {
    if (records.length === 0) return;

    await this.withTransaction([STORE_NAMES.documents], "readwrite", async (tx) => {
      const store = tx.objectStore(STORE_NAMES.documents);
      
      const putPromises = records.map(record => {
        const dbRecord: DocumentDbRecord = {
          docId: normaliseDocId(record.docId),
          payload: record.payload,
          updatedAt: record.updatedAt
        };
        return this.requestToPromise(store.put(dbRecord));
      });
      
      // Execute all puts in parallel within the transaction
      await Promise.all(putPromises);
    });
  }

  async getDocument(docId: string | number): Promise<StoredDocumentRecord | undefined> {
    return this.withTransaction([STORE_NAMES.documents], "readonly", async (tx) => {
      const store = tx.objectStore(STORE_NAMES.documents);
      const record = (await this.requestToPromise<DocumentDbRecord | undefined>(
        store.get(normaliseDocId(docId))
      )) ?? undefined;
      if (!record) return undefined;
      return {
        docId,
        payload: record.payload,
        updatedAt: record.updatedAt
      };
    });
  }

  async deleteDocument(docId: string | number): Promise<void> {
    await this.withTransaction([STORE_NAMES.documents], "readwrite", async (tx) => {
      const store = tx.objectStore(STORE_NAMES.documents);
      await this.requestToPromise(store.delete(normaliseDocId(docId)));
    });
  }

  async clearStore(storeName: StoreName): Promise<void> {
    await this.withTransaction([storeName], "readwrite", async (tx) => {
      const store = tx.objectStore(storeName);
      await this.requestToPromise(store.clear());
    });
  }

  async putCacheState(key: string, payload: ArrayBuffer): Promise<void> {
    await this.withTransaction([STORE_NAMES.cacheState], "readwrite", async (tx) => {
      const store = tx.objectStore(STORE_NAMES.cacheState);
      const record: CacheStateDbRecord = {
        key,
        payload,
        updatedAt: Date.now()
      };
      await this.requestToPromise(store.put(record));
    });
  }

  async getCacheState(key: string): Promise<ArrayBuffer | undefined> {
    return this.withTransaction([STORE_NAMES.cacheState], "readonly", async (tx) => {
      const store = tx.objectStore(STORE_NAMES.cacheState);
      const record = (await this.requestToPromise<CacheStateDbRecord | undefined>(
        store.get(key)
      )) ?? undefined;
      return record?.payload;
    });
  }

  decodeChunkPayload(chunk: StoredPostingChunk): ReturnType<typeof decodePostings> {
    const encoding = chunk.encoding ?? "delta-varint";
    return decodePostings(chunk.payload, encoding);
  }

  private requestToPromise<T>(request: IDBRequest): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result as T);
      request.onerror = () =>
        reject(new StorageError("IndexedDB request failed", { cause: request.error ?? undefined }));
    });
  }
}
