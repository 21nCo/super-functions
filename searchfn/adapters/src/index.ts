export type {
  SearchDocument,
  IndexParams,
  SearchParams,
  RemoveParams,
  SearchAllParams,
  SearchAllResult,
  InitializeParams,
  InitializeResourceConfig,
  SearchAdapter,
  SearchAdapterCapabilities,
  SearchAdapterConfig
} from "./types";
export { SEARCH_ADAPTER_DISPOSED, SearchAdapterError } from "./types";
export { MemoryAdapter } from "./memory";
export { IndexedDbAdapter } from "./indexeddb";
export type { IndexedDbAdapterOptions } from "./indexeddb";
export { MeilisearchAdapter } from "./meilisearch";
export type { MeilisearchAdapterOptions } from "./meilisearch";
export { ElasticsearchAdapter } from "./elasticsearch";
export type { ElasticsearchAdapterOptions } from "./elasticsearch";
export { OpenSearchAdapter } from "./opensearch";
export type { OpenSearchAdapterOptions } from "./opensearch";
export { PostgresAdapter } from "./postgres";
export type { PostgresAdapterOptions } from "./postgres";
export { redactSensitive as redactSearchFnLogContext } from "./internal/redaction";
