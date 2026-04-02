import {
  PipelineEngine,
  DocumentStatsManager,
  IndexedDbManager,
  LruCache,
  fuzzyExpand,
  TsSearchCoreEngine,
} from "@searchfn/core";
import type {
  PipelineOptions,
  SearchCoreEngine,
  StoredPostingChunk,
  TermCacheValue,
  VectorCacheValue,
  QueryToken,
  TermPosting,
} from "@searchfn/core";
import type {
  SearchAdapter,
  SearchAdapterCapabilities,
  SearchDefaults,
  IndexParams,
  SearchParams,
  RemoveParams,
  SearchAllParams,
  SearchAllResult,
  InitializeParams,
} from "@searchfn/adapter-contracts";
import { SearchAdapterError, SEARCH_ADAPTER_DISPOSED } from "@searchfn/adapter-contracts";

const SEARCHFN_WASM_ABI_VERSION = 1;

export type SearchEngineMode = "ts" | "wasm" | "auto";

export type EngineSelectionReasonCode =
  | "explicit_ts"
  | "explicit_wasm"
  | "auto_wasm_ready"
  | "auto_loader_missing"
  | "auto_init_failed"
  | "auto_abi_mismatch"
  | "auto_self_test_failed"
  | "wasm_loader_missing"
  | "wasm_init_failed"
  | "wasm_abi_mismatch"
  | "wasm_self_test_failed";

export interface SearchCoreEngineFactoryOptions {
  storage: IndexedDbManager;
  termCache: LruCache<TermCacheValue>;
  vectorCache: LruCache<VectorCacheValue>;
  stats: DocumentStatsManager;
  pipeline: PipelineEngine;
}

export interface SearchFnWasmModule {
  abiVersion: number;
  createSearchCoreEngine: (options: SearchCoreEngineFactoryOptions) => Promise<SearchCoreEngine>;
}

export interface IndexedDbAdapterOptions {
  dbName?: string;
  pipeline?: PipelineOptions;
  cache?: { terms?: number; vectors?: number };
  defaults?: SearchDefaults;
  engine?: SearchEngineMode;
  wasmLoader?: () => Promise<SearchFnWasmModule>;
  onEngineSelected?: (info: {
    engine: "ts" | "wasm";
    code: EngineSelectionReasonCode;
    reason: string;
    resource?: string;
  }) => void;
  onWasmFallback?: (info: {
    code: EngineSelectionReasonCode;
    reason: string;
    resource?: string;
    error?: unknown;
  }) => void;
}

interface PostingInfo {
  frequency: number;
  metadata?: Record<string, unknown>;
}

interface DocTermEntry {
  field: string;
  term: string;
  isPrefix?: boolean;
}

interface ResourceEngine {
  storage: IndexedDbManager;
  pipeline: PipelineEngine;
  statsManager: DocumentStatsManager;
  termCache: LruCache<TermCacheValue>;
  vectorCache: LruCache<VectorCacheValue>;
  coreEngine: SearchCoreEngine;
  postings: Map<string, Map<string, Map<string, PostingInfo>>>;
  dirtyPostings: Map<string, Set<string>>;
  fieldNames: Set<string>;
  searchFields: string[] | null;
  docTerms: Map<string, DocTermEntry[]>;
  openPromise: Promise<void> | null;
  selectionPromise: Promise<void> | null;
  selectedEngineKind: "ts" | "wasm" | null;
  mutationQueue: Promise<void>;
  vocabulary: Set<string>;
  fuzzyCache: Map<string, string[]>;
}

const DEFAULT_TERM_CACHE_SIZE = 2048;
const DEFAULT_VECTOR_CACHE_SIZE = 512;

type DocId = string | number;

export class IndexedDbAdapter implements SearchAdapter {
  readonly name = "indexeddb";
  readonly capabilities: SearchAdapterCapabilities = {
    persistent: true,
    searchAll: true,
    fuzzy: true,
    fieldBoosts: true,
    prefix: true,
  };
  private static readonly MAX_INDEX_BATCH_SIZE = 10_000;

