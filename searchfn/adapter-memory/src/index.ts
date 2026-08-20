import {
  PipelineEngine,
  Indexer,
  DocumentStatsManager,
  scorePostings,
  fuzzyExpand
} from "@searchfn/core";
import type { TermPosting, RetrievedPostingChunk } from "@searchfn/core";
import type {
  SearchAdapter,
  SearchAdapterCapabilities,
  SearchAdapterConfig,
  IndexParams,
  SearchParams,
  RemoveParams,
  SearchAllParams,
  SearchAllResult,
  InitializeParams
} from "@searchfn/adapter-contracts";
import { SearchAdapterError, SEARCH_ADAPTER_DISPOSED } from "@searchfn/adapter-contracts";

type DocId = string | number;

interface PostingInfo {
  docId: DocId;
  frequency: number;
  metadata?: Record<string, unknown>;
}

interface ResourceEngine {
  pipeline: PipelineEngine;
  indexer: Indexer;
  statsManager: DocumentStatsManager;
  postings: Map<string, Map<string, PostingInfo>>;
  docIds: Map<string, DocId>;
  docMetadata: Map<string, Record<string, string | number | boolean | null>>;
  fieldNames: Set<string>;
  vocabulary: Set<string>;
  vocabularyRefs: Map<string, number>;
  fuzzyCache: Map<string, string[]>;
}

export class MemoryAdapter implements SearchAdapter {
  readonly name = "memory";
  readonly capabilities: SearchAdapterCapabilities = {
    persistent: false,
    searchAll: true,
    fuzzy: true,
    fieldBoosts: true,
    prefix: true,
    metadataFilters: true,
  };
  private static readonly MAX_INDEX_BATCH_SIZE = 10_000;

  private readonly config: SearchAdapterConfig;
  private readonly resources = new Map<string, ResourceEngine>();
  private disposed = false;

  constructor(config?: SearchAdapterConfig) {
    this.config = config ?? {};
  }

  private assertNotDisposed(): void {
    if (this.disposed) {
      throw new SearchAdapterError(
        SEARCH_ADAPTER_DISPOSED,
        "Search adapter is disposed. Call initialize() before use."
      );
    }
  }

  private createEngine(): ResourceEngine {
    const pipeline = new PipelineEngine(this.config.pipeline);
    return {
      pipeline,
      indexer: new Indexer(pipeline),
      statsManager: new DocumentStatsManager(),
      postings: new Map(),
      docIds: new Map(),
      docMetadata: new Map(),
      fieldNames: new Set(),
      vocabulary: new Set(),
      vocabularyRefs: new Map(),
      fuzzyCache: new Map()
    };
  }

  private getOrCreateResource(resource: string): ResourceEngine {
    let engine = this.resources.get(resource);
    if (!engine) {
      engine = this.createEngine();
      this.resources.set(resource, engine);
    }
    return engine;
  }

  private addDocToEngine(
    engine: ResourceEngine,
    docId: DocId,
    fields: Record<string, string>,
    metadata?: Record<string, string | number | boolean | null>
  ): void {
    const ingest = engine.indexer.ingest({ docId, fields });
    if (ingest.totalLength === 0) return;

    const docKey = this.toKey(docId);
    engine.statsManager.addDocument(docKey, ingest.totalLength);
    engine.docIds.set(docKey, docId);
    if (metadata) {
      engine.docMetadata.set(docKey, metadata);
    }

    for (const [field, termFrequencies] of ingest.fieldFrequencies.entries()) {
      engine.fieldNames.add(field);
      const metadata =
        ingest.fieldMetadata.get(field) ??
        new Map<string, Record<string, unknown>>();

      for (const [term, frequency] of termFrequencies.entries()) {
        const termMetadata = metadata.get(term);
        this.upsertPosting(engine, field, term, docId, frequency, termMetadata);

        const isPrefix =
          termMetadata !== undefined && termMetadata["isPrefix"] === true;
        if (!isPrefix) {
          this.incrementVocabularyRef(engine, term);
        }
      }
    }
  }

