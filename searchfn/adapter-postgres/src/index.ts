export { PostgresAdapter } from "./postgres";
export type {
  PostgresAdapterOptions,
  PostgresRetryPolicy,
  PostgresAdapterLogger,
} from "./postgres";
export type {
  SearchAdapter,
  SearchAdapterCapabilities,
  SearchDocument,
  IndexParams,
  SearchParams,
  SearchAllParams,
  SearchAllResult,
  RemoveParams,
  InitializeParams,
  InitializeResourceConfig,
  SearchAdapterConfig,
} from "@searchfn/adapter-contracts";
export { SearchAdapterError, SEARCH_ADAPTER_DISPOSED } from "@searchfn/adapter-contracts";
