import type { TermPosting } from "../cache";
import { Indexer } from "../indexing/indexer";
import { PipelineEngine } from "../pipeline";
import { QueryEngine } from "../query";
import { encodePostings as encodeChunkPostings } from "../storage";
import type {
  EngineDecodePostingsInput,
  EngineEncodePostingsInput,
  EngineExecuteQueryInput,
  EngineQueryResult,
  SearchCoreEngine,
  TsSearchCoreEngineOptions
} from "./types";

export class TsSearchCoreEngine implements SearchCoreEngine {
  readonly kind = "ts" as const;

  private readonly indexer: Indexer;
  private readonly queryEngine: QueryEngine;

  constructor(private readonly options: TsSearchCoreEngineOptions) {
    this.indexer = new Indexer(options.pipeline ?? new PipelineEngine());
    this.queryEngine = new QueryEngine({
      storage: options.storage,
      termCache: options.termCache,
      vectorCache: options.vectorCache,
      stats: options.stats
    });
  }

  ingest(record: Parameters<Indexer["ingest"]>[0]) {
    return this.indexer.ingest(record);
  }

  ingestBatch(records: Parameters<Indexer["ingestBatch"]>[0]) {
    return this.indexer.ingestBatch(records);
  }

  encodePostings(input: EngineEncodePostingsInput) {
    const serialized = input.postings.map((posting) => JSON.stringify(posting));
    const { buffer, encoding } = encodeChunkPostings(serialized);

    return {
      payload: toArrayBuffer(buffer),
      encoding,
      docFrequency: input.postings.length,
      inverseDocumentFrequency: undefined
    };
  }

  decodePostings(input: EngineDecodePostingsInput): TermPosting[] {
    return this.options.storage
      .decodeChunkPayload(input.chunk)
      .postings.map((raw) => parsePosting(raw))
      .filter((posting): posting is TermPosting => posting !== null);
  }

  executeQuery(input: EngineExecuteQueryInput): Promise<EngineQueryResult> {
    return this.queryEngine.execute(input.tokens, {
      limit: input.limit
    });
  }
}

function toArrayBuffer(buffer: Uint8Array): ArrayBuffer {
  const view = buffer.byteOffset === 0 && buffer.byteLength === buffer.buffer.byteLength
    ? buffer.buffer
    : buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);

  return view as ArrayBuffer;
}

function parsePosting(raw: unknown): TermPosting | null {
  if (typeof raw === "string") {
    const parsed = safeJsonParse(raw);
    if (parsed && typeof parsed === "object" && "docId" in parsed) {
      const parsedRecord = parsed as Record<string, unknown>;
      const docIdValue = parsedRecord.docId;
      if (typeof docIdValue === "string" || typeof docIdValue === "number") {
        const termFrequencyValue = Number(parsedRecord.termFrequency ?? 1);
        return {
          docId: String(docIdValue),
          termFrequency: Number.isFinite(termFrequencyValue) && termFrequencyValue > 0 ? termFrequencyValue : 1,
          metadata: parsedRecord.metadata as Record<string, unknown> | undefined
        };
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
      const termFrequencyValue = Number(candidate.termFrequency ?? 1);
      return {
        docId: String(docIdValue),
        termFrequency: Number.isFinite(termFrequencyValue) && termFrequencyValue > 0 ? termFrequencyValue : 1,
        metadata: candidate.metadata as Record<string, unknown> | undefined
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