  private readonly options: IndexedDbAdapterOptions;
  private readonly defaults: SearchDefaults;
  private readonly engines = new Map<string, ResourceEngine>();
  private wasmModulePromise: Promise<SearchFnWasmModule> | null = null;
  private disposed = false;

  constructor(options?: IndexedDbAdapterOptions) {
    this.options = options ?? {};
    this.defaults = options?.defaults ?? {};
  }

  private assertNotDisposed(): void {
    if (this.disposed) {
      throw new SearchAdapterError(
        SEARCH_ADAPTER_DISPOSED,
        "Search adapter is disposed. Call initialize() before use."
      );
    }
  }

  private getOrCreateEngine(resource: string): ResourceEngine {
    let engine = this.engines.get(resource);
    if (!engine) {
      const dbName = `${this.options.dbName ?? "searchfn-adapter"}-${resource}`;
      const storage = new IndexedDbManager({ dbName, version: 1 });
      const pipeline = new PipelineEngine(this.options.pipeline);
      const termCache = new LruCache<TermCacheValue>({
        maxEntries: this.options.cache?.terms ?? DEFAULT_TERM_CACHE_SIZE,
      });
      const vectorCache = new LruCache<VectorCacheValue>({
        maxEntries: this.options.cache?.vectors ?? DEFAULT_VECTOR_CACHE_SIZE,
      });
      const statsManager = new DocumentStatsManager();
      const coreEngine = this.createTsCoreEngine({
        storage,
        termCache,
        vectorCache,
        statsManager,
        pipeline,
      });
      engine = {
        storage,
        pipeline,
        statsManager,
        termCache,
        vectorCache,
        coreEngine,
        postings: new Map(),
        dirtyPostings: new Map(),
        fieldNames: new Set(),
        searchFields: null,
        docTerms: new Map(),
        openPromise: null,
        selectionPromise: null,
        selectedEngineKind: null,
        mutationQueue: Promise.resolve(),
        vocabulary: new Set(),
        fuzzyCache: new Map(),
      };
      this.engines.set(resource, engine);
    }
    return engine;
  }

  private getFuzzyDistance(fuzzy?: number | boolean): number | undefined {
    if (fuzzy === true) return 2;
    if (typeof fuzzy === "number" && fuzzy > 0) return fuzzy;
    return undefined;
  }

  private assertNotAborted(signal?: AbortSignal, operation = "Operation"): void {
    if (signal?.aborted) {
      throw new SearchAdapterError("DFQL_ABORTED", `${operation} aborted`);
    }
  }

  private getCachedFuzzyExpansion(
    engine: ResourceEngine,
    term: string,
    distance: number,
  ): string[] {
    const cacheKey = `${term}:${distance}`;
    let expansion: string[] | undefined = engine.fuzzyCache.get(cacheKey);
    if (!expansion) {
      expansion = fuzzyExpand(term, distance, engine.vocabulary);
      engine.fuzzyCache.set(cacheKey, expansion);
      if (engine.fuzzyCache.size > 1000) {
        const firstKey = engine.fuzzyCache.keys().next().value;
        if (firstKey !== undefined) {
          engine.fuzzyCache.delete(firstKey);
        }
      }
    }
    return expansion ?? [];
  }

  private async ensureOpen(engine: ResourceEngine): Promise<void> {
    if (!engine.openPromise) {
      engine.openPromise = (async () => {
        await engine.storage.open();
        await this.loadStats(engine);
        await this.loadDocTerms(engine);
        await this.loadFieldNames(engine);
        await this.loadVocabulary(engine);
        await this.ensureCoreEngineSelected(engine);
      })();
    }
    await engine.openPromise;
  }

  private createTsCoreEngine(
    engine: Pick<ResourceEngine, "storage" | "termCache" | "vectorCache" | "statsManager" | "pipeline">,
  ): SearchCoreEngine {
    return new TsSearchCoreEngine({
      storage: engine.storage,
      termCache: engine.termCache,
      vectorCache: engine.vectorCache,
      stats: engine.statsManager,
      pipeline: engine.pipeline,
    });
  }

