export * from "./types";
export * from "./config/defaults";
export * from "./storage";
export * from "./utils/logger";
export * from "./pipeline";
export * from "./indexing/indexer";
export * from "./cache";
export * from "./query";
export * from "./search-engine";
export * from "./in-memory-search";
export * from "./compat/index-adapter";
export * from "./compat/document-adapter";
export * from "./compat/migration";

// Backward compatibility: SearchEngine is now SearchFn
export { SearchFn as SearchEngine } from "./search-engine";
export type {
  SearchFnOptions as SearchEngineOptions,
  AddDocumentInput as SearchEngineAddInput,
  SearchOptions as SearchEngineSearchOptions,
  SearchResultItem as SearchEngineResultItem
} from "./search-engine";
