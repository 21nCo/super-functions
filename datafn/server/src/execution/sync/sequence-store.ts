/**
 * SequenceStore - Pluggable sequence generation for serverSeq
 * 
 * Supports multiple backends:
 * - Atomic store: Uses atomic INCR for high-performance sequence generation
 * - Database: Uses CAS retry loop
 */

import type { Adapter } from "@superfunctions/db";
import type { AtomicKVStoreAdapter, RuntimeStores } from "@superfunctions/db";
import { ensureInternalTable } from "../internal-tables.js";
import type { DatafnLogger } from "../../logger.js";
import { withAdapterNamespaceLock } from "./namespace-lock.js";

/**
 * Interface for sequence generation stores
 */
export interface SequenceStore {
  /** Initialize durable backing storage before an enclosing transaction. */
  ensureReady?(): Promise<void>;

  /** Get and increment sequence atomically, returns the next value */
  getNext(namespace: string): Promise<number>;

  /** Get and increment sequence atomically by count, returns array of contiguous values */
  getNextN(namespace: string, count: number): Promise<number[]>;

  /** Get current sequence value (without incrementing) */
  getCurrent(namespace: string): Promise<number>;

  /** Ensure the current sequence is at least minSeq. */
  ensureMinSeq?(namespace: string, minSeq: number): Promise<void>;

  /** Return an equivalent store bound to a transaction-scoped adapter. */
  withDb?(db: Adapter): SequenceStore;

  /** Check if the store is healthy/available */
  isHealthy?(): Promise<boolean>;
}

/**
 * Atomic-store-based sequence store using atomic INCR
 */
export class AtomicSequenceStore implements SequenceStore {
  private keyPrefix = "serverSeq";

  constructor(private atomicStore: AtomicKVStoreAdapter) {}

  private getKey(namespace: string): string {
    return `${this.keyPrefix}:${namespace}`;
  }

  async getNext(namespace: string): Promise<number> {
    return (await this.getNextN(namespace, 1))[0];
  }

  async getNextN(namespace: string, count: number): Promise<number[]> {
    if (!Number.isInteger(count) || count < 1 || count > 1000) {
      throw new Error("count must be a positive integer between 1 and 1000");
    }
    const key = this.getKey(namespace);
    const result = await this.atomicStore.incr({ key, by: count });
    const end = result.value;
    const start = end - count + 1;
    return Array.from({ length: count }, (_, i) => start + i);
  }

  async getCurrent(namespace: string): Promise<number> {
    const key = this.getKey(namespace);
    const value = await this.atomicStore.get(key);
    return value ? parseInt(value, 10) : 0;
  }

  async ensureMinSeq(namespace: string, minSeq: number): Promise<void> {
    const key = this.getKey(namespace);
    let current = await this.getCurrent(namespace);
    while (current < minSeq) {
      const by = Math.min(minSeq - current, 1000);
      current = (await this.atomicStore.incr({ key, by })).value;
    }
  }

  async isHealthy(): Promise<boolean> {
    return await this.atomicStore.isHealthy?.() ?? true;
  }
}

/**
 * Database-based sequence store using CAS retry loop
 * Uses the main database adapter
 */
export class DatabaseSequenceStore implements SequenceStore {
  private ensured = false;

  constructor(
    private db: Adapter,
    private logger?: DatafnLogger,
    ensured = false,
  ) {
    this.ensured = ensured;
  }

  withDb(db: Adapter): SequenceStore {
    return new DatabaseSequenceStore(db, this.logger, this.ensured);
  }

  async ensureReady(): Promise<void> {
    if (!this.ensured) {
      await ensureInternalTable(this.db, "__datafn_meta");
      this.ensured = true;
    }
  }

  /**
   * DI-003: Ensure next_server_seq in meta is at least (minSeq + 1).
   * Called by ChainedSequenceStore during primary→database failover to prevent duplicate sequences.
   */
  async ensureMinSeq(namespace: string, minSeq: number): Promise<void> {
    await this.ensureReady();
    const needed = minSeq + 1;
    try {
      await withAdapterNamespaceLock(this.db, namespace, async () => {
        const meta = await this.db.internal.findOne("__datafn_meta", [
          { field: "namespace", op: "eq", value: namespace },
        ]);
        if (!meta) {
          try {
            await this.db.internal.create("__datafn_meta", {
              id: `meta:${namespace}`,
              namespace,
              next_server_seq: needed,
            });
          } catch {
            const currentMeta = await this.db.internal.findOne("__datafn_meta", [
              { field: "namespace", op: "eq", value: namespace },
            ]);
            const current = (currentMeta?.next_server_seq as number) || 1;
            if (current < needed) {
              await this.db.internal.update(
                "__datafn_meta",
                [
                  { field: "namespace", op: "eq", value: namespace },
                  { field: "next_server_seq", op: "eq", value: current },
                ],
                { next_server_seq: needed },
              );
            }
          }
        } else {
          const current = (meta.next_server_seq as number) || 1;
          if (current < needed) {
            await this.db.internal.update(
              "__datafn_meta",
              [
                { field: "namespace", op: "eq", value: namespace },
                { field: "next_server_seq", op: "eq", value: current },
              ],
              { next_server_seq: needed },
            );
          }
        }
      });
    } catch (error) {
      this.logger?.warn("Failed to ensureMinSeq during failover", {
        error: String(error),
        operation: "ensureMinSeq",
      });
    }
  }