  private removeDocFromEngine(engine: ResourceEngine, docId: DocId): void {
    const docKey = this.toKey(docId);
    for (const [key, docMap] of engine.postings.entries()) {
      const posting = docMap.get(docKey);
      docMap.delete(docKey);
      if (posting?.metadata?.["isPrefix"] !== true) {
        this.decrementVocabularyRef(engine, posting ? key.split("::")[1] ?? "" : "");
      }
      if (docMap.size === 0) {
        engine.postings.delete(key);
      }
    }
    engine.statsManager.removeDocument(docKey);
    engine.docIds.delete(docKey);
    engine.docMetadata.delete(docKey);
  }

  private incrementVocabularyRef(engine: ResourceEngine, term: string): void {
    const next = (engine.vocabularyRefs.get(term) ?? 0) + 1;
    engine.vocabularyRefs.set(term, next);
    if (next === 1) {
      engine.vocabulary.add(term);
      engine.fuzzyCache.clear();
    }
  }

  private decrementVocabularyRef(engine: ResourceEngine, term: string): void {
    if (!term) {
      return;
    }
    const current = engine.vocabularyRefs.get(term);
    if (current === undefined) {
      return;
    }
    if (current <= 1) {
      engine.vocabularyRefs.delete(term);
      if (engine.vocabulary.delete(term)) {
        engine.fuzzyCache.clear();
      }
      return;
    }
    engine.vocabularyRefs.set(term, current - 1);
  }

  private upsertPosting(
    engine: ResourceEngine,
    field: string,
    term: string,
    docId: DocId,
    frequency: number,
    metadata?: Record<string, unknown>
  ): void {
    const key = this.postingKey(field, term);
    const docKey = this.toKey(docId);
    const entry = engine.postings.get(key) ?? new Map<string, PostingInfo>();
    entry.set(docKey, { docId, frequency, metadata });
    engine.postings.set(key, entry);
  }

  private postingKey(field: string, term: string): string {
    return `${field}::${term}`;
  }

  private toKey(docId: DocId): string {
    return `${typeof docId === "string" ? "s" : "n"}:${String(docId)}`;
  }

  private getFuzzyDistance(fuzzy?: number | boolean): number | undefined {
    if (fuzzy === true) return 2;
    if (typeof fuzzy === "number" && fuzzy > 0) return Math.min(fuzzy, 3);
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
    distance: number
  ): string[] {
    const cacheKey = `${term}:${distance}`;
    let expansion = engine.fuzzyCache.get(cacheKey);
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
    return expansion;
  }

  private buildQueryTokens(
    engine: ResourceEngine,
    query: string,
    fields: string[],
    fuzzyDistance?: number,
    prefix?: boolean
  ): Array<{ field: string; term: string; boost: number }> {
    const tokenMap = new Map<
      string,
      { field: string; term: string; boost: number }
    >();

    for (const field of fields) {
      const rawTokens = engine.pipeline.run(field, query);
      // Always filter out isPrefix-flagged pipeline tokens (edge-ngram artefacts at index time)
      const tokens = rawTokens.filter(
        (t) => t.metadata === undefined || t.metadata["isPrefix"] !== true
      );

      for (const token of tokens) {
        if (prefix) {
          // Prefix mode: vocabulary scan — find all indexed terms that start with this token value
          for (const vocabTerm of engine.vocabulary) {
            if (vocabTerm.startsWith(token.value)) {
              const key = this.postingKey(field, vocabTerm);
              if (!tokenMap.has(key)) {
                const boost = vocabTerm === token.value ? 1.0 : 0.9;
                tokenMap.set(key, { field, term: vocabTerm, boost });
              }
            }
          }
        } else {
          const terms = fuzzyDistance
            ? this.getCachedFuzzyExpansion(engine, token.value, fuzzyDistance)
            : [token.value];

          for (const term of terms) {
            const key = this.postingKey(field, term);
            if (!tokenMap.has(key)) {
              const boost = term === token.value ? 1.0 : 0.8;
              tokenMap.set(key, { field, term, boost });
            }
          }
        }
      }
    }

    return Array.from(tokenMap.values());
  }

