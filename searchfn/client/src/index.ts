export { createSearchClient, SearchClientValidationError } from "./client";
export { createMemorySearchClient, createIndexedDbSearchClient } from "./constructors";
export { InMemorySearchFn } from "./in-memory-search";
export { InMemorySearchFn as SearchFn } from "./in-memory-search";
export type {
  SearchClient,
  SearchClientConfig,
  SearchClientDefaults,
  SearchAdapter,
  SearchAdapterCapabilities,
  IndexParams,
  SearchParams,
  SearchAllParams,
  SearchAllResult,
  InitializeParams,
} from "./types";
export type {
  InMemoryAddDocumentInput,
  InMemorySearchDetailedOptions,
  InMemorySearchFnOptions,
  InMemorySearchFnSnapshot,
  InMemorySearchOptions,
  InMemorySearchResultItem,
} from "./in-memory-search";
