import { encodePostings } from "./storage";
import { IndexedDbManager } from "./storage";
import type { StorageInitOptions, DocId, StoredPostingChunk } from "./types";
import {
  LruCache,
  type CacheOptions,
  type TermCacheValue,
  type VectorCacheValue,
  type TermPosting
} from "./cache";
import { PipelineEngine, type PipelineOptions, type Token } from "./pipeline";
import { Indexer, type IngestedDocument } from "./indexing/indexer";
import { QueryEngine, type QueryResult } from "./query/query-engine";
import type { QueryToken } from "./query";
import { DocumentStatsManager } from "./query/document-stats";
import type { SearchFnSnapshot, AddDocumentOptions, BulkAddOptions } from "./search-engine/types";
import {
  toWorkerSnapshotPayload,
  fromWorkerSnapshotPayload,
  type WorkerSnapshotPayload
} from "./search-engine/worker-snapshot";

export interface SearchFnCacheOptions {
  terms?: number;
  vectors?: number;
}

export interface SearchFnOptions {
  name: string;
  fields: string[];
  pipeline?: PipelineOptions;
  storage?: Partial<StorageInitOptions>;
  cache?: SearchFnCacheOptions;
}

export interface AddDocumentInput {
  id: DocId;
  fields: Record<string, string>;
  store?: Record<string, unknown>;
}

export type SearchMode = 'exact' | 'prefix' | 'fuzzy' | 'auto';

export interface SearchOptions {
  fields?: string[];
  limit?: number;
  fuzzy?: number | boolean;
  mode?: SearchMode;
  minScore?: number;
  applyQueryNGrams?: boolean;
}

export interface SearchDetailedOptions extends SearchOptions {
  includeStored?: boolean;
}

export interface SearchResultItem {
  docId: DocId;
  score: number;
  document?: Record<string, unknown>;
}

export type { 
  SearchFnSnapshot, 
  AddDocumentOptions, 
  BulkAddOptions,
  BulkAddOptionsWithRecovery,
  BulkIndexingCheckpoint
} from "./search-engine/types";
export type { WorkerSnapshotPayload } from "./search-engine/worker-snapshot";

const DEFAULT_TERM_CACHE: CacheOptions = { maxEntries: 2048 };
const DEFAULT_VECTOR_CACHE: CacheOptions = { maxEntries: 512 };

interface PostingInfo {
  frequency: number;
  metadata?: Record<string, unknown>;
}

export class SearchFn {
  private readonly name: string;
  private readonly fields: string[];
  private readonly storage: IndexedDbManager;
  private readonly termCache: LruCache<TermCacheValue>;
  private readonly vectorCache: LruCache<VectorCacheValue>;
  private readonly statsManager = new DocumentStatsManager();
  private readonly pipeline: PipelineEngine;
  private readonly indexer: Indexer;
  private readonly queryEngine: QueryEngine;
  // Nested Maps: Map<field, Map<term, Map<docId, PostingInfo>>>
  // Eliminates string key concatenation overhead
  private readonly postings = new Map<string, Map<string, Map<string, PostingInfo>>>();
  // Track dirty postings by {field, term} to avoid string concat
  private readonly dirtyPostings = new Map<string, Set<string>>();
  private readonly vocabulary = new Set<string>();
  private vocabularyDirty = false;
  private readonly pendingDocuments = new Map<string, Record<string, unknown>>();
  private openPromise: Promise<void> | null = null;
  private statsLoaded = false;
  private vocabLoaded = false;
  // Flush synchronization
  private isFlushInProgress = false;
  private pendingFlushPromise: Promise<void> | null = null;
  // Memory management
  private readonly MAX_PENDING_DOCUMENTS = 100000;
  private lastPendingWarningTime = 0;
  private readonly PENDING_WARNING_INTERVAL_MS = 5000;