  async getNext(namespace: string): Promise<number> {
    return (await this.getNextN(namespace, 1))[0];
  }

  async getNextN(namespace: string, count: number): Promise<number[]> {
    if (!Number.isInteger(count) || count < 1 || count > 1000) {
      throw new Error("count must be a positive integer between 1 and 1000");
    }

    return await withAdapterNamespaceLock(this.db, namespace, async () => {
      await this.ensureReady();

      const MAX_RETRIES = 10;

      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
          const meta = await this.db.internal.findOne("__datafn_meta", [
            { field: "namespace", op: "eq", value: namespace },
          ]);

          if (!meta) {
            try {
              await this.db.internal.create("__datafn_meta", {
                id: `meta:${namespace}`,
                namespace: namespace,
                next_server_seq: 1 + count,
              });
              return Array.from({ length: count }, (_, i) => 1 + i);
            } catch (error) {
              this.logger?.warn("Sequence allocation create retry", {
                attempt,
                error: String(error),
                operation: "seq-create",
              });
              continue;
            }
          } else {
            const currentSeq = (meta.next_server_seq as number) || 1;

            try {
              const affected = await this.db.internal.update(
                "__datafn_meta",
                [
                  { field: "namespace", op: "eq", value: namespace },
                  { field: "next_server_seq", op: "eq", value: currentSeq },
                ],
                { next_server_seq: currentSeq + count },
              );

              if (affected === 0) {
                continue;
              }

              return Array.from({ length: count }, (_, i) => currentSeq + i);
            } catch (error) {
              this.logger?.warn("Sequence allocation CAS retry", {
                attempt,
                error: String(error),
                operation: "seq-cas",
              });
              continue;
            }
          }
        } catch (error) {
          if (attempt === MAX_RETRIES - 1) {
            this.logger?.error("Failed to get next serverSeq after max retries", {
              error: String(error),
              operation: "getNextN",
              resource: "__datafn_meta",
            });
            throw new Error("INTERNAL: Failed to allocate serverSeq after maximum retries");
          }
        }
      }

      throw new Error("INTERNAL: Failed to allocate serverSeq after maximum retries");
    });
  }

  async getCurrent(namespace: string): Promise<number> {
    await this.ensureReady();

    try {
      const meta = await this.db.internal.findOne("__datafn_meta", [
        { field: "namespace", op: "eq", value: namespace },
      ]);

      if (!meta) {
        return 0;
      }
      return ((meta.next_server_seq as number) || 1) - 1;
    } catch (error) {
      this.logger?.error("Failed to get current serverSeq", {
        error: String(error),
        operation: "getCurrent",
        resource: "__datafn_meta",
      });
      throw error;
    }
  }
}

/**
 * Chained sequence store that tries primary store first, then uses database.
 * DI-003: Tracks the last known primary sequence per namespace so that on failover
 * the DB store is synced to avoid duplicate sequences.
 */
export class ChainedSequenceStore implements SequenceStore {
  /** DI-003: Track last-issued seq per namespace from the primary store */
  constructor(
    private primary: SequenceStore,
    private secondary: SequenceStore,
    private logger?: DatafnLogger,
    private lastKnownPrimarySeq = new Map<string, number>(),
  ) {}

  withDb(db: Adapter): SequenceStore {
    return new ChainedSequenceStore(
      this.primary,
      this.secondary.withDb?.(db) ?? this.secondary,
      this.logger,
      // Primary allocations are external to the database transaction. Share
      // their high-water marks so a transaction-bound fallback can never
      // allocate an already-issued sequence.
      this.lastKnownPrimarySeq,
    );
  }

  async ensureReady(): Promise<void> {
    await this.secondary.ensureReady?.();
  }

  async getNext(namespace: string): Promise<number> {
    return (await this.getNextN(namespace, 1))[0];
  }

