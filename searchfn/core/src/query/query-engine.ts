import type { LruCache, TermCacheValue, TermPosting, VectorCacheValue } from "../cache";
import type {
  DocumentStatsProvider,
  QueryDocumentScorer,
  QueryOptions,
  QueryStorage,
  QueryToken,
  RetrievedPostingChunk,
  ScoredDocument
} from "./types";
import type { DocId, StoredPostingChunk } from "../types";
import { scoreQueryResults } from "./scoring";

export interface QueryEngineDependencies {
  storage: QueryStorage;
  termCache: LruCache<TermCacheValue>;
  vectorCache: LruCache<VectorCacheValue>;
  stats: DocumentStatsProvider;
  decodeChunk?: (chunk: StoredPostingChunk) => TermPosting[];
  scoreDocuments?: QueryDocumentScorer;
}

export interface QueryResult {
  documents: ScoredDocument[];
  postings: RetrievedPostingChunk[];
}

export class QueryEngine {
  constructor(private readonly deps: QueryEngineDependencies) {}

  async execute(tokens: QueryToken[], options?: QueryOptions): Promise<QueryResult> {
    const collectedPostings: RetrievedPostingChunk[] = [];

    for (const token of tokens) {
      const cacheKey = this.buildCacheKey(token);
      let cached = this.deps.termCache.get(cacheKey);
      if (!cached) {
        const termChunks = await this.loadAllTermChunks(token.field, token.term);
        if (termChunks.length === 0) continue;
        const decodedPostings = termChunks.flatMap((chunk) => this.decodeChunk(chunk));
        cached = {
          field: token.field,
          term: token.term,
          chunk: 0,
          postings: decodedPostings,
          docFrequency: termChunks[0]?.docFrequency ?? decodedPostings.length,
          inverseDocumentFrequency: termChunks[0]?.inverseDocumentFrequency
        };
        this.deps.termCache.set(cacheKey, cached);
      }
      if (token.boost && token.boost !== 1) {
        collectedPostings.push({
          ...cached,
          postings: cached.postings.map((posting) => ({
            ...posting,
            termFrequency: posting.termFrequency * token.boost,
          })),
        });
      } else {
        collectedPostings.push(cached);
      }
    }

    const docLengths = new Map<DocId, number>();
    const averageDocLengthFromStats = this.deps.stats.getAverageLength();
    const averageDocLength = averageDocLengthFromStats > 0 ? averageDocLengthFromStats : 1;

    for (const chunk of collectedPostings) {
      for (const posting of chunk.postings) {
        const docId = posting.docId;
        if (docLengths.has(docId)) continue;
        const length = this.deps.stats.getLength(docId) ?? averageDocLength;
        docLengths.set(docId, length);
      }
    }

    const limit = options?.limit ?? 10;
    const scored = this.deps.scoreDocuments
      ? await this.deps.scoreDocuments({
          chunks: collectedPostings,
          documentLengths: docLengths,
          averageDocLength,
          options: {
            k1: 1.2,
            b: 0.75,
            d: 0.5
          },
          limit
        })
      : scoreQueryResults({
          chunks: collectedPostings,
          documentLengths: docLengths,
          averageDocLength,
          options: {
            k1: 1.2,
            b: 0.75,
            d: 0.5
          },
          limit
        });

    return {
      postings: collectedPostings,
      documents: scored.slice(0, limit)
    };
  }

  private buildCacheKey(token: QueryToken): string {
    return `${token.field}:${token.term}`;
  }

  private async loadAllTermChunks(field: string, term: string): Promise<StoredPostingChunk[]> {
    const chunks: StoredPostingChunk[] = [];
    for (let chunkIndex = 0; ; chunkIndex++) {
      const chunk = await this.deps.storage.getTermChunk({
        field,
        term,
        chunk: chunkIndex,
      });
      if (!chunk) {
        break;
      }
      chunks.push(chunk);
    }
    return chunks;
  }

  private decodeChunk(chunk: StoredPostingChunk): TermPosting[] {
    if (this.deps.decodeChunk) {
      return this.deps.decodeChunk(chunk);
    }

    return this.deps.storage
      .decodeChunkPayload(chunk)
      .postings.map((raw) => parsePosting(raw))
      .filter((posting): posting is TermPosting => posting !== null);
  }
}

function parsePosting(raw: unknown): TermPosting | null {
  if (typeof raw === "string") {
    const parsed = safeJsonParse(raw);
    if (parsed && typeof parsed === "object" && "docId" in parsed) {
      const parsedRecord = parsed as Record<string, unknown>;
      const docIdValue = parsedRecord.docId;
      if (typeof docIdValue === "string" || typeof docIdValue === "number") {
        const docId = String(docIdValue);
        const termFrequencyValue = Number(parsedRecord.termFrequency ?? 1);
        const termFrequency = Number.isFinite(termFrequencyValue) && termFrequencyValue > 0 ? termFrequencyValue : 1;
        return { docId, termFrequency, metadata: parsedRecord.metadata as Record<string, unknown> | undefined };
      }
      return null;
    }

    return { docId: raw, termFrequency: 1 };
  }

  if (typeof raw === "number") {
    return { docId: String(raw), termFrequency: 1 };
  }

  if (raw && typeof raw === "object") {
    const candidate = raw as Record<string, unknown>;
    const docIdValue = candidate.docId;
    if (typeof docIdValue === "string" || typeof docIdValue === "number") {
      const docId = String(docIdValue);
      const tfValue = Number(candidate.termFrequency ?? 1);
      const termFrequency = Number.isFinite(tfValue) && tfValue > 0 ? tfValue : 1;
      return {
        docId,
        termFrequency,
        metadata: candidate.metadata as Record<string, unknown> | undefined,
      };
    }
  }

  return null;
}

function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}
