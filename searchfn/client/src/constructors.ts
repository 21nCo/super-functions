import { MemoryAdapter } from "@searchfn/adapter-memory";
import { IndexedDbAdapter, type IndexedDbAdapterOptions } from "@searchfn/adapter-indexeddb";
import type { SearchAdapterConfig } from "@searchfn/adapter-contracts";
import { createSearchClient } from "./client";
import type { SearchClient, SearchClientDefaults } from "./types";

export function createMemorySearchClient(config?: {
  adapterConfig?: SearchAdapterConfig;
  defaults?: SearchClientDefaults;
}): SearchClient {
  const adapter = new MemoryAdapter(config?.adapterConfig);
  return createSearchClient({
    adapter,
    defaults: config?.defaults,
  });
}

export function createIndexedDbSearchClient(config?: {
  adapterConfig?: IndexedDbAdapterOptions;
  defaults?: SearchClientDefaults;
}): SearchClient {
  const adapter = new IndexedDbAdapter(config?.adapterConfig);
  return createSearchClient({
    adapter,
    defaults: config?.defaults,
  });
}
