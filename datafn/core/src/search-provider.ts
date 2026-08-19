export interface SearchProvider {
  readonly name: string;
  search(params: {
    resource: string;
    query: string;
    type?: "fullText" | "semantic";
    fields?: string[];
    limit?: number;
    prefix?: boolean;
    fuzzy?: boolean | number;
    fieldBoosts?: Record<string, number>;
    namespaceFilter?: string[];
    regionFilter?: string[];
    signal?: AbortSignal;
  }): Promise<string[]>;
  searchAll?(params: {
    query: string;
    resources?: string[];
    fields?: string[];
    limit?: number;
    limitPerResource?: number;
    prefix?: boolean;
    fuzzy?: boolean | number;
    fieldBoosts?: Record<string, number>;
    namespaceFilter?: string[];
    regionFilter?: string[];
    signal?: AbortSignal;
  }): Promise<Array<{ resource: string; id: string; score: number }>>;
  updateIndices(params: {
    resource: string;
    records: Record<string, unknown>[];
    operation: "upsert" | "delete";
  }): Promise<void>;
  /** Clear one resource before a full rebuild so removed documents cannot survive. */
  clearIndices?(resource: string): Promise<void>;
  initialize?(config: {
    resources: Array<{ name: string; searchFields: string[] }>;
  }): Promise<void>;
  dispose?(): Promise<void>;
}
