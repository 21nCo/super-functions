import type { DocId } from "./types";
import { PipelineEngine, type PipelineOptions, type Token } from "./pipeline";
import { Indexer } from "./indexing/indexer";
import { DocumentStatsManager } from "./query/document-stats";
import type { TermPosting } from "./cache";
import { scorePostings } from "./query/scoring";
import type { RetrievedPostingChunk } from "./query/types";
import { fuzzyExpand } from "./utils/levenshtein";

export interface InMemorySearchFnOptions {
  fields: string[];
  pipeline?: PipelineOptions;
}

export interface InMemoryAddDocumentInput {
  id: DocId;
  fields: Record<string, string>;
  store?: Record<string, unknown>;
}

export interface InMemorySearchOptions {
  fields?: string[];
  limit?: number;
  fuzzy?: number | boolean;
  minScore?: number;
  applyQueryNGrams?: boolean;
}

export interface InMemorySearchDetailedOptions extends InMemorySearchOptions {
  includeStored?: boolean;
}

export interface InMemorySearchResultItem {
  docId: DocId;
  score: number;
  document?: Record<string, unknown>;
}

export interface InMemorySearchFnSnapshot {
  postings: Array<{
    field: string;
    term: string;
    documents: TermPosting[];
  }>;
  stats: Array<{ docId: string; length: number }>;
  documents: Array<{ docId: string; payload: Record<string, unknown> }>;
  vocabulary: string[];
}

interface PostingInfo {
  frequency: number;
  metadata?: Record<string, unknown>;
}

export class InMemorySearchFn {
  private readonly fields: string[];
  private readonly pipeline: PipelineEngine;
  private readonly indexer: Indexer;
  private readonly statsManager = new DocumentStatsManager();
  private readonly postings = new Map<string, Map<string, PostingInfo>>();
  private readonly documents = new Map<string, Record<string, unknown>>();
  private readonly vocabulary = new Set<string>();
  private readonly fuzzyCache = new Map<string, string[]>();

  constructor(options: InMemorySearchFnOptions) {
    this.fields = options.fields;
    this.pipeline = new PipelineEngine(options.pipeline);
    this.indexer = new Indexer(this.pipeline);
  }

