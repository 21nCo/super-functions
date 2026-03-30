import {
  DocumentStatsManager,
  Indexer,
  PipelineEngine,
  fuzzyExpand,
  scorePostings,
  type PipelineOptions,
  type RetrievedPostingChunk,
  type TermPosting,
} from "@searchfn/core";

export interface InMemorySearchFnOptions {
  fields: string[];
  pipeline?: PipelineOptions;
}

export interface InMemoryAddDocumentInput {
  id: string | number;
  fields: Record<string, string>;
  store?: Record<string, unknown>;
}

export interface InMemorySearchOptions {
  fields?: string[];
  limit?: number;
  fuzzy?: number | boolean;
}

export interface InMemorySearchDetailedOptions extends InMemorySearchOptions {
  includeStored?: boolean;
}

export interface InMemorySearchResultItem {
  docId: string | number;
  score: number;
  document?: Record<string, unknown>;
}

export interface InMemorySearchFnSnapshot {
  postings: Array<{
    field: string;
    term: string;
    documents: TermPosting[];
  }>;
  stats: Array<{ docId: string | number; length: number }>;
  documents: Array<{ docId: string | number; payload: Record<string, unknown> }>;
  vocabulary: string[];
}

interface PostingBucket {
  field: string;
  term: string;
  documents: Map<string, TermPosting>;
}

interface StoredDocument {
  docId: string | number;
  payload: Record<string, unknown>;
}

function postingBucketKey(field: string, term: string): string {
  return `${field}\u0000${term}`;
}

function docIdKey(value: string | number): string {
  return `${typeof value === "string" ? "s" : "n"}:${String(value)}`;
}

function sortString(a: string | number, b: string | number): number {
  return String(a).localeCompare(String(b), "en", {
    sensitivity: "variant",
    numeric: true,
  });
}

export class InMemorySearchFn {
  private readonly fields: string[];
  private readonly pipeline: PipelineEngine;
  private readonly pipelineWithoutNGrams: PipelineEngine;
  private readonly indexer: Indexer;
  private readonly statsManager = new DocumentStatsManager();
  private readonly postings = new Map<string, PostingBucket>();
  private readonly documents = new Map<string, StoredDocument>();
  private readonly vocabulary = new Set<string>();
  private readonly fuzzyCache = new Map<string, string[]>();

  constructor(options: InMemorySearchFnOptions) {
    this.fields = [...options.fields];
    this.pipeline = new PipelineEngine(options.pipeline);
    this.pipelineWithoutNGrams = new PipelineEngine({
      ...options.pipeline,
      enableEdgeNGrams: false,
    });
    this.indexer = new Indexer(this.pipeline);
  }

  add(input: InMemoryAddDocumentInput): void {
    const docId = input.id;
    const docKey = docIdKey(docId);
    if (this.documents.has(docKey)) {
      this.remove(docId);
    }
    const ingested = this.indexer.ingest({
      docId,
      fields: input.fields,
    });

    this.statsManager.addDocument(docId, ingested.totalLength);
    this.documents.set(docKey, {
      docId,
      payload: input.store ?? {},
    });

    for (const [field, termFrequencies] of ingested.fieldFrequencies.entries()) {
      const metadata = ingested.fieldMetadata.get(field) ?? new Map<string, Record<string, unknown>>();
      for (const [term, frequency] of termFrequencies.entries()) {
        const bucketKey = postingBucketKey(field, term);
        const bucket = this.postings.get(bucketKey) ?? {
          field,
          term,
          documents: new Map<string, TermPosting>(),
        };
        const postingMetadata = metadata.get(term);
        bucket.documents.set(docKey, {
          docId,
          termFrequency: frequency,
          metadata: postingMetadata,
        });
        this.postings.set(bucketKey, bucket);

        if (postingMetadata?.isPrefix !== true) {
          this.vocabulary.add(term);
          this.fuzzyCache.clear();
        }
      }
    }
  }

  search(query: string, options: InMemorySearchOptions = {}): Array<string | number> {
    return this.searchDetailed(query, options).map((result) => result.docId);
  }

  searchDetailed(
    query: string,
    options: InMemorySearchDetailedOptions = {}
  ): InMemorySearchResultItem[] {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) {
      return [];
    }

    const searchFields = options.fields?.length ? options.fields : this.fields;
    const queryTokens = new Map<string, { field: string; term: string; boost: number }>();
    const fuzzyDistance = this.getFuzzyDistance(options.fuzzy);

    for (const field of searchFields) {
      const tokens = this.pipelineWithoutNGrams.run(field, normalizedQuery);
      for (const token of tokens) {
        const key = postingBucketKey(field, token.value);
        if (!queryTokens.has(key)) {
          queryTokens.set(key, {
            field,
            term: token.value,
            boost: 1,
          });
        }

        if (fuzzyDistance) {
          for (const fuzzyTerm of this.getCachedFuzzyExpansion(token.value, fuzzyDistance)) {
            const fuzzyKey = postingBucketKey(field, fuzzyTerm);
            if (!queryTokens.has(fuzzyKey)) {
              queryTokens.set(fuzzyKey, {
                field,
                term: fuzzyTerm,
                boost: fuzzyTerm === token.value ? 1 : 0.8,
              });
            }
          }
        }
      }
    }

