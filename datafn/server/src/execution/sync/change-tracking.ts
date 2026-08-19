/**
 * Change tracking service for serverSeq and change log management
 *
 * Implements monotonic serverSeq ordering per namespace and change tracking
 * for sync operations (SERVER-CONFLICT-001, SERVER-SYNC-001/002/003).
 *
 * Internal tables:
 * - __datafn_meta: stores next_server_seq per namespace
 * - __datafn_changes: stores change entries with (namespace, resource, server_seq) index
 *
 * Supports pluggable sequence stores (atomic store or database sequence path) for
 * high-performance serverSeq generation.
 */

import type { Adapter } from "@superfunctions/db";
import type { InternalWhereClause } from "@superfunctions/db/types";
import type { SequenceStore } from "./sequence-store.js";
import { ensureInternalTable } from "../internal-tables.js";
import type { DatafnLogger } from "../../logger.js";
import { withAdapterNamespaceLock } from "./namespace-lock.js";

/** REL-010: Sleep helper for CAS backoff */
const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

/**
 * FIX-REL-002: Shared retry helper for change-tracking writes.
 * Retries up to `maxRetries` times with 50ms/100ms backoff.
 * Used by both execute-mutation and push paths for parity.
 * On final failure, throws so the caller can treat the mutation as failed.
 */
export async function recordChangeWithRetry(
  changeTracking: ChangeTrackingService,
  params: ChangeEntryInput,
  maxRetries = 2,
  logger?: DatafnLogger,
): Promise<void> {
  for (let i = 0; i <= maxRetries; i++) {
    try {
      await changeTracking.recordChange(params);
      return;
    } catch (e) {
      if (i === maxRetries) throw e;
      logger?.warn("Change tracking retry", { attempt: i + 1, maxRetries, error: String(e) });
      await sleep(50 * (i + 1)); // 50ms, 100ms
    }
  }
}

/**
 * FIX-REL-002: Shared retry helper for bulk change-tracking writes.
 * Retries up to `maxRetries` times with 50ms/100ms backoff.
 */
export async function recordChangesWithRetry(
  changeTracking: ChangeTrackingService,
  entries: ChangeEntryInput[],
  maxRetries = 2,
  logger?: DatafnLogger,
): Promise<void> {
  if (entries.length === 0) return;

  for (let i = 0; i <= maxRetries; i++) {
    try {
      await changeTracking.recordChanges(entries);
      return;
    } catch (e) {
      if (i === maxRetries) throw e;
      logger?.warn("Change tracking retry (bulk)", {
        attempt: i + 1,
        maxRetries,
        entryCount: entries.length,
        error: String(e),
      });
      await sleep(50 * (i + 1)); // 50ms, 100ms
    }
  }
}

/**
 * Change entry representing a mutation effect
 */
export interface ChangeEntry {
  namespace: string;
  serverSeq: number;
  resource: string;
  id: string;
  op: "insert" | "merge" | "replace" | "upsert" | "delete";
  record: Record<string, unknown> | null;
}

/**
 * Input type for recording a change entry (without namespace, which is supplied by the service)
 */
export interface ChangeEntryInput {
  serverSeq: number;
  resource: string;
  id: string;
  op: "insert" | "merge" | "replace" | "upsert" | "delete";
  record: Record<string, unknown> | null;
}

/**
 * Service for managing serverSeq and change tracking
 *
 * When a sequenceStore is provided, serverSeq generation uses that store
   * (e.g., a distributed atomic store). Otherwise, uses the database
 * with CAS retry loop.
 */
export class ChangeTrackingService {
  private metaEnsured = false;
  private changesEnsured = false;

  constructor(
    private db: Adapter,
    readonly namespace: string = "datafn",
    private sequenceStore?: SequenceStore,
    private onChange?: (seq: number, namespace: string) => void,
    private logger?: DatafnLogger,
  ) {}

  /**
   * REL-011: Create a new ChangeTrackingService with a different db adapter.
   * Used to run change tracking within a transaction (pass tx db here).
   * The namespace and sequenceStore are inherited from the original instance.
   */
  withDb(txDb: Adapter): ChangeTrackingService {
    return new ChangeTrackingService(txDb, this.namespace, this.sequenceStore, this.onChange, this.logger);
  }

  /**
   * Get and increment serverSeq atomically
   * Returns the next available serverSeq for this namespace
   *
   * Implements SERVER-SEQ-001: atomic monotonic increment per namespace
   *
   * When a sequenceStore is configured, uses that for atomic increment.
   * Otherwise, uses compare-and-swap retry loop with the database.
   */
  async getNextServerSeq(): Promise<number> {
    return (await this.getNextServerSeqBatch(1))[0];
  }