  private async ensureCoreEngineSelected(engine: ResourceEngine): Promise<void> {
    if (engine.selectedEngineKind !== null) {
      return;
    }
    if (!engine.selectionPromise) {
      engine.selectionPromise = this.selectCoreEngine(engine);
    }
    await engine.selectionPromise;
  }

  private async selectCoreEngine(engine: ResourceEngine): Promise<void> {
    const resource = this.findResourceName(engine);
    const configuredMode = this.options.engine ?? "ts";
    if (configuredMode === "ts") {
      engine.selectedEngineKind = "ts";
      this.options.onEngineSelected?.({
        engine: "ts",
        code: "explicit_ts",
        reason: "Using the built-in TypeScript search engine.",
        resource,
      });
      return;
    }

    if (!this.options.wasmLoader) {
      if (configuredMode === "wasm") {
        throw this.createEngineSelectionError(
          "wasm_loader_missing",
          "WASM engine was requested, but no wasmLoader was provided.",
        );
      }

      engine.selectedEngineKind = "ts";
      this.options.onEngineSelected?.({
        engine: "ts",
        code: "auto_loader_missing",
        reason: "No wasmLoader was configured; falling back to the TypeScript engine.",
        resource,
      });
      return;
    }

    try {
      const wasmModule = await this.loadWasmModule();
      if (wasmModule.abiVersion !== SEARCHFN_WASM_ABI_VERSION) {
        throw this.createEngineSelectionError(
          configuredMode === "wasm" ? "wasm_abi_mismatch" : "auto_abi_mismatch",
          `WASM ABI mismatch: expected ${SEARCHFN_WASM_ABI_VERSION}, received ${wasmModule.abiVersion}.`,
        );
      }

      const wasmEngine = await wasmModule.createSearchCoreEngine({
        storage: engine.storage,
        termCache: engine.termCache,
        vectorCache: engine.vectorCache,
        stats: engine.statsManager,
        pipeline: engine.pipeline,
      });
      if (wasmEngine.kind !== "wasm") {
        throw this.createEngineSelectionError(
          configuredMode === "wasm" ? "wasm_init_failed" : "auto_init_failed",
          "WASM loader did not return a WASM search engine implementation.",
        );
      }

      if (wasmEngine.selfTest) {
        try {
          await wasmEngine.selfTest();
        } catch (error) {
          throw this.createEngineSelectionError(
            configuredMode === "wasm" ? "wasm_self_test_failed" : "auto_self_test_failed",
            "WASM search engine self-test failed.",
            error,
          );
        }
      }

      engine.coreEngine = wasmEngine;
      engine.selectedEngineKind = "wasm";
      this.options.onEngineSelected?.({
        engine: "wasm",
        code: configuredMode === "wasm" ? "explicit_wasm" : "auto_wasm_ready",
        reason:
          configuredMode === "wasm"
            ? "Using the configured WASM search engine."
            : "WASM search engine initialized successfully.",
        resource,
      });
    } catch (error) {
      if (configuredMode === "wasm") {
        throw normalizeEngineSelectionError(error, "wasm_init_failed");
      }

      const selectionError = normalizeEngineSelectionError(error, "auto_init_failed");
      engine.selectedEngineKind = "ts";
      this.options.onWasmFallback?.({
        code: selectionError.code as EngineSelectionReasonCode,
        reason: selectionError.message,
        resource,
        error: getErrorCause(selectionError) ?? error,
      });
      this.options.onEngineSelected?.({
        engine: "ts",
        code: selectionError.code as EngineSelectionReasonCode,
        reason: `${selectionError.message} Falling back to the TypeScript engine.`,
        resource,
      });
    }
  }

  private findResourceName(targetEngine: ResourceEngine): string | undefined {
    for (const [resource, engine] of this.engines.entries()) {
      if (engine === targetEngine) {
        return resource;
      }
    }
    return undefined;
  }

