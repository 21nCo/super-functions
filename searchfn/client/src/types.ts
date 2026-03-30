import type {
  SearchAdapter,
  SearchAdapterCapabilities,
  IndexParams,
  SearchParams,
  SearchAllParams,
  SearchAllResult,
  InitializeParams,
} from "@searchfn/adapter-contracts";

export interface SearchClientDefaults {
  limit?: number;
  limitPerResource?: number;
  fuzzy?: boolean | number;
  prefix?: boolean;
  fieldBoosts?: Record<string, number>;
}

export interface SearchClient {
  initialize?(params: InitializeParams): Promise<void>;
  index(params: IndexParams): Promise<void>;
  search(params: SearchParams): Promise<Array<string | number>>;
  searchAll(params: SearchAllParams): Promise<SearchAllResult[]>;
  remove(params: { resource: string; ids: Array<string | number>; signal?: AbortSignal }): Promise<void>;
  clear(resource: string, signal?: AbortSignal): Promise<void>;
  dispose(): Promise<void>;
  adapterInfo(): { name: string; capabilities?: SearchAdapterCapabilities };
}

export interface SearchClientConfig {
  adapter: SearchAdapter;
  defaults?: SearchClientDefaults;
}

export {
  type SearchAdapter,
  type SearchAdapterCapabilities,
  type IndexParams,
  type SearchParams,
  type SearchAllParams,
  type SearchAllResult,
  type InitializeParams,
} from "@searchfn/adapter-contracts";