  constructor(options: SearchFnOptions) {
    this.name = options.name;
    this.fields = options.fields;

    const storageOptions: StorageInitOptions = {
      dbName: options.storage?.dbName ?? `searchfn-${options.name}`,
      version: options.storage?.version ?? 1,
      chunkSize: options.storage?.chunkSize ?? 256
    };
    this.storage = new IndexedDbManager(storageOptions);

    const termCacheOptions = options.cache?.terms
      ? { maxEntries: options.cache.terms }
      : DEFAULT_TERM_CACHE;
    const vectorCacheOptions = options.cache?.vectors
      ? { maxEntries: options.cache.vectors }
      : DEFAULT_VECTOR_CACHE;
    this.termCache = new LruCache<TermCacheValue>(termCacheOptions);
    this.vectorCache = new LruCache<VectorCacheValue>(vectorCacheOptions);

    this.pipeline = new PipelineEngine(options.pipeline);
    this.indexer = new Indexer(this.pipeline);
    this.queryEngine = new QueryEngine({
      storage: this.storage,
      termCache: this.termCache,
      vectorCache: this.vectorCache,
      stats: this.statsManager
    });
  }

  async add(input: AddDocumentInput, options?: AddDocumentOptions): Promise<void> {
    await this.ensureOpen();

    const ingest = this.indexer.ingest({
      docId: input.id,
      fields: input.fields
    });

    if (ingest.totalLength === 0) {
      return;
    }

    this.statsManager.addDocument(input.id, ingest.totalLength);

    for (const [field, termFrequencies] of ingest.fieldFrequencies.entries()) {
      const metadata = ingest.fieldMetadata.get(field) ?? new Map<string, Record<string, unknown>>();
      for (const [term, frequency] of termFrequencies.entries()) {
        const termMetadata = metadata.get(term);
        this.upsertPosting(field, term, input.id, frequency, termMetadata);
        
        // Track vocabulary (only original terms, not n-grams)
        const isPrefix = termMetadata && typeof termMetadata.isPrefix === 'boolean' ? termMetadata.isPrefix : false;
        if (!isPrefix) {
          if (!this.vocabulary.has(term)) {
            this.vocabulary.add(term);
            this.vocabularyDirty = true;
          }
        }
      }
    }

    // Update cache for immediate searchability
    this.updateCaches();

    // Only persist to IndexedDB if requested (default: true for backward compatibility)
    const shouldPersist = options?.persist !== false;
    if (shouldPersist) {
      await this.persistPostings();
      await this.persistStats();
      await this.persistVocabulary();
    } else {
      // Check if auto-flush is needed to prevent unbounded memory growth
      if (this.dirtyPostings.size > this.MAX_PENDING_DOCUMENTS || 
          this.pendingDocuments.size > this.MAX_PENDING_DOCUMENTS) {
        console.warn(
          `[SearchFn] Auto-flushing: ${this.pendingDocuments.size} pending documents, ` +
          `${this.dirtyPostings.size} dirty terms. Call flush() explicitly to avoid this.`
        );
        await this.flush();
      }
    }

    if (input.store) {
      if (shouldPersist) {
        await this.storage.putDocument({
          docId: input.id,
          payload: input.store,
          updatedAt: Date.now()
        });
      } else {
        // Queue for batch persist
        this.pendingDocuments.set(this.docIdToKey(input.id), input.store);
        
        // Emit warning if documents have been pending for too long
        this.checkPendingDocumentsWarning();
      }
    }
  }
  
  private checkPendingDocumentsWarning(): void {
    const now = Date.now();
    if (this.pendingDocuments.size > 100 && 
        now - this.lastPendingWarningTime > this.PENDING_WARNING_INTERVAL_MS) {
      console.warn(
        `[SearchFn] ${this.pendingDocuments.size} documents pending flush. ` +
        `Call flush() to persist changes to IndexedDB.`
      );
      this.lastPendingWarningTime = now;
    }
  }

