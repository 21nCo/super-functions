import {
  QueryEngine,
  TsSearchCoreEngine,
  type DocumentStatsProvider,
  type LruCache,
  type Pipeline,
  type QueryStorage,
  type QueryScoringInput,
  type ScoredDocument,
  type SearchCoreEngine,
  type StoredPostingChunk,
  type TermCacheValue,
  type TermPosting,
  type VectorCacheValue,
} from "@searchfn/core";

export const abiVersion = 1;

const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder();

export interface SearchCoreEngineFactoryOptions {
  storage: QueryStorage;
  termCache: LruCache<TermCacheValue>;
  vectorCache: LruCache<VectorCacheValue>;
  stats: DocumentStatsProvider;
  pipeline?: Pipeline;
}

interface SearchFnRustWasmExports {
  memory: WebAssembly.Memory;
  searchfn_wasm_abi_version: () => number;
  searchfn_alloc: (len: number) => number;
  searchfn_free: (ptr: number, capacity: number) => void;
  searchfn_encode_postings_json: (ptr: number, len: number) => number;
  searchfn_decode_postings_to_json: (ptr: number, len: number) => number;
  searchfn_score_documents_json: (ptr: number, len: number) => number;
  searchfn_get_output_ptr: () => number;
  searchfn_get_output_len: () => number;
  searchfn_get_last_error_ptr: () => number;
  searchfn_get_last_error_len: () => number;
}

interface RustScoreRequest {
  chunks: Array<{
    field: string;
    term: string;
    docFrequency: number;
    inverseDocumentFrequency?: number;
    postings: Array<{
      docId: string;
      termFrequency: number;
      metadata?: Record<string, unknown>;
    }>;
  }>;
  documentLengths: Record<string, number>;
  averageDocLength: number;
  options?: QueryScoringInput["options"];
  limit?: number;
}

let wasmExportsPromise: Promise<SearchFnRustWasmExports> | null = null;

export async function createSearchCoreEngine(
  options: SearchCoreEngineFactoryOptions,
): Promise<SearchCoreEngine> {
  const wasm = await loadRustWasmExports();
  const delegate = new TsSearchCoreEngine({
    storage: options.storage,
    termCache: options.termCache,
    vectorCache: options.vectorCache,
    stats: options.stats,
    pipeline: options.pipeline,
  });
  const queryEngine = new QueryEngine({
    storage: options.storage,
    termCache: options.termCache,
    vectorCache: options.vectorCache,
    stats: options.stats,
    decodeChunk: (chunk) => decodeChunkWithRust(wasm, delegate, chunk),
    scoreDocuments: (input) => scoreDocumentsWithRust(wasm, input),
  });

  return {
    kind: "wasm",
    ingest: (record) => delegate.ingest(record),
    ingestBatch: (records) => delegate.ingestBatch(records),
    encodePostings: (input) => ({
      payload: encodePostingsWithRust(
        wasm,
        input.postings.map((posting) => ({
          docId: String(posting.docId),
          termFrequency: normalizeTermFrequency(posting.termFrequency),
          metadata: posting.metadata,
        })),
      ),
      encoding: "posting-bin-v1",
      docFrequency: input.postings.length,
      inverseDocumentFrequency: undefined,
    }),
    decodePostings: (input) => decodeChunkWithRust(wasm, delegate, input.chunk),
    executeQuery: (input) =>
      queryEngine.execute(input.tokens, {
        limit: input.limit,
      }),
    selfTest: async () => {
      const decoded = decodePostingsWithRust(
        wasm,
        encodePostingsWithRust(wasm, [
          { docId: "__searchfn_wasm_self_test__", termFrequency: 1 },
        ]),
      );
      assertSelfTestPostings(decoded);

      const scored = scoreDocumentsWithRust(wasm, {
        chunks: [
          {
            field: "title",
            term: "self-test",
            docFrequency: 2,
            postings: [
              { docId: "doc-1", termFrequency: 2 },
              {
                docId: "doc-2",
                termFrequency: 1,
                metadata: { isPrefix: true },
              },
            ],
          },
        ],
        documentLengths: new Map([
          ["doc-1", 4],
          ["doc-2", 4],
        ]),
        averageDocLength: 4,
        options: {
          k1: 1.2,
          b: 0.75,
          d: 0.5,
        },
        limit: 2,
      });
      assertSelfTestScores(scored);
    },
  };
}