  private createEngineSelectionError(
    code: EngineSelectionReasonCode,
    message: string,
    cause?: unknown,
  ): SearchAdapterError {
    const error = new SearchAdapterError(code, message) as SearchAdapterError & { cause?: unknown };
    error.cause = cause;
    return error;
  }

  private loadWasmModule(): Promise<SearchFnWasmModule> {
    if (!this.options.wasmLoader) {
      throw this.createEngineSelectionError(
        "wasm_loader_missing",
        "WASM engine was requested, but no wasmLoader was provided.",
      );
    }

    if (!this.wasmModulePromise) {
      this.wasmModulePromise = this.options.wasmLoader().catch((error) => {
        this.wasmModulePromise = null;
        throw error;
      });
    }

    return this.wasmModulePromise;
  }

  private async loadStats(engine: ResourceEngine): Promise<void> {
    const buffer = await engine.storage.getCacheState("document-stats");
    if (buffer) {
      const json = new TextDecoder().decode(buffer);
      const stats = JSON.parse(json) as Array<{ docId: string; length: number }>;
      engine.statsManager.load(stats);
    }
  }

  private async loadDocTerms(engine: ResourceEngine): Promise<void> {
    const buffer = await engine.storage.getCacheState("doc-terms");
    if (buffer) {
      const json = new TextDecoder().decode(buffer);
      const snapshot = JSON.parse(json) as Record<string, DocTermEntry[]>;
      for (const [docId, terms] of Object.entries(snapshot)) {
        engine.docTerms.set(docId, terms);
      }
    }
  }

  private async loadFieldNames(engine: ResourceEngine): Promise<void> {
    const buffer = await engine.storage.getCacheState("field-names");
    if (buffer) {
      const json = new TextDecoder().decode(buffer);
      const names = JSON.parse(json) as string[];
      for (const name of names) {
        engine.fieldNames.add(name);
      }
    }
  }

  private async loadVocabulary(engine: ResourceEngine): Promise<void> {
    const buffer = await engine.storage.getCacheState("vocabulary");
    if (!buffer) {
      return;
    }
    const json = new TextDecoder().decode(buffer);
    const terms = JSON.parse(json) as string[];
    engine.vocabulary.clear();
    for (const term of terms) {
      engine.vocabulary.add(term);
    }
    engine.fuzzyCache.clear();
  }

  private async persistStats(engine: ResourceEngine): Promise<void> {
    const encoded = new TextEncoder().encode(JSON.stringify(engine.statsManager.snapshot()));
    await engine.storage.putCacheState("document-stats", encoded.buffer);
  }

  private async persistDocTerms(engine: ResourceEngine): Promise<void> {
    const snapshot: Record<string, DocTermEntry[]> = {};
    for (const [docId, terms] of engine.docTerms.entries()) {
      snapshot[docId] = terms;
    }
    const encoded = new TextEncoder().encode(JSON.stringify(snapshot));
    await engine.storage.putCacheState("doc-terms", encoded.buffer);
  }

  private async persistFieldNames(engine: ResourceEngine): Promise<void> {
    const encoded = new TextEncoder().encode(JSON.stringify(Array.from(engine.fieldNames)));
    await engine.storage.putCacheState("field-names", encoded.buffer);
  }

  private async persistVocabulary(engine: ResourceEngine): Promise<void> {
    this.refreshVocabulary(engine);
    const encoded = new TextEncoder().encode(JSON.stringify(Array.from(engine.vocabulary)));
    await engine.storage.putCacheState("vocabulary", encoded.buffer);
  }

  private refreshVocabulary(engine: ResourceEngine): void {
    const previousVocabulary = new Set(engine.vocabulary);
    const nextVocabulary = new Set<string>();
    for (const terms of engine.docTerms.values()) {
      for (const entry of terms) {
        if (entry.isPrefix === false) {
          nextVocabulary.add(entry.term);
          continue;
        }
        // Legacy snapshots omitted `isPrefix`; only keep terms that were
        // already known as searchable vocabulary before this refresh.
        if (entry.isPrefix === undefined && previousVocabulary.has(entry.term)) {
          nextVocabulary.add(entry.term);
        }
      }
    }
    const changed =
      nextVocabulary.size !== previousVocabulary.size ||
      Array.from(nextVocabulary).some((term) => !previousVocabulary.has(term));
    engine.vocabulary.clear();
    for (const term of nextVocabulary) {
      engine.vocabulary.add(term);
    }
    if (changed || engine.fuzzyCache.size > 0) {
      engine.fuzzyCache.clear();
    }
  }

