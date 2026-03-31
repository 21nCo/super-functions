/**
 * PostgresAdapter — Full-text search adapter using Postgres-native tsvector/tsquery.
 *
 * Supports: index (upsert), search, searchAll, remove, clear, initialize, dispose.
 * Resilience: configurable timeout, bounded retries with jitter for transient errors.
 */
import { Pool } from "pg";
import type {
  SearchAdapter,
  SearchAdapterCapabilities,
  SearchDefaults,
  IndexParams,
  SearchParams,
  RemoveParams,
  SearchAllParams,
  SearchAllResult,
  InitializeParams,
} from "@searchfn/adapter-contracts";
import { SearchAdapterError, SEARCH_ADAPTER_DISPOSED } from "@searchfn/adapter-contracts";
import { ensureMetaTable, ensureResourceTable } from "./postgres-schema";
import { buildUpsertQuery, buildDeleteQuery, buildSearchQuery, buildClearQuery } from "./postgres-sql";
import type { UpsertRow } from "./postgres-sql";
import { redactSensitive } from "./internal/redaction";
import { runWithRetry, type RetryPolicy } from "./internal/retry";
import { retryBudgetExhaustedError, withRedactedErrorMessage } from "./internal/errors";

export type PostgresRetryPolicy = RetryPolicy;

export interface PostgresAdapterLogger {
  debug(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

export interface PostgresAdapterOptions {
  connectionString: string;
  schema?: string;
  /** Query timeout in milliseconds. Default: 30000 */
  queryTimeoutMs?: number;
  /** Retry policy for transient DB errors. */
  retry?: PostgresRetryPolicy;
  /** Maximum documents per index batch. Default: 10000 */
  maxBatchSize?: number;
  /** Optional structured logger for observability hooks. */
  logger?: PostgresAdapterLogger;
  /** Construct-time defaults applied when query params are omitted. */
  defaults?: SearchDefaults;
}

/** Postgres error codes that are considered transient/retryable. */
const RETRYABLE_PG_CODES = new Set([
  "08000", // connection_exception
  "08003", // connection_does_not_exist
  "08006", // connection_failure
  "40001", // serialization_failure
  "40P01", // deadlock_detected
  "57014", // query_canceled (timeout)
  "57P03", // cannot_connect_now
  "53300", // too_many_connections
]);

function isRetryable(err: unknown): boolean {
  if (err && typeof err === "object" && "code" in err) {
    return RETRYABLE_PG_CODES.has((err as { code: string }).code);
  }
  if (err instanceof Error && err.message.includes("ECONNREFUSED")) return true;
  if (err instanceof Error && err.message.includes("ETIMEDOUT")) return true;
  return false;
}

function coerceId(value: string): string | number {
  if (/^(0|[1-9]\d*)$/.test(value)) {
    const parsed = Number(value);
    if (Number.isSafeInteger(parsed) && String(parsed) === value) {
      return parsed;
    }
  }
  return value;
}

const MAX_SAFE_POSTGRES_PARAMS = 60_000;

export class PostgresAdapter implements SearchAdapter {
  readonly name = "postgres";
  readonly capabilities: SearchAdapterCapabilities = {
    persistent: true,
    searchAll: true,
    fuzzy: true,
    fieldBoosts: false,
    prefix: true,
  };

  private pool: Pool | null = null;
  private disposed = false;
  private readonly knownResources = new Map<string, string[]>();
  private readonly queryTimeoutMs: number;
  private readonly maxBatchSize: number;
  private readonly defaults: SearchDefaults;

  constructor(private readonly options: PostgresAdapterOptions) {
    this.queryTimeoutMs = options.queryTimeoutMs ?? 30_000;
    this.maxBatchSize = options.maxBatchSize ?? 10_000;
    this.defaults = options.defaults ?? {};
  }

  private assertNotDisposed(): void {
    if (this.disposed) {
      throw new SearchAdapterError(
        SEARCH_ADAPTER_DISPOSED,
        "Search adapter is disposed. Call initialize() before use.",
      );
    }
  }

  private getPool(): Pool {
    if (!this.pool) {
      this.pool = new Pool({
        connectionString: this.options.connectionString,
        statement_timeout: this.queryTimeoutMs,
        max: 10,
      });
    }
    return this.pool;
  }

  private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await runWithRetry(fn, {
        policy: this.options.retry,
        isRetryableError: isRetryable,
        exhaustedError: retryBudgetExhaustedError(),
        onRetry: ({ attempt, delayMs, reason }) => {
          this.options.logger?.warn(
            "adapter.retry",
            redactSensitive({
              backend: "postgres",
              attempt,
              delayMs,
              reason,
            }),
          );
        },
      });
    } catch (error) {
      if (error instanceof SearchAdapterError) throw error;
      throw withRedactedErrorMessage("Postgres operation failed", error);
    }
  }

  async initialize({ resources }: InitializeParams): Promise<void> {
    if (this.disposed) {
      this.disposed = false;
      this.pool = null;
    }

    const pool = this.getPool();
    const nextKnownResources = new Map<string, string[]>();

    await this.withRetry(async () => {
      await ensureMetaTable(pool, this.options.schema);
      for (const { name, searchFields } of resources) {
        await ensureResourceTable(pool, name, searchFields, this.options.schema);
        nextKnownResources.set(name, searchFields);
      }
    });
    this.knownResources.clear();
    for (const [name, searchFields] of nextKnownResources.entries()) {
      this.knownResources.set(name, searchFields);
    }
  }