  /**
   * Explicitly persist all pending changes to IndexedDB.
   * Must be called when using { persist: false } in add().
   * 
   * Operations run in parallel for better performance since they
   * target different IndexedDB object stores.
   * 
   * Thread-safe: concurrent calls will wait for the in-progress flush.
   * 
   * @returns Promise that resolves when all changes are persisted
   */
  async flush(): Promise<void> {
    await this.ensureOpen();
    
    // If flush is already in progress, wait for it to complete
    if (this.isFlushInProgress && this.pendingFlushPromise) {
      return this.pendingFlushPromise;
    }
    
    if (this.dirtyPostings.size === 0 && 
        this.pendingDocuments.size === 0 && 
        !this.vocabularyDirty) {
      return; // Nothing to persist
    }
    
    // Mark flush as in progress and create promise
    this.isFlushInProgress = true;
    this.pendingFlushPromise = this.doFlush();
    
    try {
      await this.pendingFlushPromise;
    } finally {
      this.isFlushInProgress = false;
      this.pendingFlushPromise = null;
    }
  }
  
  private async doFlush(): Promise<void> {
    // Execute all flush operations in parallel (different object stores)
    const flushOperations: Promise<void>[] = [];
    
    // Terms store
    if (this.dirtyPostings.size > 0) {
      flushOperations.push(this.persistPostings());
    }
    
    // Documents store
    if (this.pendingDocuments.size > 0) {
      flushOperations.push(this.batchPersistDocuments());
    }
    
    // Cache state store (stats)
    flushOperations.push(this.persistStats());
    
    // Cache state store (vocabulary)
    if (this.vocabularyDirty) {
      flushOperations.push(
        this.persistVocabulary().then(() => {
          this.vocabularyDirty = false;
        })
      );
    }
    
    await Promise.all(flushOperations);
  }

  /**
   * Bulk add documents with automatic batching and single flush.
   * More efficient than calling add() in a loop.
   * 
   * Features:
   * - Batch ingestion with token caching (3-20x faster for repetitive data)
   * - Adaptive memory management (optional)
   * - Streaming progress reporting (optional)
   * - Single cache update per batch
   */
  async addBulk(
    documents: AddDocumentInput[],
    options?: BulkAddOptions
  ): Promise<void> {
    await this.ensureOpen();
    
    // Validate batchSize parameter
    let batchSize = options?.batchSize ?? 100;
    if (batchSize < 1) {
      throw new Error(`Invalid batchSize: ${batchSize}. Must be at least 1.`);
    }
    if (batchSize > 10000) {
      console.warn(`[SearchFn] batchSize ${batchSize} is very large, capping to 10000 for performance.`);
      batchSize = 10000;
    }
    
    let indexed = 0;
    let lastReportTime = 0;
    const REPORT_INTERVAL_MS = 100;
    const progressInterval = options?.progressInterval ?? 10;
    
    let i = 0;
    while (i < documents.length) {
      // Adaptive batch sizing
      const batchSize = this.calculateAdaptiveBatchSize(documents, i, options ?? {});
      const batch = documents.slice(i, Math.min(i + batchSize, documents.length));
      
      if (options?.streamingProgress) {
        // Streaming mode: Process documents with granular progress
        const ingestedDocs = this.indexer.ingestBatch(
          batch.map(doc => ({ docId: doc.id, fields: doc.fields }))
        );
        
        for (let j = 0; j < ingestedDocs.length; j++) {
          this.processIngestedDocument(ingestedDocs[j], batch[j].store);
          indexed++;
          
          // Report progress every N documents
          if (options?.onProgress && 
              (indexed % progressInterval === 0 || indexed === documents.length)) {
            options.onProgress(indexed, documents.length);
          }
        }
        
        // Still update cache per batch for performance
        this.updateCaches();
        
      } else {
        // Standard batch mode with token caching
        const ingestedDocs = this.indexer.ingestBatch(
          batch.map(doc => ({ docId: doc.id, fields: doc.fields }))
        );
        
        // Process all ingested documents
        for (let j = 0; j < ingestedDocs.length; j++) {
          this.processIngestedDocument(ingestedDocs[j], batch[j].store);
        }
        
        // Single cache update for entire batch
        this.updateCaches();
        
        indexed += batch.length;
        
        // Throttled progress reporting
        if (options?.onProgress) {
          const now = Date.now();
          if (now - lastReportTime >= REPORT_INTERVAL_MS || indexed === documents.length) {
            options.onProgress(indexed, documents.length);
            lastReportTime = now;
          }
        }
      }
      
      i += batch.length;
    }
    
    await this.flush();
    
    if (options?.onProgress) {
      options.onProgress(indexed, documents.length);
    }
  }