  private async withMutationLock<T>(
    engine: ResourceEngine,
    fn: () => Promise<T>,
  ): Promise<T> {
    const previous = engine.mutationQueue;
    let release!: () => void;
    engine.mutationQueue = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous.catch(() => undefined);
    try {
      return await fn();
    } finally {
      release();
    }
  }

  private async loadTermFromDb(
    engine: ResourceEngine,
    field: string,
    term: string
  ): Promise<void> {
    let fieldMap = engine.postings.get(field);
    if (!fieldMap) {
      fieldMap = new Map();
      engine.postings.set(field, fieldMap);
    }
    if (fieldMap.has(term)) return;
    const chunk = await engine.storage.getTermChunk({ field, term, chunk: 0 });
    const termMap = new Map<string, PostingInfo>();
    if (chunk) {
      const { postings } = engine.storage.decodeChunkPayload(chunk);
      for (const raw of postings) {
        const entry = parseRawPosting(raw);
        if (entry) {
          termMap.set(entry.docId, { frequency: entry.termFrequency, metadata: entry.metadata });
        }
      }
    }
    fieldMap.set(term, termMap);
  }

  private async removeDocById(engine: ResourceEngine, docId: string): Promise<void> {
    const terms = engine.docTerms.get(docId);
    if (!terms) return;
    for (const { field, term } of terms) {
      await this.loadTermFromDb(engine, field, term);
      const termMap = engine.postings.get(field)?.get(term);
      if (termMap) {
        termMap.delete(docId);
        let dirtyTerms = engine.dirtyPostings.get(field);
        if (!dirtyTerms) {
          dirtyTerms = new Set();
          engine.dirtyPostings.set(field, dirtyTerms);
        }
        dirtyTerms.add(term);
      }
    }
    engine.statsManager.removeDocument(docId);
    engine.docTerms.delete(docId);
  }

  private upsertPosting(
    engine: ResourceEngine,
    field: string,
    term: string,
    docId: string,
    frequency: number,
    metadata?: Record<string, unknown>
  ): void {
    let fieldMap = engine.postings.get(field);
    if (!fieldMap) {
      fieldMap = new Map();
      engine.postings.set(field, fieldMap);
    }
    let termMap = fieldMap.get(term);
    if (!termMap) {
      termMap = new Map();
      fieldMap.set(term, termMap);
    }
    termMap.set(docId, { frequency, metadata });
    let dirtyTerms = engine.dirtyPostings.get(field);
    if (!dirtyTerms) {
      dirtyTerms = new Set();
      engine.dirtyPostings.set(field, dirtyTerms);
    }
    dirtyTerms.add(term);
  }

  private updateTermCache(engine: ResourceEngine): void {
    for (const [field, dirtyTerms] of engine.dirtyPostings.entries()) {
      const fieldMap = engine.postings.get(field);
      if (!fieldMap) continue;
      for (const term of dirtyTerms) {
        const termMap = fieldMap.get(term);
        const cacheKey = `${field}:${term}`;
        if (!termMap || termMap.size === 0) {
          engine.termCache.delete(cacheKey);
          continue;
        }
        const postingsArray: TermPosting[] = Array.from(termMap.entries()).map(([did, info]) => ({
          docId: did,
          termFrequency: info.frequency,
          metadata: info.metadata,
        }));
        engine.termCache.set(cacheKey, {
          field,
          term,
          chunk: 0,
          postings: postingsArray,
          docFrequency: postingsArray.length,
          inverseDocumentFrequency: undefined,
        });
      }
    }
  }