  add(input: InMemoryAddDocumentInput): void {
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
          this.vocabulary.add(term);
          // Invalidate fuzzy cache when vocabulary changes
          this.fuzzyCache.clear();
        }
      }
    }

    if (input.store) {
      this.documents.set(this.docIdToKey(input.id), input.store);
    }
  }

  search(query: string, options?: InMemorySearchOptions): DocId[] {
    const result = this.executeSearch(query, options);
    if (!result) return [];
    return result.map((doc) => doc.docId);
  }

  searchDetailed(
    query: string,
    options?: InMemorySearchDetailedOptions
  ): InMemorySearchResultItem[] {
    const result = this.executeSearch(query, options);
    if (!result) return [];

    const baseItems: InMemorySearchResultItem[] = result.map((doc) => ({
      docId: doc.docId,
      score: doc.score
    }));

    if (!options?.includeStored) {
      return baseItems;
    }

    return baseItems.map((item) => ({
      ...item,
      document: this.documents.get(this.docIdToKey(item.docId))
    }));
  }

  remove(docId: DocId): void {
    const docKey = this.docIdToKey(docId);

    for (const [key, docMap] of this.postings.entries()) {
      docMap.delete(docKey);
      if (docMap.size === 0) {
        this.postings.delete(key);
      }
    }

    this.statsManager.removeDocument(docId);
    this.documents.delete(docKey);
  }

  getDocument(docId: DocId): Record<string, unknown> | undefined {
    return this.documents.get(this.docIdToKey(docId));
  }

  clear(): void {
    this.postings.clear();
    this.documents.clear();
    this.statsManager.load([]);
    this.vocabulary.clear();
    this.fuzzyCache.clear();
  }

  exportSnapshot(): InMemorySearchFnSnapshot {
    const postingsArray: Array<{
      field: string;
      term: string;
      documents: TermPosting[];
    }> = [];

    for (const [key, docMap] of this.postings.entries()) {
      const [field, term] = key.split("::");
      const documents: TermPosting[] = Array.from(docMap.entries()).map(([docId, info]) => ({
        docId,
        termFrequency: info.frequency,
        metadata: info.metadata
      }));
      postingsArray.push({ field, term, documents });
    }

    return {
      postings: postingsArray,
      stats: this.statsManager.snapshot(),
      documents: Array.from(this.documents.entries()).map(([docId, payload]) => ({
        docId,
        payload
      })),
      vocabulary: Array.from(this.vocabulary)
    };
  }

  importSnapshot(snapshot: InMemorySearchFnSnapshot): void {
    this.fuzzyCache.clear(); // Clear stale fuzzy expansions
    this.postings.clear();
    this.documents.clear();
    this.vocabulary.clear();

    for (const entry of snapshot.postings) {
      const key = this.getPostingKey(entry.field, entry.term);
      const docMap = new Map<string, PostingInfo>();
      for (const posting of entry.documents) {
        docMap.set(this.docIdToKey(posting.docId), {
          frequency: posting.termFrequency,
          metadata: posting.metadata
        });
      }
      this.postings.set(key, docMap);
    }

    this.statsManager.load(snapshot.stats);

    for (const entry of snapshot.documents) {
      this.documents.set(entry.docId, entry.payload);
    }
    
    // Restore vocabulary
    if (snapshot.vocabulary) {
      for (const term of snapshot.vocabulary) {
        this.vocabulary.add(term);
      }
    }
  }

  private executeSearch(
    query: string,
    options?: InMemorySearchOptions
  ): Array<{ docId: DocId; score: number }> | null {
    const fields = options?.fields ?? this.fields;
    const fuzzyDistance = this.getFuzzyDistance(options?.fuzzy);
    const applyNGrams = options?.applyQueryNGrams ?? false;
    const tokens = this.buildQueryTokens(query, fields, fuzzyDistance, applyNGrams);
    if (tokens.length === 0) {
      return null;
    }

    const postings: RetrievedPostingChunk[] = [];

    for (const token of tokens) {
      const key = this.getPostingKey(token.field, token.term);
      const docMap = this.postings.get(key);
      if (!docMap) continue;

      const postingsArray: TermPosting[] = Array.from(docMap.entries()).map(
        ([docId, info]) => ({
          docId,
          termFrequency: info.frequency * (token.boost || 1.0), // Apply fuzzy boost
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

    const docLengths = new Map<DocId, number>();
    const averageDocLengthFromStats = this.statsManager.getAverageLength();
    const averageDocLength = averageDocLengthFromStats > 0 ? averageDocLengthFromStats : 1;

    for (const chunk of postings) {
      for (const posting of chunk.postings) {
        const docId = posting.docId;
        if (docLengths.has(docId)) continue;
        const length = this.statsManager.getLength(docId) ?? averageDocLength;
        docLengths.set(docId, length);
      }
    }

    let scored = scorePostings(postings, docLengths, averageDocLength, {
      k1: 1.2,
      b: 0.75,
      d: 0.5
    });

    // Apply score threshold if specified
    if (options?.minScore !== undefined && options.minScore > 0) {
      const minScore = options.minScore;
      scored = scored.filter(doc => doc.score >= minScore);
    }

    // Validate and normalize limit parameter
    const limit = Math.max(1, options?.limit ?? 10);
    return scored.slice(0, limit);
  }

  private buildQueryTokens(
    query: string,
    fields: string[],
    fuzzyDistance?: number,
    applyNGrams = false
  ): Array<{ field: string; term: string; boost: number }> {
    const tokenMap = new Map<string, { field: string; term: string; boost: number }>();

    for (const field of fields) {
      const tokens = applyNGrams
        ? this.pipeline.run(field, query)
        : this.pipelineWithoutNGrams(field, query);
      
      for (const token of tokens) {
        // Expand with fuzzy matching if enabled (with caching)
        const terms = fuzzyDistance
          ? this.getCachedFuzzyExpansion(token.value, fuzzyDistance)
          : [token.value];

        for (const term of terms) {
          const key = this.getPostingKey(field, term);
          if (!tokenMap.has(key)) {
            // Apply penalty for fuzzy matches (exact match = 1.0, fuzzy = 0.8)
            const boost = term === token.value ? 1 : 0.8;
            tokenMap.set(key, {
              field,
              term,
              boost
            });
          }
        }
      }
    }

    return Array.from(tokenMap.values());
  }

  private pipelineWithoutNGrams(field: string, text: string): Token[] {
    // Use configured pipeline and filter n-gram tokens
    const allTokens = this.pipeline.run(field, text);
    return allTokens.filter(token => !token.metadata?.isPrefix);
  }

  private getFuzzyDistance(fuzzy?: number | boolean): number | undefined {
    if (fuzzy === true) return 2;
    if (typeof fuzzy === "number" && fuzzy > 0) return fuzzy;
    return undefined;
  }

  private getCachedFuzzyExpansion(term: string, distance: number): string[] {
    const cacheKey = `${term}:${distance}`;
    let expansion = this.fuzzyCache.get(cacheKey);
    
    if (!expansion) {
      expansion = fuzzyExpand(term, distance, this.vocabulary);
      this.fuzzyCache.set(cacheKey, expansion);
      
      // Simple cache eviction: keep max 1000 entries
      if (this.fuzzyCache.size > 1000) {
        const firstKey = this.fuzzyCache.keys().next().value;
        if (firstKey !== undefined) {
          this.fuzzyCache.delete(firstKey);
        }
      }
    }
    
    return expansion;
  }

  private upsertPosting(
    field: string,
    term: string,
    docId: DocId,
    frequency: number,
    metadata?: Record<string, unknown>
  ): void {
    const key = this.getPostingKey(field, term);
    const entry = this.postings.get(key) ?? new Map<string, PostingInfo>();
    entry.set(this.docIdToKey(docId), { frequency, metadata });
    this.postings.set(key, entry);
  }

  private getPostingKey(field: string, term: string): string {
    return `${field}::${term}`;
  }

  private docIdToKey(docId: DocId): string {
    return typeof docId === "string" ? docId : String(docId);
  }
}