  /**
   * Bulk add documents with error recovery and checkpointing.
   * Continues processing even if individual documents fail.
   * Returns detailed checkpoint with all failures.
   * 
   * Features:
   * - All addBulk() optimizations (token caching, adaptive batching, etc.)
   * - Per-document error handling with detailed diagnostics
   * - Periodic checkpointing to persist progress
   * - Graceful failure recovery
   */
  async addBulkWithRecovery(
    documents: AddDocumentInput[],
    options?: import("./search-engine/types").BulkAddOptionsWithRecovery
  ): Promise<import("./search-engine/types").BulkIndexingCheckpoint> {
    await this.ensureOpen();
    
    const checkpoint: import("./search-engine/types").BulkIndexingCheckpoint = {
      processedCount: 0,
      lastSuccessfulBatch: -1,
      failedDocuments: [],
      timestamp: Date.now()
    };
    
    const checkpointInterval = options?.checkpointInterval ?? 1000;
    const continueOnError = options?.continueOnError ?? true;
    let indexed = 0;
    let lastReportTime = 0;
    const REPORT_INTERVAL_MS = 100;
    const progressInterval = options?.progressInterval ?? 10;
    
    let i = 0;
    let batchIndex = 0;
    
    while (i < documents.length) {
      const batchSize = this.calculateAdaptiveBatchSize(documents, i, options ?? {});
      const batch = documents.slice(i, Math.min(i + batchSize, documents.length));
      
      try {
        // Try batch ingestion with token caching
        const ingestedDocs = this.indexer.ingestBatch(
          batch.map(doc => ({ docId: doc.id, fields: doc.fields }))
        );
        
        // Process each document with individual error handling
        for (let j = 0; j < ingestedDocs.length; j++) {
          try {
            this.processIngestedDocument(ingestedDocs[j], batch[j].store);
            
            if (options?.streamingProgress && options?.onProgress) {
              indexed++;
              if (indexed % progressInterval === 0 || indexed === documents.length) {
                options.onProgress(indexed, documents.length);
              }
            }
          } catch (error) {
            checkpoint.failedDocuments.push({
              index: i + j,
              docId: batch[j].id.toString(),
              error: error instanceof Error ? error.message : String(error)
            });
            
            if (!continueOnError) {
              throw error;
            }
          }
        }
        
        this.updateCaches();
        checkpoint.processedCount += batch.length;
        checkpoint.lastSuccessfulBatch = batchIndex;
        
        if (!options?.streamingProgress) {
          indexed += batch.length;
          
          if (options?.onProgress) {
            const now = Date.now();
            if (now - lastReportTime >= REPORT_INTERVAL_MS || indexed === documents.length) {
              options.onProgress(indexed, documents.length);
              lastReportTime = now;
            }
          }
        }
        
        // Periodic checkpointing
        if (options?.enableCheckpointing && 
            checkpoint.processedCount % checkpointInterval === 0) {
          await this.flush();
          options.onCheckpoint?.(checkpoint);
        }
        
      } catch (error) {
        // Batch-level error
        for (let j = 0; j < batch.length; j++) {
          checkpoint.failedDocuments.push({
            index: i + j,
            docId: batch[j].id.toString(),
            error: error instanceof Error ? error.message : String(error)
          });
        }
        
        if (!continueOnError) {
          break;
        }
      }
      
      i += batch.length;
      batchIndex++;
    }
    
    await this.flush();
    checkpoint.timestamp = Date.now();
    
    return checkpoint;
  }