  private async persistPostings(engine: ResourceEngine): Promise<void> {
    const chunksToWrite: StoredPostingChunk[] = [];
    const deletions: Array<{ field: string; term: string }> = [];

    for (const [field, dirtyTerms] of engine.dirtyPostings.entries()) {
      const fieldMap = engine.postings.get(field);
      if (!fieldMap) continue;
      for (const term of dirtyTerms) {
        const termMap = fieldMap.get(term);
        if (!termMap || termMap.size === 0) {
          deletions.push({ field, term });
          fieldMap.delete(term);
          continue;
        }
        const postingsArray: TermPosting[] = Array.from(termMap.entries()).map(([did, info]) => ({
          docId: did,
          termFrequency: info.frequency,
          metadata: info.metadata,
        }));
        const { payload, encoding, docFrequency, inverseDocumentFrequency } =
          engine.coreEngine.encodePostings({ postings: postingsArray });
        chunksToWrite.push({
          key: { field, term, chunk: 0 },
          payload,
          docFrequency,
          inverseDocumentFrequency,
          encoding,
        });
      }
    }

    if (deletions.length > 0) {
      await Promise.all(
        deletions.map(({ field, term }) => engine.storage.deleteTermChunksForTerm(field, term))
      );
    }
    if (chunksToWrite.length > 0) {
      await engine.storage.putTermChunksBatch(chunksToWrite);
    }
    engine.dirtyPostings.clear();
  }

  private async persistAll(engine: ResourceEngine): Promise<void> {
    await Promise.all([
      this.persistPostings(engine),
      this.persistStats(engine),
      this.persistDocTerms(engine),
      this.persistFieldNames(engine),
      this.persistVocabulary(engine),
    ]);
  }

  private buildQueryTokens(
    engine: ResourceEngine,
    query: string,
    fields: string[],
    fuzzyDistance?: number,
    fieldBoosts?: Record<string, number>,
    prefix?: boolean,
  ): QueryToken[] {
    const tokenMap = new Map<string, QueryToken>();
    for (const field of fields) {
      const rawTokens = engine.pipeline.run(field, query);
      // Always filter out isPrefix-flagged pipeline tokens (edge-ngram artefacts at index time)
      const filtered = rawTokens.filter(
        (t: { metadata?: Record<string, unknown>; value: string }) => !t.metadata?.isPrefix,
      );
      const fieldBoost = fieldBoosts?.[field] ?? 1.0;
      for (const token of filtered) {
        if (prefix) {
          // Prefix mode: vocabulary scan — find all indexed terms that start with this token value
          for (const vocabTerm of engine.vocabulary) {
            if (vocabTerm.startsWith(token.value)) {
              const key = `${field}:${vocabTerm}`;
              if (!tokenMap.has(key)) {
                const termBoost = vocabTerm === token.value ? 1.0 : 0.9;
                tokenMap.set(key, { field, term: vocabTerm, boost: termBoost * fieldBoost });
              }
            }
          }
        } else {
          const terms = fuzzyDistance
            ? this.getCachedFuzzyExpansion(engine, token.value, fuzzyDistance)
            : [token.value];
          for (const term of terms) {
            const key = `${field}:${term}`;
            if (!tokenMap.has(key)) {
              const termBoost = term === token.value ? 1.0 : 0.8;
              tokenMap.set(key, { field, term, boost: termBoost * fieldBoost });
            }
          }
        }
      }
    }
    return Array.from(tokenMap.values());
  }

