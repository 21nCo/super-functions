import type { IndexedDbManager } from "../storage";
import type { LruCache } from "../cache";
import type {
  QueryToken,
  QueryOptions,
  RetrievedPostingChunk,
  ScoredDocument,
  DocumentStatsProvider
} from "./types";
import type { TermCacheValue, VectorCacheValue } from "../cache";
import type { DocId } from "../types";
import { scorePostings } from "./scoring";

export interface QueryEngineDependencies {
  storage: IndexedDbManager;
  termCache: LruCache<TermCacheValue>;
  vectorCache: LruCache<VectorCacheValue>;
  stats: DocumentStatsProvider;
}

export interface QueryResult {
  documents: ScoredDocument[];
  postings: RetrievedPostingChunk[];
}

export class QueryEngine {
  constructor(private readonly deps: QueryEngineDependencies) {}

  async execute(tokens: QueryToken[], options?: QueryOptions): Promise<QueryResult> {
    const postings: RetrievedPostingChunk[] = [];

    for (const token of tokens) {
      const cacheKey = this.buildCacheKey(token);
      let cached = this.deps.termCache.get(cacheKey);
      if (!cached) {
        const chunk = await this.deps.storage.getTermChunk({
          field: token.field,
          term: token.term,
          chunk: 0
        });
        if (!chunk) continue;
        const decoded = this.deps.storage.decodeChunkPayload(chunk);
        const postings = decoded.postings.map((raw) => parsePosting(raw));
        cached = {
          field: token.field,
          term: token.term,
          chunk: 0,
          postings,
          docFrequency: chunk.docFrequency,
          inverseDocumentFrequency: chunk.inverseDocumentFrequency
        };
        this.deps.termCache.set(cacheKey, cached);
      }
      postings.push(cached);
    }

    const docLengths = new Map<DocId, number>();

    const averageDocLengthFromStats = this.deps.stats.getAverageLength();
    const averageDocLength = averageDocLengthFromStats > 0 ? averageDocLengthFromStats : 1;

    for (const chunk of postings) {
      for (const posting of chunk.postings) {
        const docId = posting.docId;
        if (docLengths.has(docId)) continue;
        const length = this.deps.stats.getLength(docId) ?? averageDocLength;
        docLengths.set(docId, length);
      }
    }

    const scored = scorePostings(postings, docLengths, averageDocLength, {
      k1: 1.2,
      b: 0.75,
      d: 0.5
    });

    const limit = options?.limit ?? 10;
    return {
      postings,
      documents: scored.slice(0, limit)
    };
  }

  private buildCacheKey(token: QueryToken): string {
    return `${token.field}:${token.term}`;
  }
}

function parsePosting(raw: unknown): { docId: string; termFrequency: number } {
  if (typeof raw === "string") {
    const parsed = safeJsonParse(raw);
    if (parsed && typeof parsed === "object" && "docId" in parsed) {
      const parsedRecord = parsed as Record<string, unknown>;
      const docIdValue = parsedRecord.docId;
      if (typeof docIdValue === "string" || typeof docIdValue === "number") {
        const docId = String(docIdValue);
        const termFrequencyValue = Number(parsedRecord.termFrequency ?? 1);
        const termFrequency = Number.isFinite(termFrequencyValue) && termFrequencyValue > 0 ? termFrequencyValue : 1;
        return { docId, termFrequency };
      }
      // If docId is not a string or number, treat it as an invalid format
      throw new Error(`Invalid docId type in parsed posting: ${typeof docIdValue}`);
    } else {
      // If it's a string but not valid JSON with docId, treat it as a simple docId
      return { docId: raw, termFrequency: 1 };
    }
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
      return { docId, termFrequency };
    }
  }

  throw new Error(`Could not parse posting from unexpected format: ${String(raw)}`);
}

function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}
