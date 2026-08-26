import type { DatafnError, DatafnSchema } from "./core-types.js";
import type { CrossResourceSearchParams, SearchResult } from "./execution/search/cross-resource.js";

export type DatafnExecutorAction = "query" | "mutation" | "transact" | "search";

export class DatafnExecutorError extends Error {
  readonly code: string;
  readonly details?: unknown;
  readonly status: number;

  constructor(error: DatafnError | { code: string; message: string; details?: unknown }, status = 400) {
    super(error.message);
    this.name = "DatafnExecutorError";
    this.code = error.code;
    this.details = error.details;
    this.status = status;
  }
}

/**
 * Transport-neutral DataFn execution surface.
 *
 * Every operation enters the same route handlers used by HTTP, including schema
 * validation, field authorization, namespace/actor resolution, hooks,
 * idempotency, limits, configured authorization, and rate limiting.
 */
export interface DatafnExecutor<TContext = unknown> {
  readonly schema: DatafnSchema;
  query<TResult = unknown>(payload: unknown, context?: TContext): Promise<TResult>;
  mutate<TResult = unknown>(payload: unknown, context?: TContext): Promise<TResult>;
  transact<TResult = unknown>(payload: unknown, context?: TContext): Promise<TResult>;
  search(
    payload: CrossResourceSearchParams,
    context?: TContext,
  ): Promise<SearchResult>;
}
