// Re-export server factory and types
export { createDatafnServer } from "./server.js";
export type { DatafnServerConfig, DatafnServer } from "./server.js";

// Re-export SearchProvider for consumer use
export type { SearchProvider } from "./search-provider.js";

// Re-export status types
export type { StatusResult } from "./routes/status.js";

// Re-export cross-resource search types
export type { SearchResult, SearchResultItem, CrossResourceSearchParams } from "./execution/search/cross-resource.js";

// Re-export sequence store types for secondary database support
export type {
  SequenceStore,
  DbMapping,
} from "./execution/sync/sequence-store.js";
export {
  createSequenceStore,
  RedisSequenceStore,
  KVSequenceStore,
  DatabaseSequenceStore,
  ChainedSequenceStore,
} from "./execution/sync/sequence-store.js";
