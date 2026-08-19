export interface SearchDocument {
  id: string | number;
  fields: Record<string, string>;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface IndexParams {
  resource: string;
  documents: SearchDocument[];
  signal?: AbortSignal;
}

export interface SearchParams {
  resource: string;
  query: string;
  fields?: string[];
  limit?: number;
  fuzzy?: boolean | number;
  prefix?: boolean;
  fieldBoosts?: Record<string, number>;
  namespaceFilter?: string[];
  regionFilter?: string[];
  signal?: AbortSignal;
}

export interface SearchAllParams {
  query: string;
  resources?: string[];
  fields?: string[];
  limit?: number;
  limitPerResource?: number;
  fuzzy?: boolean | number;
  prefix?: boolean;
  fieldBoosts?: Record<string, number>;
  namespaceFilter?: string[];
  regionFilter?: string[];
  signal?: AbortSignal;
}

export interface SearchAllResult {
  resource: string;
  id: string | number;
  score: number;
}

export interface RemoveParams {
  resource: string;
  ids: Array<string | number>;
  signal?: AbortSignal;
}

export interface InitializeResourceConfig {
  name: string;
  searchFields: string[];
}

export interface InitializeParams {
  resources: InitializeResourceConfig[];
}

export interface SearchAdapterCapabilities {
  persistent?: boolean;
  searchAll?: boolean;
  fuzzy?: boolean;
  prefix?: boolean;
  fieldBoosts?: boolean;
  maxBatchSize?: number;
}

export interface SearchAdapter {
  readonly name: string;
  readonly capabilities?: SearchAdapterCapabilities;

  initialize?(params: InitializeParams): Promise<void>;
  index(params: IndexParams): Promise<void>;
  search(params: SearchParams): Promise<Array<string | number>>;
  searchAll?(params: SearchAllParams): Promise<SearchAllResult[]>;
  remove(params: RemoveParams): Promise<void>;
  clear(resource: string, signal?: AbortSignal): Promise<void>;
  dispose?(): Promise<void>;
}

export interface SearchDefaults {
  fuzzy?: boolean | number;
  prefix?: boolean;
  fieldBoosts?: Record<string, number>;
}

export interface SearchAdapterConfig {
  pipeline?: import("@searchfn/core").PipelineOptions;
  defaults?: SearchDefaults;
}

export const SEARCH_ADAPTER_DISPOSED = "SEARCH_ADAPTER_DISPOSED";

export class SearchAdapterError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "SearchAdapterError";
    this.code = code;
  }
}