async function loadRustWasmExports(): Promise<SearchFnRustWasmExports> {
  if (!wasmExportsPromise) {
    wasmExportsPromise = (async () => {
      const bytes = await loadWasmBytes();
      const instantiated = (await WebAssembly.instantiate(bytes, {})) as
        | WebAssembly.WebAssemblyInstantiatedSource
        | WebAssembly.Instance;
      const instance: WebAssembly.Instance =
        "instance" in instantiated ? instantiated.instance : instantiated;
      const exports = instance.exports as unknown as SearchFnRustWasmExports;
      if (exports.searchfn_wasm_abi_version() !== abiVersion) {
        throw new Error(
          `SearchFn core-wasm ABI mismatch: expected ${abiVersion}, received ${exports.searchfn_wasm_abi_version()}.`,
        );
      }
      return exports;
    })().catch((error) => {
      wasmExportsPromise = null;
      throw error;
    });
  }
  return wasmExportsPromise;
}

async function loadWasmBytes(): Promise<Uint8Array> {
  const candidates = [
    new URL("../.wasm/searchfn_core_wasm.wasm", import.meta.url),
    new URL("./searchfn_core_wasm.wasm", import.meta.url),
  ];
  const failures: string[] = [];

  for (const candidate of candidates) {
    try {
      return await readWasmCandidate(candidate);
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
  }

  throw new Error(
    `Unable to load SearchFn core-wasm binary. ${failures.join(" ")}`,
  );
}

async function readWasmCandidate(candidate: URL): Promise<Uint8Array> {
  if (typeof process !== "undefined" && process.versions?.node) {
    const { readFile } = await import("node:fs/promises");
    return new Uint8Array(await readFile(candidate));
  }

  const response = await fetch(candidate);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${candidate.href}: ${response.status}`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

function encodePostingsWithRust(
  wasm: SearchFnRustWasmExports,
  postings: Array<{
    docId: string;
    termFrequency: number;
    metadata?: Record<string, unknown>;
  }>,
): ArrayBuffer {
  const payload = TEXT_ENCODER.encode(JSON.stringify(postings));
  const success = invokeWasm(wasm, payload, wasm.searchfn_encode_postings_json);
  if (!success) {
    throw new Error(readLastError(wasm));
  }
  return toArrayBuffer(readOutputBytes(wasm));
}

function decodePostingsWithRust(
  wasm: SearchFnRustWasmExports,
  payload: ArrayBuffer,
): TermPosting[] {
  const success = invokeWasm(
    wasm,
    new Uint8Array(payload),
    wasm.searchfn_decode_postings_to_json,
  );
  if (!success) {
    throw new Error(readLastError(wasm));
  }

  const decodedJson = TEXT_DECODER.decode(readOutputBytes(wasm));
  const decoded = JSON.parse(decodedJson) as Array<{
    docId: string;
    termFrequency: number;
    metadata?: Record<string, unknown>;
  }>;

  return decoded.map((posting) => ({
    docId: posting.docId,
    termFrequency: normalizeTermFrequency(posting.termFrequency),
    metadata: posting.metadata,
  }));
}

function scoreDocumentsWithRust(
  wasm: SearchFnRustWasmExports,
  input: QueryScoringInput,
): ScoredDocument[] {
  const payload = TEXT_ENCODER.encode(
    JSON.stringify(serializeScoringInput(input)),
  );
  const success = invokeWasm(wasm, payload, wasm.searchfn_score_documents_json);
  if (!success) {
    throw new Error(readLastError(wasm));
  }

  const decodedJson = TEXT_DECODER.decode(readOutputBytes(wasm));
  const decoded = JSON.parse(decodedJson) as Array<{
    docId: string;
    score: number;
  }>;

  return decoded.map((document) => ({
    docId: document.docId,
    score: Number.isFinite(document.score) ? document.score : 0,
  }));
}

function decodeChunkWithRust(
  wasm: SearchFnRustWasmExports,
  delegate: TsSearchCoreEngine,
  chunk: StoredPostingChunk,
): TermPosting[] {
  if (chunk.encoding === "posting-bin-v1") {
    return decodePostingsWithRust(wasm, chunk.payload);
  }

  return delegate.decodePostings({ chunk });
}

function serializeScoringInput(input: QueryScoringInput): RustScoreRequest {
  return {
    chunks: input.chunks.map((chunk) => ({
      field: chunk.field,
      term: chunk.term,
      docFrequency: chunk.docFrequency,
      inverseDocumentFrequency: chunk.inverseDocumentFrequency,
      postings: chunk.postings.map((posting) => ({
        docId: String(posting.docId),
        termFrequency: normalizeScoreTermFrequency(posting.termFrequency),
        metadata: posting.metadata,
      })),
    })),
    documentLengths: Object.fromEntries(
      Array.from(input.documentLengths.entries()).map(([docId, length]) => [
        String(docId),
        normalizeLength(length),
      ]),
    ),
    averageDocLength: normalizeLength(input.averageDocLength),
    options: input.options,
    limit: input.limit,
  };
}

function invokeWasm(
  wasm: SearchFnRustWasmExports,
  bytes: Uint8Array,
  fn: (ptr: number, len: number) => number,
): boolean {
  const capacity = Math.max(bytes.byteLength, 1);
  const ptr = wasm.searchfn_alloc(capacity);
  try {
    new Uint8Array(wasm.memory.buffer, ptr, bytes.byteLength).set(bytes);
    return fn(ptr, bytes.byteLength) === 1;
  } finally {
    wasm.searchfn_free(ptr, capacity);
  }
}

function readOutputBytes(wasm: SearchFnRustWasmExports): Uint8Array {
  const ptr = wasm.searchfn_get_output_ptr();
  const len = wasm.searchfn_get_output_len();
  return Uint8Array.from(new Uint8Array(wasm.memory.buffer, ptr, len));
}

function readLastError(wasm: SearchFnRustWasmExports): string {
  const ptr = wasm.searchfn_get_last_error_ptr();
  const len = wasm.searchfn_get_last_error_len();
  return TEXT_DECODER.decode(new Uint8Array(wasm.memory.buffer, ptr, len));
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

function assertSelfTestPostings(postings: TermPosting[]): void {
  if (
    postings.length !== 1 ||
    postings[0]?.docId !== "__searchfn_wasm_self_test__" ||
    postings[0]?.termFrequency !== 1
  ) {
    throw new Error("SearchFn WASM engine self-test failed.");
  }
}

function assertSelfTestScores(documents: ScoredDocument[]): void {
  if (
    documents.length !== 2 ||
    documents[0]?.docId !== "doc-1" ||
    documents[1]?.docId !== "doc-2" ||
    !(documents[0]?.score > documents[1]?.score)
  ) {
    throw new Error("SearchFn WASM engine scoring self-test failed.");
  }
}

function normalizeTermFrequency(termFrequency: number): number {
  if (!Number.isFinite(termFrequency) || termFrequency <= 0) {
    return 1;
  }
  return Math.max(1, Math.min(Math.floor(termFrequency), 0xffffffff));
}

function normalizeLength(length: number): number {
  if (!Number.isFinite(length) || length <= 0) {
    return 1;
  }
  return length;
}

function normalizeScoreTermFrequency(termFrequency: number): number {
  if (!Number.isFinite(termFrequency) || termFrequency <= 0) {
    return 1;
  }
  return termFrequency;
}