  /**
   * Add document without updating cache (for bulk operations).
   * Cache must be updated separately via updateCaches().
   */
  private addWithoutCacheUpdate(input: AddDocumentInput): void {
    const ingest = this.indexer.ingest({
      docId: input.id,
      fields: input.fields
    });

    this.processIngestedDocument(ingest, input.store);
  }

  /**
   * Process an already-ingested document (used by both single and batch operations).
   */
  private processIngestedDocument(ingest: IngestedDocument, store?: Record<string, unknown>): void {
    if (ingest.totalLength === 0) {
      return;
    }

    this.statsManager.addDocument(ingest.docId, ingest.totalLength);

    for (const [field, termFrequencies] of ingest.fieldFrequencies.entries()) {
      const metadata = ingest.fieldMetadata.get(field) ?? new Map<string, Record<string, unknown>>();
      for (const [term, frequency] of termFrequencies.entries()) {
        const termMetadata = metadata.get(term);
        this.upsertPosting(field, term, ingest.docId, frequency, termMetadata);
        
        // Track vocabulary (only original terms, not n-grams)
        const isPrefix = termMetadata && typeof termMetadata.isPrefix === 'boolean' 
          ? termMetadata.isPrefix 
          : false;
        if (!isPrefix) {
          if (!this.vocabulary.has(term)) {
            this.vocabulary.add(term);
            this.vocabularyDirty = true;
          }
        }
      }
    }

    if (store) {
      this.pendingDocuments.set(this.docIdToKey(ingest.docId), store);
    }
  }

  /**
   * Calculate adaptive batch size based on memory constraints.
   * Ensures batches don't exceed memory limits while maximizing throughput.
   */
  private calculateAdaptiveBatchSize(
    documents: AddDocumentInput[],
    startIndex: number,
    options: BulkAddOptions
  ): number {
    if (!options.adaptiveBatching) {
      return options.batchSize ?? 100;
    }
    
    const maxMemory = (options.maxMemoryMB ?? 50) * 1024 * 1024;
    const minBatch = options.minBatchSize ?? 10;
    const maxBatch = options.maxBatchSize ?? 1000;
    
    let batchSize = 0;
    let estimatedMemory = 0;
    
    for (let i = startIndex; i < documents.length && batchSize < maxBatch; i++) {
      const doc = documents[i];
      // Rough size estimate: JSON string length × 2 (UTF-16 encoding)
      const docSize = JSON.stringify(doc).length * 2;
      
      if (estimatedMemory + docSize > maxMemory && batchSize >= minBatch) {
        break; // Would exceed memory limit
      }
      
      estimatedMemory += docSize;
      batchSize++;
    }
    
    return Math.max(batchSize, minBatch);
  }

  async search(query: string, options?: SearchOptions): Promise<DocId[]> {
    const result = await this.executeSearch(query, options);
    if (!result) return [];
    return result.documents.map((doc) => doc.docId);
  }

  async searchDetailed(query: string, options?: SearchDetailedOptions): Promise<SearchResultItem[]> {
    const result = await this.executeSearch(query, options);
    if (!result) return [];

    const baseItems: SearchResultItem[] = result.documents.map((doc) => ({
      docId: doc.docId,
      score: doc.score
    }));

    if (!options?.includeStored) {
      return baseItems;
    }

    const records = await Promise.all(
      baseItems.map(async (item) => {
        const record = await this.storage.getDocument(item.docId);
        return record?.payload;
      })
    );

    return baseItems.map((item, index) => ({
      ...item,
      document: records[index]
    }));
  }