  /**
   * DI-003: Sync the secondary (DB) store to start from at least lastKnownPrimarySeq+1.
   * Prevents duplicate sequences after atomic-store→DB failover.
   */
  private async syncSecondaryOnFailover(namespace: string): Promise<void> {
    const lastKnown = this.lastKnownPrimarySeq.get(namespace);
    if (lastKnown !== undefined && lastKnown > 0 && this.secondary instanceof DatabaseSequenceStore) {
      await this.secondary.ensureMinSeq(namespace, lastKnown);
    }
  }

  private async syncPrimaryIfBehindSecondary(namespace: string): Promise<boolean> {
    if (!(this.secondary instanceof DatabaseSequenceStore)) {
      return false;
    }

    const [primaryCurrent, secondaryCurrent] = await Promise.all([
      this.primary.getCurrent(namespace),
      this.secondary.getCurrent(namespace),
    ]);

    if (primaryCurrent >= secondaryCurrent) {
      return false;
    }

    this.logger?.warn("Primary sequence store behind database sequence; synchronizing primary", {
      operation: "seq-primary-sync",
      namespace,
      primaryCurrent,
      secondaryCurrent,
    });

    if (!this.primary.ensureMinSeq) {
      return true;
    }

    await this.primary.ensureMinSeq(namespace, secondaryCurrent);
    return false;
  }

  private async persistPrimaryHighWater(namespace: string, seq: number): Promise<void> {
    if (!(this.secondary instanceof DatabaseSequenceStore)) {
      return;
    }

    try {
      await this.secondary.ensureMinSeq(namespace, seq);
    } catch (error) {
      this.logger?.warn("Failed to persist primary sequence high water", {
        error: String(error),
        operation: "seq-high-water",
        namespace,
        seq,
      });
    }
  }

  async getNextN(namespace: string, count: number): Promise<number[]> {
    try {
      if (this.primary.isHealthy) {
        const healthy = await this.primary.isHealthy();
        if (!healthy) {
          this.logger?.warn("Primary sequence store unhealthy, using database sequence path", {
            operation: "getNextN",
          });
          // DI-003: Sync DB store to last known primary seq before allocating
          await this.syncSecondaryOnFailover(namespace);
          return await this.secondary.getNextN(namespace, count);
        }
      }
      if (await this.syncPrimaryIfBehindSecondary(namespace)) {
        return await this.secondary.getNextN(namespace, count);
      }
      const seqs = await this.primary.getNextN(namespace, count);
      // DI-003: Track the highest seq issued by the primary
      this.lastKnownPrimarySeq.set(namespace, seqs[seqs.length - 1]);
      await this.persistPrimaryHighWater(namespace, seqs[seqs.length - 1]);
      return seqs;
    } catch (error) {
      this.logger?.warn("Primary sequence store failed, using database sequence path", {
        error: String(error),
        operation: "getNextN",
      });
      // DI-003: Sync DB store to last known primary seq before allocating
      await this.syncSecondaryOnFailover(namespace);
      return await this.secondary.getNextN(namespace, count);
    }
  }

  async getCurrent(namespace: string): Promise<number> {
    try {
      if (this.primary.isHealthy) {
        const healthy = await this.primary.isHealthy();
        if (!healthy) {
          return await this.secondary.getCurrent(namespace);
        }
      }
      return await this.primary.getCurrent(namespace);
    } catch (error) {
      this.logger?.warn("Primary sequence store failed for getCurrent, using database sequence path", {
        error: String(error),
        operation: "getCurrent",
      });
      return await this.secondary.getCurrent(namespace);
    }
  }

  async isHealthy(): Promise<boolean> {
    if (this.primary.isHealthy) {
      return await this.primary.isHealthy();
    }
    return true;
  }
}

/**
 * Database mapping configuration for routing operations to different databases
 */
export interface SequenceStorePolicy {
  mode?: "strict" | "db";
}

/**
 * Create appropriate sequence store based on configuration
 */
export function createSequenceStore(config: {
  db?: Adapter;
  stores?: RuntimeStores;
  policy?: SequenceStorePolicy;
  logger?: DatafnLogger;
}): SequenceStore | undefined {
  const { db, stores, policy, logger } = config;
  const mode = policy?.mode ?? (stores?.atomicKv ? "strict" : "db");

  if (!db) {
    return undefined;
  }

  const dbSequenceStore = new DatabaseSequenceStore(db, logger);

  if (mode === "strict") {
    if (!stores?.atomicKv) {
      throw new Error("DATAFN_ATOMIC_STORE_REQUIRED: serverSeq strict mode requires stores.atomicKv");
    }
    const primary = new AtomicSequenceStore(stores.atomicKv);
    return new ChainedSequenceStore(primary, dbSequenceStore, logger);
  }

  return dbSequenceStore;
}