  private executeDetailedSearch(
    engine: ResourceEngine,
    params: SearchParams
  ): Array<{ docId: DocId; score: number }> {
    const fields = params.fields ?? Array.from(engine.fieldNames);
    if (fields.length === 0) return [];

    const fuzzyDistance = this.getFuzzyDistance(params.fuzzy);
    const tokens = this.buildQueryTokens(
      engine,
      params.query,
      fields,
      fuzzyDistance,
      params.prefix
    );
    if (tokens.length === 0) return [];

    const postings: RetrievedPostingChunk[] = [];

    for (const token of tokens) {
      const key = this.postingKey(token.field, token.term);
      const docMap = engine.postings.get(key);
      if (!docMap) continue;

      const fieldBoost = params.fieldBoosts?.[token.field] ?? 1.0;

      const postingsArray: TermPosting[] = Array.from(docMap.entries()).map(
        ([docId, info]) => ({
          docId,
          termFrequency: info.frequency * token.boost * fieldBoost,
          metadata: info.metadata
        })
      );

      postings.push({
        field: token.field,
        term: token.term,
        postings: postingsArray,
        docFrequency: postingsArray.length,
        inverseDocumentFrequency: undefined
      });
    }

    if (postings.length === 0) return [];

    const averageDocLength = Math.max(
      engine.statsManager.getAverageLength(),
      1
    );
    const docLengths = new Map<DocId, number>();

    for (const chunk of postings) {
      for (const posting of chunk.postings) {
        const docId = posting.docId;
        if (!docLengths.has(docId)) {
          docLengths.set(
            docId,
            engine.statsManager.getLength(docId) ?? averageDocLength
          );
        }
      }
    }

    const scored = scorePostings(postings, docLengths, averageDocLength, {
      k1: 1.2,
      b: 0.75,
      d: 0.5
    });

    const limit = Math.max(1, params.limit ?? 10);
    return scored
      .filter((entry) => this.matchesMetadataFilters(engine, String(entry.docId), params))
      .slice(0, limit)
      .map((entry) => ({
        docId: engine.docIds.get(String(entry.docId)) ?? entry.docId,
        score: entry.score,
      }));
  }

  private matchesMetadataFilters(
    engine: ResourceEngine,
    docKey: string,
    params: SearchParams | SearchAllParams
  ): boolean {
    const metadata = engine.docMetadata.get(docKey);
    if (params.namespaceFilter?.length) {
      if (!metadata || !params.namespaceFilter.includes(String(metadata.__ns))) return false;
    }
    if (params.regionFilter?.length) {
      if (!metadata || !params.regionFilter.includes(String(metadata.__region))) return false;
    }
    return true;
  }

  index({ resource, documents, signal }: IndexParams): Promise<void> {
    try {
      this.assertNotDisposed();
      this.assertNotAborted(signal, "Index operation");
      const engine = this.getOrCreateResource(resource);
      for (
        let offset = 0;
        offset < documents.length;
        offset += MemoryAdapter.MAX_INDEX_BATCH_SIZE
      ) {
        this.assertNotAborted(signal, "Index operation");
        const chunk = documents.slice(
          offset,
          offset + MemoryAdapter.MAX_INDEX_BATCH_SIZE,
        );
        for (const doc of chunk) {
          this.assertNotAborted(signal, "Index operation");
          this.removeDocFromEngine(engine, doc.id);
          this.addDocToEngine(engine, doc.id, doc.fields, doc.metadata);
        }
      }
      return Promise.resolve();
    } catch (e) {
      return Promise.reject(e instanceof Error ? e : new Error(String(e)));
    }
  }

