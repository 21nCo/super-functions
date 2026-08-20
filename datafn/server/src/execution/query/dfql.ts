/**
 * DFQL type definitions
 */

import type { DatafnTemporalClause } from "@datafn/core";

import type { SortInputTerm } from "@datafn/core";

export interface DFQLQuery {
  resource: string;
  version: number;
  select?: string[];
  omit?: string[];
  filters?: Record<string, unknown>;
  sort?: SortInputTerm[];
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
  metadata?: Record<string, unknown>;
  temporal?: DatafnTemporalClause | readonly DatafnTemporalClause[];
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