  async remove(docId: DocId): Promise<void> {
    await this.ensureOpen();
    const docKey = this.docIdToKey(docId);
    let mutated = false;

    // NOTE: This method only removes from in-memory postings. After a cold restart,
    // if remove() is called before any searches load the chunks, the document may
    // still appear in persisted chunks. For production use, consider implementing
    // a document→terms reverse index or calling add() with all fields to ensure
    // postings are loaded before calling remove().
    for (const [field, fieldMap] of this.postings.entries()) {
      for (const [term, termMap] of fieldMap.entries()) {
        if (termMap.delete(docKey)) {
          let dirtyTerms = this.dirtyPostings.get(field);
          if (!dirtyTerms) {
            dirtyTerms = new Set();
            this.dirtyPostings.set(field, dirtyTerms);
          }
          dirtyTerms.add(term);
          mutated = true;
        }
        if (termMap.size === 0) {
          fieldMap.delete(term);
        }
      }
    }

    if (mutated) {
      await this.persistPostings();
      this.termCache.clear();
    }

    this.statsManager.removeDocument(docId);
    await this.storage.deleteDocument(docId);
    // Clear cache to ensure removed document doesn't appear in subsequent cached queries
    this.termCache.clear();
  }

  async getDocument(docId: DocId): Promise<Record<string, unknown> | undefined> {
    await this.ensureOpen();
    const record = await this.storage.getDocument(docId);
    return record?.payload;
  }

  async exportSnapshot(): Promise<SearchFnSnapshot> {
    await this.ensureOpen();
    const postingsArray: Array<{field: string; term: string; documents: TermPosting[]}> = [];
    
    for (const [field, fieldMap] of this.postings.entries()) {
      for (const [term, termMap] of fieldMap.entries()) {
        const documents: TermPosting[] = Array.from(termMap.entries()).map(([docId, info]) => ({
          docId,
          termFrequency: info.frequency,
          metadata: info.metadata
        }));
        postingsArray.push({ field, term, documents });
      }
    }
    
    return {
      postings: postingsArray,
      stats: this.statsManager.snapshot()
    };
  }

  async importSnapshot(snapshot: SearchFnSnapshot): Promise<void> {
    await this.ensureOpen();
    this.postings.clear();
    this.dirtyPostings.clear();
    this.termCache.clear();

    for (const entry of snapshot.postings) {
      let fieldMap = this.postings.get(entry.field);
      if (!fieldMap) {
        fieldMap = new Map();
        this.postings.set(entry.field, fieldMap);
      }
      
      const termMap = new Map<string, PostingInfo>();
      for (const posting of entry.documents) {
        termMap.set(this.docIdToKey(posting.docId), {
          frequency: posting.termFrequency,
          metadata: posting.metadata
        });
      }
      fieldMap.set(entry.term, termMap);
      
      let dirtyTerms = this.dirtyPostings.get(entry.field);
      if (!dirtyTerms) {
        dirtyTerms = new Set();
        this.dirtyPostings.set(entry.field, dirtyTerms);
      }
      dirtyTerms.add(entry.term);
    }

    this.statsManager.load(snapshot.stats);
    await this.persistPostings();
  }

  async exportWorkerSnapshot(): Promise<WorkerSnapshotPayload> {
    const snapshot = await this.exportSnapshot();
    return toWorkerSnapshotPayload(snapshot);
  }

  async importWorkerSnapshot(payload: WorkerSnapshotPayload): Promise<void> {
    const snapshot = fromWorkerSnapshotPayload(payload);
    await this.importSnapshot(snapshot);
  }

  async clear(): Promise<void> {
    await this.ensureOpen();
    
    // Clear in-memory state
    this.postings.clear();
    this.dirtyPostings.clear();
    this.termCache.clear();
    this.vectorCache.clear();
    this.statsManager.load([]);
    
    // Clear all IndexedDB stores
    await this.storage.clearStore("terms");
    await this.storage.clearStore("vectors");
    await this.storage.clearStore("documents");
    await this.storage.clearStore("cacheState");
  }

  async destroy(): Promise<void> {
    await this.storage.deleteDatabase();
  }

  private async ensureOpen(): Promise<void> {
    if (!this.openPromise) {
      this.openPromise = (async () => {
        await this.storage.open();
        await this.loadStats();
        await this.loadVocabulary();
      })();
    }
    await this.openPromise;
  }