  async index({ resource, documents, signal }: IndexParams): Promise<void> {
    this.assertNotDisposed();
    if (documents.length === 0) return;

    const pool = this.getPool();

    // Process in batches
    for (let offset = 0; offset < documents.length; offset += this.maxBatchSize) {
      if (signal?.aborted) {
        throw new SearchAdapterError("DFQL_ABORTED", "Index operation aborted");
      }

      const chunk = documents.slice(offset, offset + this.maxBatchSize);

      // Build upsert rows: one row per (docId, fieldName)
      const rows: UpsertRow[] = [];
      const docIds = new Set<string>();

      for (const doc of chunk) {
        const docId = String(doc.id);
        docIds.add(docId);
        for (const [fieldName, fieldValue] of Object.entries(doc.fields)) {
          rows.push({ docId, fieldName, fieldValue });
        }
      }

      await this.withRetry(async () => {
        const client = await pool.connect();
        try {
          await client.query("BEGIN");

          // Delete existing rows for these doc_ids to ensure clean upsert
          const deleteIds = Array.from(docIds);
          for (let i = 0; i < deleteIds.length; i += MAX_SAFE_POSTGRES_PARAMS) {
            const deleteBatch = deleteIds.slice(i, i + MAX_SAFE_POSTGRES_PARAMS);
            const q = buildDeleteQuery(resource, deleteBatch, this.options.schema);
            await client.query(q.text, q.values);
          }

          // Insert new rows in sub-batches to avoid parameter limit (65535)
          const maxParamsPerQuery = MAX_SAFE_POSTGRES_PARAMS;
          const paramsPerRow = 3;
          const subBatchSize = Math.floor(maxParamsPerQuery / paramsPerRow);

          for (let i = 0; i < rows.length; i += subBatchSize) {
            const subBatch = rows.slice(i, i + subBatchSize);
            const q = buildUpsertQuery(resource, subBatch, this.options.schema);
            await client.query(q.text, q.values);
          }

          await client.query("COMMIT");
        } catch (err) {
          await client.query("ROLLBACK");
          throw err;
        } finally {
          client.release();
        }
      });
    }
  }

  async search(params: SearchParams): Promise<Array<string | number>> {
    this.assertNotDisposed();

    const pool = this.getPool();
    const limit = Math.max(1, params.limit ?? 10);
    const effectivePrefix = params.prefix ?? this.defaults.prefix;
    const effectiveFuzzy = params.fuzzy ?? this.defaults.fuzzy;

    // Check if table exists by trying to query - return empty for unknown resource
    const result = await this.withRetry(async () => {
      const q = buildSearchQuery(params.resource, params.query, {
        fields: params.fields,
        limit,
        fuzzy: effectiveFuzzy,
        prefix: effectivePrefix,
        schema: this.options.schema,
      });
      try {
        return await pool.query(q.text, q.values);
      } catch (err) {
        // Table doesn't exist - return empty
        if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "42P01") {
          return { rows: [] };
        }
        throw err;
      }
    });

    return result.rows.map((row: { doc_id: string }) => coerceId(row.doc_id));
  }

  async searchAll(params: SearchAllParams): Promise<SearchAllResult[]> {
    this.assertNotDisposed();

    const pool = this.getPool();
    const limit = params.limit ?? 10;
    const limitPerResource = params.limitPerResource ?? limit;
    const effectivePrefix = params.prefix ?? this.defaults.prefix;
    const effectiveFuzzy = params.fuzzy ?? this.defaults.fuzzy;

    // Determine resources to search
    let resources: string[];
    if (params.resources && params.resources.length > 0) {
      resources = params.resources;
    } else {
      resources = Array.from(this.knownResources.keys());
    }

    const allResults: SearchAllResult[] = [];

    for (const resource of resources) {
      if (params.signal?.aborted) {
        throw new SearchAdapterError("DFQL_ABORTED", "SearchAll operation aborted");
      }

      const result = await this.withRetry(async () => {
        const q = buildSearchQuery(resource, params.query, {
          fields: params.fields,
          limit: limitPerResource,
          fuzzy: effectiveFuzzy,
          prefix: effectivePrefix,
          schema: this.options.schema,
        });
        try {
          return await pool.query(q.text, q.values);
        } catch (err) {
          if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "42P01") {
            return { rows: [] };
          }
          throw err;
        }
      });

      for (const row of result.rows) {
        allResults.push({
          resource,
          id: coerceId(row.doc_id),
          score: parseFloat(row.score),
        });
      }
    }

    // Deterministic sort: score DESC, resource ASC, id ASC
    allResults.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.resource !== b.resource) return a.resource < b.resource ? -1 : 1;
      const aId = String(a.id);
      const bId = String(b.id);
      return aId < bId ? -1 : aId > bId ? 1 : 0;
    });

    return allResults.slice(0, limit);
  }

  async remove({ resource, ids, signal }: RemoveParams): Promise<void> {
    this.assertNotDisposed();
    if (ids.length === 0) return;

    if (signal?.aborted) {
      throw new SearchAdapterError("DFQL_ABORTED", "Remove operation aborted");
    }

    const pool = this.getPool();

    await this.withRetry(async () => {
      const q = buildDeleteQuery(resource, ids, this.options.schema);
      try {
        await pool.query(q.text, q.values);
      } catch (err) {
        // Table doesn't exist - idempotent, no-op
        if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "42P01") {
          return;
        }
        throw err;
      }
    });
  }

  async clear(resource: string, signal?: AbortSignal): Promise<void> {
    this.assertNotDisposed();

    if (signal?.aborted) {
      throw new SearchAdapterError("DFQL_ABORTED", "Clear operation aborted");
    }

    const pool = this.getPool();

    await this.withRetry(async () => {
      const q = buildClearQuery(resource, this.options.schema);
      try {
        await pool.query(q.text, q.values);
      } catch (err) {
        // Table doesn't exist - idempotent, no-op
        if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "42P01") {
          return;
        }
        throw err;
      }
    });
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    this.knownResources.clear();
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }
}
