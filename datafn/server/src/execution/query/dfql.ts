/**
 * DFQL type definitions
 */

export interface DFQLQuery {
  resource: string;
  version: number;
  select?: string[];
  omit?: string[];
  filters?: Record<string, unknown>;
  sort?: string[];
  limit?: number;
  offset?: number;
  cursor?: {
    after?: Record<string, unknown>;
    before?: Record<string, unknown>;
  };
  count?: boolean;
  groupBy?: string[];
  aggregations?: Record<string, unknown>;
  having?: Record<string, unknown>;
  search?: {
    query: string;
    type?: "fullText" | "semantic";
    fields?: string[];
    topK?: number;
    prefix?: boolean;
    fuzzy?: boolean | number;
    fieldBoosts?: Record<string, number>;
  };
}

export interface QueryResult {
  data: Record<string, unknown>[];
  nextCursor: unknown | null;
  count?: number;
}

export interface AggregateResult {
  groups: Record<string, unknown>[];
  nextCursor: unknown | null;
}