  private async executeSearch(query: string, options?: SearchOptions): Promise<QueryResult | null> {
    await this.ensureOpen();

    const fields = options?.fields ?? this.fields;
    
    // Determine search mode
    const mode = this.determineSearchMode(query, options);
    
    // Apply mode-specific options
    const effectiveOptions = { ...options };
    if (mode === 'fuzzy' && effectiveOptions.fuzzy === undefined) {
      effectiveOptions.fuzzy = true;
    }
    
    const applyNGrams = options?.applyQueryNGrams ?? false;
    const tokens = this.buildQueryTokens(query, fields, applyNGrams);
    if (tokens.length === 0) {
      return null;
    }

    // Validate and normalize limit parameter
    const limit = options?.limit !== undefined ? Math.max(1, options.limit) : undefined;

    const result = await this.queryEngine.execute(tokens, {
      limit
    });
    
    // Apply score threshold if specified
    if (options?.minScore !== undefined && options.minScore > 0) {
      const minScore = options.minScore;
      result.documents = result.documents.filter(doc => doc.score >= minScore);
    }
    
    return result;
  }
  
  private determineSearchMode(query: string, options?: SearchOptions): SearchMode {
    // If mode is explicitly set, use it
    if (options?.mode && options.mode !== 'auto') {
      return options.mode;
    }
    
    // Auto mode detection based on query length
    const queryLength = query.trim().length;
    
    if (queryLength <= 3) {
      // Short queries: use prefix search for autocomplete
      return 'prefix';
    } else if (queryLength >= 8) {
      // Long queries: use fuzzy search for typo tolerance
      return 'fuzzy';
    } else {
      // Medium queries: use exact match
      return 'exact';
    }
  }

  private upsertPosting(
    field: string,
    term: string,
    docId: DocId,
    frequency: number,
    metadata?: Record<string, unknown>
  ): void {
    // Get or create field map
    let fieldMap = this.postings.get(field);
    if (!fieldMap) {
      fieldMap = new Map();
      this.postings.set(field, fieldMap);
    }
    
    // Get or create term map
    let termMap = fieldMap.get(term);
    if (!termMap) {
      termMap = new Map();
      fieldMap.set(term, termMap);
    }
    
    // Set posting
    termMap.set(this.docIdToKey(docId), { frequency, metadata });
    
    // Track dirty
    let dirtyTerms = this.dirtyPostings.get(field);
    if (!dirtyTerms) {
      dirtyTerms = new Set();
      this.dirtyPostings.set(field, dirtyTerms);
    }
    dirtyTerms.add(term);
  }

  private updateCaches(): void {
    for (const [field, dirtyTerms] of this.dirtyPostings.entries()) {
      const fieldMap = this.postings.get(field);
      if (!fieldMap) continue;
      
      for (const term of dirtyTerms) {
        const termMap = fieldMap.get(term);
        
        if (!termMap || termMap.size === 0) {
          this.termCache.delete(this.buildCacheKey(field, term));
          continue;
        }

        const postingsArray: TermPosting[] = Array.from(termMap.entries()).map(([docId, info]) => ({
          docId,
          termFrequency: info.frequency,
          metadata: info.metadata
        }));

        this.termCache.set(this.buildCacheKey(field, term), {
          field,
          term,
          chunk: 0,
          postings: postingsArray,
          docFrequency: postingsArray.length,
          inverseDocumentFrequency: undefined
        });
      }
    }
  }