  async index({ resource, documents, signal }: IndexParams): Promise<void> {
    this.assertNotDisposed();
    this.assertNotAborted(signal, "Index operation");
    const engine = this.getOrCreateEngine(resource);
    await this.withMutationLock(engine, async () => {
      await this.ensureOpen(engine);

      for (
        let offset = 0;
        offset < documents.length;
        offset += IndexedDbAdapter.MAX_INDEX_BATCH_SIZE
      ) {
        this.assertNotAborted(signal, "Index operation");
        const chunk = documents.slice(
          offset,
          offset + IndexedDbAdapter.MAX_INDEX_BATCH_SIZE,
        );
        for (const doc of chunk) {
          this.assertNotAborted(signal, "Index operation");
          const docId = String(doc.id);
          if (engine.docTerms.has(docId)) {
            await this.removeDocById(engine, docId);
          }

          const ingest = engine.coreEngine.ingest({ docId, fields: doc.fields });
          if (ingest.totalLength === 0) continue;

          engine.statsManager.addDocument(docId, ingest.totalLength);

          const docTermEntries: DocTermEntry[] = [];
          for (const [field, termFrequencies] of ingest.fieldFrequencies.entries()) {
            engine.fieldNames.add(field);
            const metadata =
              ingest.fieldMetadata.get(field) ?? new Map<string, Record<string, unknown>>();
            for (const [term, frequency] of termFrequencies.entries()) {
              const termMetadata = metadata.get(term);
              this.upsertPosting(engine, field, term, docId, frequency, termMetadata);
              const isPrefix =
                termMetadata !== undefined && termMetadata["isPrefix"] === true;
              if (!isPrefix) {
                engine.vocabulary.add(term);
                engine.fuzzyCache.clear();
              }
              docTermEntries.push({ field, term, isPrefix });
            }
          }

          engine.docTerms.set(docId, docTermEntries);
        }
      }

      this.updateTermCache(engine);
      await this.persistAll(engine);
    });
  }

  async search(params: SearchParams): Promise<DocId[]> {
    this.assertNotDisposed();
    this.assertNotAborted(params.signal, "Search operation");
    const engine = this.getOrCreateEngine(params.resource);
    await this.ensureOpen(engine);

    const fields = params.fields ?? engine.searchFields ?? Array.from(engine.fieldNames);
    if (fields.length === 0) return [];

    const effectivePrefix = params.prefix ?? this.defaults.prefix;
    const effectiveFuzzy = params.fuzzy ?? this.defaults.fuzzy;
    const effectiveFieldBoosts = params.fieldBoosts ?? this.defaults.fieldBoosts;
    const fuzzyDistance = this.getFuzzyDistance(effectiveFuzzy);
    const tokens = this.buildQueryTokens(
      engine,
      params.query,
      fields,
      fuzzyDistance,
      effectiveFieldBoosts,
      effectivePrefix,
    );
    if (tokens.length === 0) return [];

    const limit = Math.max(1, params.limit ?? 10);
    const result = await engine.coreEngine.executeQuery({ tokens, limit });
    return result.documents.map((d: { docId: DocId }) => d.docId);
  }

  async remove({ resource, ids, signal }: RemoveParams): Promise<void> {
    this.assertNotDisposed();
    this.assertNotAborted(signal, "Remove operation");
    const engine = this.getOrCreateEngine(resource);
    await this.withMutationLock(engine, async () => {
      await this.ensureOpen(engine);

      for (const id of ids) {
        this.assertNotAborted(signal, "Remove operation");
        await this.removeDocById(engine, String(id));
      }

      engine.termCache.clear();
      await this.persistAll(engine);
    });
  }

  async clear(resource: string, signal?: AbortSignal): Promise<void> {
    this.assertNotDisposed();
    this.assertNotAborted(signal, "Clear operation");
    const engine = this.getOrCreateEngine(resource);
    await this.withMutationLock(engine, async () => {
      await this.ensureOpen(engine);

      engine.postings.clear();
      engine.dirtyPostings.clear();
      engine.termCache.clear();
      engine.statsManager.load([]);
      engine.docTerms.clear();
      engine.fieldNames.clear();
      engine.vocabulary.clear();
      engine.fuzzyCache.clear();

      await engine.storage.clearStore("terms");
      await engine.storage.clearStore("cacheState");
    });
  }