  /**
   * Allocate a batch of contiguous serverSeq values atomically
   */
  async getNextServerSeqBatch(count: number): Promise<number[]> {
    if (this.sequenceStore) {
      return await this.sequenceStore.getNextN(this.namespace, count);
    }
    return await this.getNextServerSeqBatchFromDb(count);
  }

  /**
   * Database-based sequence generation using CAS retry loop
   * Used when no atomic sequence store is configured
   */
  private async getNextServerSeqFromDb(): Promise<number> {
    return (await this.getNextServerSeqBatchFromDb(1))[0];
  }

  private async getNextServerSeqBatchFromDb(count: number): Promise<number[]> {
    return await withAdapterNamespaceLock(this.db, this.namespace, async () => {
      if (!this.metaEnsured) {
        await ensureInternalTable(this.db, "__datafn_meta");
        this.metaEnsured = true;
      }

      const MAX_RETRIES = 10;

      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        // REL-010: Exponential backoff between CAS retries (skip delay on first attempt)
        if (attempt > 0) {
          await sleep(10 * Math.pow(2, attempt - 1));
        }
        try {
          const meta = await this.db.internal.findOne("__datafn_meta", [
            { field: "namespace", op: "eq", value: this.namespace },
          ]);

          if (!meta) {
            try {
              await this.db.internal.create("__datafn_meta", {
                id: `meta:${this.namespace}`,
                namespace: this.namespace,
                next_server_seq: 1 + count,
              });
              return Array.from({ length: count }, (_, i) => 1 + i);
            } catch (createError) {
              continue;
            }
          } else {
            const currentSeq = (meta.next_server_seq as number) || 1;

            try {
              const affected = await this.db.internal.update(
                "__datafn_meta",
                [
                  { field: "namespace", op: "eq", value: this.namespace },
                  { field: "next_server_seq", op: "eq", value: currentSeq },
                ],
                { next_server_seq: currentSeq + count },
              );

              if (affected === 0) {
                // REL-010: CAS failed due to contention — backoff applied on next iteration
                continue;
              }

              return Array.from({ length: count }, (_, i) => currentSeq + i);
            } catch (updateError) {
              continue;
            }
          }
        } catch (error) {
          if (attempt === MAX_RETRIES - 1) {
            this.logger?.error("Failed to get next serverSeq after max retries", {
              error: String(error),
              operation: "getNextServerSeqBatchFromDb",
              resource: "__datafn_meta",
            });
            throw new Error(
              "INTERNAL: Failed to allocate serverSeq after maximum retries",
            );
          }
          this.logger?.warn("Sequence batch CAS retry", {
            attempt,
            error: String(error),
            operation: "seq-batch-cas",
          });
        }
      }

      throw new Error(
        "INTERNAL: Failed to allocate serverSeq after maximum retries",
      );
    });
  }

  /**
   * Record a change entry for a mutation (delegates to recordChanges)
   */
  async recordChange(params: ChangeEntryInput): Promise<void> {
    return this.recordChanges([params]);
  }

  /**
   * Record multiple change entries in a single call.
   * Ensures internal table once. Propagates errors immediately.
   *
   * EXE-018: Uses batched write path when internal.createMany is available.
   * Uses deterministic sequential inserts otherwise.
   */
  async recordChanges(entries: ChangeEntryInput[]): Promise<void> {
    if (entries.length === 0) return;

    if (!this.changesEnsured) {
      await ensureInternalTable(this.db, "__datafn_changes");
      this.changesEnsured = true;
    }

    const now = new Date().toISOString();
    const rows = entries.map((params) => ({
      id: `change:${this.namespace}:${params.serverSeq}:${params.resource}:${params.id}`,
      namespace: this.namespace,
      server_seq: params.serverSeq,
      resource: params.resource,
      record_id: params.id,
      op: params.op,
      record: params.record ? JSON.stringify(params.record) : null,
      created_at: now,
    }));

    // EXE-018: Batch capability detection — use createMany when available
    const hasBatchCapability = typeof this.db.internal.createMany === "function";

    if (hasBatchCapability) {
      this.logger?.debug("recordChanges: using batch insert path", {
        operation: "recordChanges",
        entryCount: entries.length,
      });
      await this.db.internal.createMany!("__datafn_changes", rows);
    } else {
      this.logger?.debug("recordChanges: batch insert unavailable, using sequential path", {
        operation: "recordChanges",
        entryCount: entries.length,
      });
      // Sequential to preserve error-stops-further-writes semantics
      for (const row of rows) {
        await this.db.internal.create("__datafn_changes", row);
      }
    }

    // Fire onChange callbacks after all writes succeed
    if (this.onChange) {
      for (const params of entries) {
        this.onChange(params.serverSeq, this.namespace);
      }
    }
  }

  /**
   * Get the current global serverSeq (latest assigned)
   * Returns 0 if no sequence has been assigned yet
   */
  async getCurrentServerSeq(): Promise<number> {
    // Use sequence store if available
    if (this.sequenceStore) {
      try {
        return await this.sequenceStore.getCurrent(this.namespace);
      } catch (error) {
        this.logger?.warn("Sequence store getCurrent failed, using database sequence path", {
          error: String(error),
          operation: "getCurrentServerSeq",
        });
      }
    }

    // Database sequence path
    if (!this.metaEnsured) {
      await ensureInternalTable(this.db, "__datafn_meta");
      this.metaEnsured = true;
    }

    try {
      const meta = await this.db.internal.findOne("__datafn_meta", [
        { field: "namespace", op: "eq", value: this.namespace },
      ]);

      if (!meta) {
        return 0;
      }
      return ((meta.next_server_seq as number) || 1) - 1;
    } catch (error) {
      // EXE-019: Throw instead of returning 0 (returning 0 would silently mis-sync clients)
      this.logger?.error("Failed to get current serverSeq", {
        error: String(error),
        operation: "getCurrentServerSeq",
        resource: "__datafn_meta",
      });
      throw error;
    }
  }

  /**
   * Get global changes since a given serverSeq
   * Used for global pull (SYNC-PULL-001)
   */
  async getGlobalChanges(params: {
    sinceSeq: number;
    limit: number;
  }): Promise<ChangeEntry[]> {
    if (!this.changesEnsured) {
      await ensureInternalTable(this.db, "__datafn_changes");
      this.changesEnsured = true;
    }

    try {
      const changes = await this.db.internal.findMany(
        "__datafn_changes",
        [
          { field: "namespace", op: "eq", value: this.namespace },
          { field: "server_seq", op: "gt", value: params.sinceSeq },
        ],
        { orderBy: "server_seq", limit: params.limit },
      );

      return changes.map((change) => ({
        namespace: this.namespace,
        serverSeq: change.server_seq as number,
        resource: change.resource as string,
        id: change.record_id as string,
        op: change.op as "insert" | "merge" | "replace" | "upsert" | "delete",
        record: change.record ? JSON.parse(change.record as string) : null,
      }));
    } catch (error) {
      // Propagate error — returning empty would make client believe it's fully synced
      this.logger?.error("Failed to get global changes", {
        error: String(error),
        operation: "getGlobalChanges",
        resource: "__datafn_changes",
      });
      throw error;
    }
  }

  /**
   * Get changes since a given serverSeq for a resource
   * When limit is provided, only that many entries are returned (bounded fetch).
   */
  async getChangesSince(params: {
    resource: string;
    sinceSeq: number;
    limit?: number;
  }): Promise<ChangeEntry[]> {
    if (!this.changesEnsured) {
      await ensureInternalTable(this.db, "__datafn_changes");
      this.changesEnsured = true;
    }

    try {
      const opts: { orderBy: string; limit?: number } = { orderBy: "server_seq" };
      if (params.limit != null && params.limit > 0) {
        opts.limit = params.limit;
      }

      const changes = await this.db.internal.findMany(
        "__datafn_changes",
        [
          { field: "namespace", op: "eq", value: this.namespace },
          { field: "resource", op: "eq", value: params.resource },
          { field: "server_seq", op: "gt", value: params.sinceSeq },
        ],
        opts,
      );

      return changes.map((change) => ({
        namespace: this.namespace,
        serverSeq: change.server_seq as number,
        resource: change.resource as string,
        id: change.record_id as string,
        op: change.op as "insert" | "merge" | "replace" | "upsert" | "delete",
        record: change.record ? JSON.parse(change.record as string) : null,
      }));
    } catch (error) {
      // Propagate error instead of returning empty (which would imply "no changes")
      this.logger?.error("Failed to get changes since", {
        error: String(error),
        operation: "getChangesSince",
        resource: params.resource,
      });
      throw error;
    }
  }

  /**
   * Get global changes after `sinceSeq` filtered to a set of resources.
   * Used by actor-feed sync logic to process permissions/membership/hierarchy updates.
   */
  async getChangesForResourcesSince(params: {
    resources: string[];
    sinceSeq: number;
    limit?: number;
  }): Promise<ChangeEntry[]> {
    if (!this.changesEnsured) {
      await ensureInternalTable(this.db, "__datafn_changes");
      this.changesEnsured = true;
    }
    if (!Array.isArray(params.resources) || params.resources.length === 0) {
      return [];
    }
    try {
      const rows = await this.db.internal.findMany(
        "__datafn_changes",
        [
          { field: "namespace", op: "eq", value: this.namespace },
          { field: "server_seq", op: "gt", value: params.sinceSeq },
          { field: "resource", op: "in" as any, value: params.resources },
        ],
        {
          orderBy: "server_seq",
          ...(typeof params.limit === "number" && params.limit > 0
            ? { limit: params.limit }
            : {}),
        },
      );
      return rows.map((change) => ({
          namespace: this.namespace,
          serverSeq: change.server_seq as number,
          resource: change.resource as string,
          id: change.record_id as string,
          op: change.op as "insert" | "merge" | "replace" | "upsert" | "delete",
          record: change.record ? JSON.parse(change.record as string) : null,
        }));
    } catch (error) {
      this.logger?.error("Failed to get resource-filtered changes", {
        error: String(error),
        operation: "getChangesForResourcesSince",
        resource: "__datafn_changes",
      });
      throw error;
    }
  }

  /**
   * Get latest change entry for a resource/id at or before a given serverSeq.
   */
  async getLatestChangeForRecord(params: {
    resource: string;
    id: string;
    atOrBeforeSeq?: number;
  }): Promise<ChangeEntry | null> {
    if (!this.changesEnsured) {
      await ensureInternalTable(this.db, "__datafn_changes");
      this.changesEnsured = true;
    }
    try {
      const where: InternalWhereClause[] = [
        { field: "namespace", op: "eq", value: this.namespace },
        { field: "resource", op: "eq", value: params.resource },
        { field: "record_id", op: "eq", value: params.id },
      ];
      if (typeof params.atOrBeforeSeq === "number") {
        where.push({
          field: "server_seq",
          op: "lte",
          value: params.atOrBeforeSeq,
        });
      }
      const rows = await this.db.internal.findMany(
        "__datafn_changes",
        where,
        { orderBy: "-server_seq", limit: 1 },
      );
      const change = rows[0];
      if (!change) {
        return null;
      }
      return {
        namespace: this.namespace,
        serverSeq: change.server_seq as number,
        resource: change.resource as string,
        id: change.record_id as string,
        op: change.op as "insert" | "merge" | "replace" | "upsert" | "delete",
        record: change.record ? JSON.parse(change.record as string) : null,
      };
    } catch (error) {
      this.logger?.error("Failed to get latest change for record", {
        error: String(error),
        operation: "getLatestChangeForRecord",
        resource: params.resource,
      });
      throw error;
    }
  }

  /**
   * Delete change entries older than retentionDays for this namespace.
   * Returns the number of rows deleted.
   */
  async pruneChanges(retentionDays: number): Promise<number> {
    if (!this.changesEnsured) {
      await ensureInternalTable(this.db, "__datafn_changes");
      this.changesEnsured = true;
    }
    const cutoff = new Date(Date.now() - retentionDays * 86400000).toISOString();
    return await this.db.internal.delete("__datafn_changes", [
      { field: "namespace", op: "eq", value: this.namespace },
      { field: "created_at", op: "lt", value: cutoff },
    ]);
  }

  /**
   * Get the latest serverSeq for a resource
   * Returns 0 if no changes exist
   */
  async getLatestServerSeq(params: { resource: string }): Promise<number> {
    if (!this.changesEnsured) {
      await ensureInternalTable(this.db, "__datafn_changes");
      this.changesEnsured = true;
    }

    try {
      const changes = await this.db.internal.findMany(
        "__datafn_changes",
        [
          { field: "namespace", op: "eq", value: this.namespace },
          { field: "resource", op: "eq", value: params.resource },
        ],
        { orderBy: "-server_seq", limit: 1 },
      );

      return (changes[0]?.server_seq as number) ?? 0;
    } catch (error) {
      this.logger?.error("Failed to get latest serverSeq", {
        error: String(error),
        operation: "getLatestServerSeq",
        resource: params.resource,
      });
      throw error;
    }
  }
}