  private async persistPostings(): Promise<void> {
    const chunksToWrite: StoredPostingChunk[] = [];
    const deletions: Array<{ field: string; term: string }> = [];
    
    // First pass: collect all chunks and deletions
    for (const [field, dirtyTerms] of this.dirtyPostings.entries()) {
      const fieldMap = this.postings.get(field);
      if (!fieldMap) continue;
      
      for (const term of dirtyTerms) {
        const termMap = fieldMap.get(term);
        
        if (!termMap || termMap.size === 0) {
          deletions.push({ field, term });
          fieldMap.delete(term);
          continue;
        }

        const postingsArray: TermPosting[] = Array.from(termMap.entries()).map(([docId, info]) => ({
          docId,
          termFrequency: info.frequency,
          metadata: info.metadata
        }));
        const serialized = postingsArray.map((entry) => JSON.stringify(entry));
        const { buffer, encoding } = encodePostings(serialized);
        // buffer is already a Uint8Array, use its ArrayBuffer directly (optimization)
        const payload = buffer.buffer as ArrayBuffer;

        chunksToWrite.push({
          key: { field, term, chunk: 0 },
          payload,
          docFrequency: postingsArray.length,
          inverseDocumentFrequency: undefined,
          encoding
        });
      }
    }
    
    // Handle deletions in parallel (different terms, can be concurrent)
    if (deletions.length > 0) {
      await Promise.all(
        deletions.map(({ field, term }) => 
          this.storage.deleteTermChunksForTerm(field, term)
        )
      );
    }
    
    // Batch write all chunks in single transaction (MAJOR OPTIMIZATION)
    if (chunksToWrite.length > 0) {
      await this.storage.putTermChunksBatch(chunksToWrite);
    }
    
    this.dirtyPostings.clear();
  }

  private async batchPersistDocuments(): Promise<void> {
    if (this.pendingDocuments.size === 0) return;
    
    const now = Date.now();
    const documents = Array.from(this.pendingDocuments.entries()).map(([docId, payload]) => ({
      docId,
      payload,
      updatedAt: now
    }));
    
    // Use batched transaction for much better performance
    await this.storage.putDocumentsBatch(documents);
    this.pendingDocuments.clear();
  }

  private async persistStats(): Promise<void> {
    const stats = this.statsManager.snapshot();
    const encoded = new TextEncoder().encode(JSON.stringify(stats));
    await this.storage.putCacheState("document-stats", encoded.buffer);
  }

  private async loadStats(): Promise<void> {
    if (this.statsLoaded) return;
    
    const buffer = await this.storage.getCacheState("document-stats");
    if (buffer) {
      const json = new TextDecoder().decode(buffer);
      const stats = JSON.parse(json) as Array<{ docId: string; length: number }>;
      this.statsManager.load(stats);
    }
    this.statsLoaded = true;
  }

  private async persistVocabulary(): Promise<void> {
    const vocab = Array.from(this.vocabulary);
    const encoded = new TextEncoder().encode(JSON.stringify(vocab));
    await this.storage.putCacheState("vocabulary", encoded.buffer);
  }

  private async loadVocabulary(): Promise<void> {
    if (this.vocabLoaded) return;
    
    const buffer = await this.storage.getCacheState("vocabulary");
    if (buffer) {
      const json = new TextDecoder().decode(buffer);
      const vocab = JSON.parse(json) as string[];
      for (const term of vocab) {
        this.vocabulary.add(term);
      }
    }
    this.vocabLoaded = true;
  }

  private buildQueryTokens(query: string, fields: string[], applyNGrams = false): QueryToken[] {
    const tokenMap = new Map<string, Map<string, QueryToken>>();

    for (const field of fields) {
      const tokens = applyNGrams 
        ? this.pipeline.run(field, query)
        : this.pipelineWithoutNGrams(field, query);
      
      for (const token of tokens) {
        let fieldTokens = tokenMap.get(field);
        if (!fieldTokens) {
          fieldTokens = new Map();
          tokenMap.set(field, fieldTokens);
        }
        
        if (!fieldTokens.has(token.value)) {
          fieldTokens.set(token.value, {
            field,
            term: token.value,
            boost: 1
          });
        }
      }
    }

    const result: QueryToken[] = [];
    for (const fieldTokens of tokenMap.values()) {
      for (const queryToken of fieldTokens.values()) {
        result.push(queryToken);
      }
    }
    return result;
  }

  private pipelineWithoutNGrams(field: string, text: string): Token[] {
    // Use configured pipeline and filter n-gram tokens
    const allTokens = this.pipeline.run(field, text);
    return allTokens.filter(token => !token.metadata?.isPrefix);
  }

  private buildCacheKey(field: string, term: string): string {
    return `${field}:${term}`;
  }

  private docIdToKey(docId: DocId): string {
    return typeof docId === "string" ? docId : String(docId);
  }
}