  async searchAll(params: SearchAllParams): Promise<SearchAllResult[]> {
    this.assertNotDisposed();
    this.assertNotAborted(params.signal, "SearchAll operation");
    const resourceNames = params.resources ?? Array.from(this.engines.keys());
    const limit = params.limit ?? 10;
    const limitPerResource = params.limitPerResource ?? limit;

    const allResults: SearchAllResult[] = [];

    for (const resourceName of resourceNames) {
      this.assertNotAborted(params.signal, "SearchAll operation");
      const engine = params.resources ? this.getOrCreateEngine(resourceName) : this.engines.get(resourceName);
      if (!engine) continue;
      await this.ensureOpen(engine);

      const fields = params.fields ?? engine.searchFields ?? Array.from(engine.fieldNames);
      if (fields.length === 0) continue;

      const effectivePrefix = params.prefix ?? this.defaults.prefix;
      const effectiveFuzzy = params.fuzzy ?? this.defaults.fuzzy;
      const effectiveFieldBoosts = params.fieldBoosts ?? this.defaults.fieldBoosts;
      const fuzzyDistance = this.getFuzzyDistance(effectiveFuzzy);
      const tokens = this.buildQueryTokens(
        engine,
        params.query,
        fields,
        fuzzyDistance,
        effectiveFieldBoosts,
        effectivePrefix,
      );
      if (tokens.length === 0) continue;

      const result = await engine.coreEngine.executeQuery({ tokens, limit: limitPerResource });
      for (const doc of result.documents) {
        allResults.push({ resource: resourceName, id: doc.docId, score: doc.score });
      }
    }

    allResults.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.resource !== b.resource) return a.resource < b.resource ? -1 : 1;
      const aId = String(a.id);
      const bId = String(b.id);
      return aId < bId ? -1 : aId > bId ? 1 : 0;
    });

    return allResults.slice(0, limit);
  }

  async initialize({ resources }: InitializeParams): Promise<void> {
    if (this.disposed) {
      this.disposed = false;
    }
    const requested = new Set(resources.map((resource) => resource.name));
    for (const [name, engine] of this.engines.entries()) {
      if (requested.has(name)) {
        continue;
      }
      await engine.mutationQueue.catch(() => undefined);
      await engine.storage.close();
      this.engines.delete(name);
    }
    const engines = resources.map(({ name }) => this.getOrCreateEngine(name));
    for (const resource of resources) {
      const engine = this.engines.get(resource.name);
      if (engine) {
        engine.searchFields = [...resource.searchFields];
      }
    }
    await Promise.all(engines.map((engine) => this.ensureOpen(engine)));
  }

  async dispose(): Promise<void> {
    for (const engine of this.engines.values()) {
      await engine.storage.close();
    }
    this.engines.clear();
    this.disposed = true;
  }
}

function normalizeEngineSelectionError(
  error: unknown,
  defaultCode: EngineSelectionReasonCode,
): SearchAdapterError {
  if (error instanceof SearchAdapterError) {
    return error;
  }

  const normalized = new SearchAdapterError(
    defaultCode,
    error instanceof Error ? error.message : "Unknown search engine initialization error.",
  ) as SearchAdapterError & { cause?: unknown };
  normalized.cause = error;
  return normalized;
}

function getErrorCause(error: SearchAdapterError): unknown {
  return (error as SearchAdapterError & { cause?: unknown }).cause;
}

function parseRawPosting(
  raw: unknown
): { docId: string; termFrequency: number; metadata?: Record<string, unknown> } | null {
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const docIdValue = parsed["docId"];
      if (typeof docIdValue === "string" || typeof docIdValue === "number") {
        return {
          docId: String(docIdValue),
          termFrequency: Number(parsed["termFrequency"] ?? 1),
          metadata: parsed["metadata"] as Record<string, unknown> | undefined,
        };
      }
    } catch {
      return { docId: raw, termFrequency: 1 };
    }
  }
  if (typeof raw === "number") return { docId: String(raw), termFrequency: 1 };
  if (raw && typeof raw === "object") {
    const r = raw as Record<string, unknown>;
    const docIdValue = r["docId"];
    if (typeof docIdValue === "string" || typeof docIdValue === "number") {
      return {
        docId: String(docIdValue),
        termFrequency: Number(r["termFrequency"] ?? 1),
        metadata: r["metadata"] as Record<string, unknown> | undefined,
      };
    }
  }
  return null;
}
