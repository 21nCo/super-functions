import type { DatafnTemporalClause } from "./temporal.js";
import type { SortInputTerm } from "./sort.js";

export type DfqlSort = SortInputTerm[];

export type DfqlCursor = {
  after?: Record<string, unknown>;
  before?: Record<string, unknown>;
};

export type DfqlQuery = {
  resource: string;
  version: number;
  relation?: string;
  id?: string;
  select?: string[];
  omit?: string[];
  filters?: Record<string, unknown>;
  search?: Record<string, unknown>;
  sort?: DfqlSort;
  limit?: number;
  offset?: number;
  cursor?: DfqlCursor;
  count?: boolean;
  groupBy?: string[];
  aggregations?: Record<string, unknown>;
  having?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  temporal?: DatafnTemporalClause | readonly DatafnTemporalClause[];
  // QRY-001: AbortSignal for cancellable queries
  signal?: AbortSignal;
};

export type DfqlQueryFragment = Omit<DfqlQuery, "resource" | "version">;

export type DfqlMutation = {
  resource: string;
  version: number;
  operation: string;
  id?: string | string[];
  record?: object;
  records?: Array<Record<string, unknown>>;
  clientId?: string;
  mutationId?: string;
  timestamp?: number | string;
  context?: unknown;
  relations?: DfqlRelations;
  if?: Record<string, unknown>;
  cascade?: unknown;
  // MUT-001: When true, suppress event emission and signal refresh
  silent?: boolean;
  // MUT-002: When true, marks mutation as system-initiated (propagated in event payload)
  system?: boolean;
  // DEB-001: Debounce key for mutation coalescing
  debounceKey?: string;
  // DEB-001: Debounce delay in milliseconds (default: 1500)
  debounceMs?: number;
};

export type DfqlMutationFragment = Omit<DfqlMutation, "resource" | "version">;

export type DfqlRelationRef =
  | string
  | {
      $ref: string;
      [metadata: string]: unknown;
    };

export type DfqlRelationPayload =
  | DfqlRelationRef
  | readonly DfqlRelationRef[];

export type DfqlRelations = Record<string, DfqlRelationPayload>;

export type DfqlTransactStep =
  | { query: DfqlQuery; mutation?: never }
  | { mutation: DfqlMutation; query?: never };

export type DfqlTransact = {
  transactionId?: string;
  atomic?: boolean;
  steps: DfqlTransactStep[];
};