  search(params: SearchParams): Promise<DocId[]> {
    try {
      this.assertNotDisposed();
      this.assertNotAborted(params.signal, "Search operation");
      const engine = this.resources.get(params.resource);
      if (!engine) return Promise.resolve([]);
      const resolvedParams: SearchParams = {
        ...params,
        prefix: params.prefix ?? this.config.defaults?.prefix,
        fuzzy: params.fuzzy ?? this.config.defaults?.fuzzy,
        fieldBoosts: params.fieldBoosts ?? this.config.defaults?.fieldBoosts,
      };
      return Promise.resolve(this.executeDetailedSearch(engine, resolvedParams).map((r) => r.docId));
    } catch (e) {
      return Promise.reject(e instanceof Error ? e : new Error(String(e)));
    }
  }

  remove({ resource, ids, signal }: RemoveParams): Promise<void> {
    try {
      this.assertNotDisposed();
      this.assertNotAborted(signal, "Remove operation");
      const engine = this.resources.get(resource);
      if (!engine) return Promise.resolve();
      for (const id of ids) {
        this.assertNotAborted(signal, "Remove operation");
        this.removeDocFromEngine(engine, id);
      }
      return Promise.resolve();
    } catch (e) {
      return Promise.reject(e instanceof Error ? e : new Error(String(e)));
    }
  }

  clear(resource: string, signal?: AbortSignal): Promise<void> {
    try {
      this.assertNotDisposed();
      this.assertNotAborted(signal, "Clear operation");
      this.resources.delete(resource);
      return Promise.resolve();
    } catch (e) {
      return Promise.reject(e instanceof Error ? e : new Error(String(e)));
    }
  }

  searchAll(params: SearchAllParams): Promise<SearchAllResult[]> {
    try {
      this.assertNotDisposed();
      this.assertNotAborted(params.signal, "SearchAll operation");
      const resourceNames =
        params.resources ?? Array.from(this.resources.keys());
      const limit = params.limit ?? 10;
      const limitPerResource = params.limitPerResource ?? limit;

      const allResults: SearchAllResult[] = [];

      for (const resourceName of resourceNames) {
        this.assertNotAborted(params.signal, "SearchAll operation");
        const engine = this.resources.get(resourceName);
        if (!engine) continue;

        const detailed = this.executeDetailedSearch(engine, {
          resource: resourceName,
          query: params.query,
          fields: params.fields,
          limit: limitPerResource,
          prefix: params.prefix ?? this.config.defaults?.prefix,
          fuzzy: params.fuzzy ?? this.config.defaults?.fuzzy,
          fieldBoosts: params.fieldBoosts ?? this.config.defaults?.fieldBoosts,
          namespaceFilter: params.namespaceFilter,
          regionFilter: params.regionFilter,
        });

        for (const item of detailed) {
          allResults.push({
            resource: resourceName,
            id: item.docId,
            score: item.score
          });
        }
      }

      allResults.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (a.resource !== b.resource) return a.resource < b.resource ? -1 : 1;
        const aId = String(a.id);
        const bId = String(b.id);
        return aId < bId ? -1 : aId > bId ? 1 : 0;
      });

      return Promise.resolve(allResults.slice(0, limit));
    } catch (e) {
      return Promise.reject(e instanceof Error ? e : new Error(String(e)));
    }
  }

  initialize({ resources }: InitializeParams): Promise<void> {
    try {
      if (this.disposed) {
        this.disposed = false;
      }
      for (const { name } of resources) {
        this.getOrCreateResource(name);
      }
      return Promise.resolve();
    } catch (e) {
      return Promise.reject(e instanceof Error ? e : new Error(String(e)));
    }
  }

  dispose(): Promise<void> {
    this.resources.clear();
    this.disposed = true;
    return Promise.resolve();
  }
}