    const postings: RetrievedPostingChunk[] = [];
    for (const token of queryTokens.values()) {
      const bucket = this.postings.get(postingBucketKey(token.field, token.term));
      if (!bucket) {
        continue;
      }
      postings.push({
        field: bucket.field,
        term: bucket.term,
        docFrequency: bucket.documents.size,
        postings: [...bucket.documents.values()].map((posting) => ({
          ...posting,
          termFrequency: posting.termFrequency * token.boost,
        })),
      });
    }

    if (postings.length === 0) {
      return [];
    }

    const docLengths = new Map(
      this.statsManager.snapshot().map((entry: { docId: string | number; length: number }) =>
        [entry.docId, entry.length] satisfies [string | number, number]
      )
    );
    const scored = scorePostings(
      postings,
      docLengths,
      this.statsManager.getAverageLength(),
      { k1: 1.2, b: 0.75, d: 0.5 }
    );

    return scored.slice(0, Math.max(options.limit ?? 10, 0)).map((entry: { docId: string | number; score: number }) => ({
      docId: entry.docId,
      score: entry.score,
      document: options.includeStored ? this.documents.get(docIdKey(entry.docId))?.payload : undefined,
    }));
  }

  remove(docId: string | number): void {
    const docKey = docIdKey(docId);
    this.documents.delete(docKey);
    this.statsManager.removeDocument(docId);

    for (const [bucketKey, bucket] of this.postings.entries()) {
      bucket.documents.delete(docKey);
      if (bucket.documents.size === 0) {
        this.postings.delete(bucketKey);
        if (!this.hasRemainingVocabularyEntry(bucket.term)) {
          this.vocabulary.delete(bucket.term);
          this.fuzzyCache.clear();
        }
      }
    }
  }

  private hasRemainingVocabularyEntry(term: string): boolean {
    for (const bucket of this.postings.values()) {
      if (bucket.term !== term || bucket.documents.size === 0) {
        continue;
      }
      for (const posting of bucket.documents.values()) {
        if (posting.metadata?.isPrefix !== true) {
          return true;
        }
      }
    }
    return false;
  }

  getDocument(docId: string | number): Record<string, unknown> | undefined {
    return this.documents.get(docIdKey(docId))?.payload;
  }

  clear(): void {
    this.postings.clear();
    this.documents.clear();
    this.vocabulary.clear();
    this.fuzzyCache.clear();
    this.statsManager.load([]);
  }

  exportSnapshot(): InMemorySearchFnSnapshot {
    return {
      postings: [...this.postings.values()]
        .map((bucket) => ({
          field: bucket.field,
          term: bucket.term,
          documents: [...bucket.documents.values()].sort((left, right) =>
            sortString(docIdKey(left.docId), docIdKey(right.docId))
          ),
        }))
        .sort((left, right) => {
          const fieldCompare = sortString(left.field, right.field);
          if (fieldCompare !== 0) {
            return fieldCompare;
          }
          return sortString(left.term, right.term);
        }),
      stats: this.statsManager
        .snapshot()
        .sort(
          (left: { docId: string | number; length: number }, right: { docId: string | number; length: number }) =>
            sortString(left.docId, right.docId),
        ),
      documents: [...this.documents.values()]
        .map((document) => ({ docId: document.docId, payload: document.payload }))
        .sort((left, right) => sortString(left.docId, right.docId)),
      vocabulary: [...this.vocabulary].sort(sortString),
    };
  }

  importSnapshot(snapshot: InMemorySearchFnSnapshot): void {
    this.clear();
    this.statsManager.load(snapshot.stats);

    for (const posting of snapshot.postings) {
      this.postings.set(postingBucketKey(posting.field, posting.term), {
        field: posting.field,
        term: posting.term,
        documents: new Map(
          posting.documents.map((entry) => [docIdKey(entry.docId), entry] satisfies [string, TermPosting])
        ),
      });
    }

    for (const document of snapshot.documents) {
      this.documents.set(docIdKey(document.docId), {
        docId: document.docId,
        payload: document.payload,
      });
    }

    for (const term of snapshot.vocabulary) {
      this.vocabulary.add(term);
    }
  }

  private getFuzzyDistance(fuzzy?: number | boolean): number | undefined {
    if (fuzzy === true) {
      return 2;
    }
    if (typeof fuzzy === "number" && fuzzy > 0) {
      return fuzzy;
    }
    return undefined;
  }

  private getCachedFuzzyExpansion(term: string, distance: number): string[] {
    const cacheKey = `${term}:${distance}`;
    const cached = this.fuzzyCache.get(cacheKey);
    if (cached) {
      return cached;
    }
    const expanded = fuzzyExpand(term, distance, this.vocabulary);
    this.fuzzyCache.set(cacheKey, expanded);
    return expanded;
  }
}
