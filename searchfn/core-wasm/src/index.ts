import {
  TsSearchCoreEngine,
  type DocumentStatsProvider,
  type IndexedDbManager,
  type LruCache,
  type Pipeline,
  type SearchCoreEngine,
  type TermCacheValue,
  type TermPosting,
  type VectorCacheValue
} from "@searchfn/core";

export const abiVersion = 1;

export interface SearchCoreEngineFactoryOptions {
  storage: IndexedDbManager;
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
  searchfn_get_output_ptr: () => number;
  searchfn_get_output_len: () => number;
  searchfn_get_last_error_ptr: () => number;
  searchfn_get_last_error_len: () => number;
}

let wasmExportsPromise: Promise<SearchFnRustWasmExports> | null = null;

export async function createSearchCoreEngine(
  options: SearchCoreEngineFactoryOptions
): Promise<SearchCoreEngine> {
  const wasm = await loadRustWasmExports();
  const delegate = new TsSearchCoreEngine({
    storage: options.storage,
    termCache: options.termCache,
    vectorCache: options.vectorCache,
    stats: options.stats,
    pipeline: options.pipeline
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
          metadata: posting.metadata
        }))
      ),
      encoding: "posting-bin-v1",
      docFrequency: input.postings.length,
      inverseDocumentFrequency: undefined
    }),
    decodePostings: (input) => delegate.decodePostings(input),
    executeQuery: (input) => delegate.executeQuery(input),
    selfTest: async () => {
      const decoded = decodePostingsWithRust(
        wasm,
        encodePostingsWithRust(wasm, [{ docId: "__searchfn_wasm_self_test__", termFrequency: 1 }])
      );
      assertSelfTestResult(decoded);
    }
  };
}

async function loadRustWasmExports(): Promise<SearchFnRustWasmExports> {
  if (!wasmExportsPromise) {
    wasmExportsPromise = (async () => {
      const bytes = await loadWasmBytes();
      const instantiated = await WebAssembly.instantiate(bytes, {});
      const source = instantiated as WebAssembly.WebAssemblyInstantiatedSource | WebAssembly.Instance;
      const instance = source instanceof WebAssembly.Instance ? source : source.instance;
      const exports = instance.exports as unknown as SearchFnRustWasmExports;
      if (exports.searchfn_wasm_abi_version() !== abiVersion) {
        throw new Error(
          `SearchFn core-wasm ABI mismatch: expected ${abiVersion}, received ${exports.searchfn_wasm_abi_version()}.`
        );
      }
      return exports;
    })();
  }
  return wasmExportsPromise;
}

async function loadWasmBytes(): Promise<Uint8Array> {
  const candidates = [
    new URL("../.wasm/searchfn_core_wasm.wasm", import.meta.url),
    new URL("./searchfn_core_wasm.wasm", import.meta.url)
  ];
  const failures: string[] = [];

  for (const candidate of candidates) {
    try {
      return await readWasmCandidate(candidate);
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
  }

  throw new Error(`Unable to load SearchFn core-wasm binary. ${failures.join(" ")}`);
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
  postings: Array<{ docId: string; termFrequency: number; metadata?: Record<string, unknown> }>
): ArrayBuffer {
  const payload = new TextEncoder().encode(JSON.stringify(postings));
  const success = invokeWasm(wasm, payload, wasm.searchfn_encode_postings_json);
  if (!success) {
    throw new Error(readLastError(wasm));
  }
  return toArrayBuffer(readOutputBytes(wasm));
}

function decodePostingsWithRust(wasm: SearchFnRustWasmExports, payload: ArrayBuffer): TermPosting[] {
  const success = invokeWasm(wasm, new Uint8Array(payload), wasm.searchfn_decode_postings_to_json);
  if (!success) {
    throw new Error(readLastError(wasm));
  }

  const decodedJson = new TextDecoder().decode(readOutputBytes(wasm));
  const decoded = JSON.parse(decodedJson) as Array<{
    docId: string;
    termFrequency: number;
    metadata?: Record<string, unknown>;
  }>;

  return decoded.map((posting) => ({
    docId: posting.docId,
    termFrequency: normalizeTermFrequency(posting.termFrequency),
    metadata: posting.metadata
  }));
}

function invokeWasm(
  wasm: SearchFnRustWasmExports,
  bytes: Uint8Array,
  fn: (ptr: number, len: number) => number
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
  return new TextDecoder().decode(new Uint8Array(wasm.memory.buffer, ptr, len));
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function assertSelfTestResult(postings: TermPosting[]): void {
  if (
    postings.length !== 1 ||
    postings[0]?.docId !== "__searchfn_wasm_self_test__" ||
    postings[0]?.termFrequency !== 1
  ) {
    throw new Error("SearchFn WASM engine self-test failed.");
  }
}

function normalizeTermFrequency(termFrequency: number): number {
  if (!Number.isFinite(termFrequency) || termFrequency <= 0) {
    return 1;
  }
  return termFrequency;
}
