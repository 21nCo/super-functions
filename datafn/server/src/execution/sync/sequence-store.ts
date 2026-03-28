/**
 * SequenceStore - Pluggable sequence generation for serverSeq
 * 
 * Supports multiple backends:
 * - Redis: Uses atomic INCR for high-performance sequence generation
 * - KV Store: Uses atomic incr if available
 * - Database: Uses CAS retry loop
 */

import type { Adapter } from "@superfunctions/db";
import type { RedisAdapter, KVStoreAdapter } from "@superfunctions/db";
import { ensureInternalTable } from "../internal-tables.js";
import type { DatafnLogger } from "../../logger.js";
import { withAdapterNamespaceLock } from "./namespace-lock.js";

/**
 * Interface for sequence generation stores
 */
export interface SequenceStore {
  /** Get and increment sequence atomically, returns the next value */
  getNext(namespace: string): Promise<number>;

  /** Get and increment sequence atomically by count, returns array of contiguous values */
  getNextN(namespace: string, count: number): Promise<number[]>;

  /** Get current sequence value (without incrementing) */
  getCurrent(namespace: string): Promise<number>;

  /** Check if the store is healthy/available */
  isHealthy?(): Promise<boolean>;
}

/**
 * Redis-based sequence store using atomic INCR
 */
export class RedisSequenceStore implements SequenceStore {
  private keyPrefix = "serverSeq";

  constructor(private redis: RedisAdapter) {}

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
    const end = await this.redis.incr(key, count);
    const start = end - count + 1;
    return Array.from({ length: count }, (_, i) => start + i);
  }

  async getCurrent(namespace: string): Promise<number> {
    const key = this.getKey(namespace);
    const value = await this.redis.get(key);
    return value ? parseInt(value, 10) : 0;
  }

  async isHealthy(): Promise<boolean> {
    return await this.redis.isHealthy();
  }
}

/**
 * KV Store-based sequence store using atomic incr
 */
export class KVSequenceStore implements SequenceStore {
  private keyPrefix = "serverSeq";

  constructor(private kvStore: KVStoreAdapter) {
    if (!kvStore.incr) {
      throw new Error("KV store does not support incr() - cannot use for sequence generation");
    }
  }

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
    const result = await this.kvStore.incr!({ key, by: count });
    const end = result.value;
    const start = end - count + 1;
    return Array.from({ length: count }, (_, i) => start + i);
  }

  async getCurrent(namespace: string): Promise<number> {
    const key = this.getKey(namespace);
    const value = await this.kvStore.get(key);
    return value ? parseInt(value, 10) : 0;
  }
}

/**
 * Database-based sequence store using CAS retry loop
 * Uses the main database adapter
 */
export class DatabaseSequenceStore implements SequenceStore {
  private ensured = false;

  constructor(private db: Adapter, private logger?: DatafnLogger) {}

  /**
   * DI-003: Ensure next_server_seq in meta is at least (minSeq + 1).
   * Called by ChainedSequenceStore during primary→database failover to prevent duplicate sequences.
   */
  async ensureMinSeq(namespace: string, minSeq: number): Promise<void> {
    if (!this.ensured) {
      await ensureInternalTable(this.db, "__datafn_meta");
      this.ensured = true;
    }
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
      if (!this.ensured) {
        await ensureInternalTable(this.db, "__datafn_meta");
        this.ensured = true;
      }

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
    if (!this.ensured) {
      await ensureInternalTable(this.db, "__datafn_meta");
      this.ensured = true;
    }

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
  private lastKnownPrimarySeq = new Map<string, number>();

  constructor(
    private primary: SequenceStore,
    private secondary: SequenceStore,
    private logger?: DatafnLogger,
  ) {}

  async getNext(namespace: string): Promise<number> {
    return (await this.getNextN(namespace, 1))[0];
  }

  /**
   * DI-003: Sync the secondary (DB) store to start from at least lastKnownPrimarySeq+1.
   * Prevents duplicate sequences after Redis→DB failover.
   */
  private async syncSecondaryOnFailover(namespace: string): Promise<void> {
    const lastKnown = this.lastKnownPrimarySeq.get(namespace);
    if (lastKnown !== undefined && lastKnown > 0 && this.secondary instanceof DatabaseSequenceStore) {
      await this.secondary.ensureMinSeq(namespace, lastKnown);
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
      const seqs = await this.primary.getNextN(namespace, count);
      // DI-003: Track the highest seq issued by the primary
      this.lastKnownPrimarySeq.set(namespace, seqs[seqs.length - 1]);
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
export interface DbMapping {
  /** Which database to use for serverSeq generation (default: "db") */
  serverseq?: "redis" | "kv" | "db";
  /** Which database to use for rate limiting (default: "db") */
  ratelimiting?: "redis" | "kv" | "db";
  /** Which database to use for caching (default: "db") */
  cache?: "redis" | "kv" | "db";
}

/**
 * Create appropriate sequence store based on configuration
 */
export function createSequenceStore(config: {
  db?: Adapter;
  redis?: RedisAdapter;
  kvStore?: KVStoreAdapter;
  dbMapping?: DbMapping;
  logger?: DatafnLogger;
}): SequenceStore | undefined {
  const { db, redis, kvStore, dbMapping, logger } = config;
  const mapping = dbMapping?.serverseq || "db";

  if (!db) {
    return undefined;
  }

  const dbSequenceStore = new DatabaseSequenceStore(db, logger);

  if (mapping === "redis" && redis) {
    const primary = new RedisSequenceStore(redis);
    return new ChainedSequenceStore(primary, dbSequenceStore, logger);
  }

  if (mapping === "kv" && kvStore) {
    if (!kvStore.incr) {
      logger?.warn("KV store does not support incr(), using database sequence path for serverSeq", {
        operation: "createSequenceStore",
      });
      return dbSequenceStore;
    }
    const primary = new KVSequenceStore(kvStore);
    return new ChainedSequenceStore(primary, dbSequenceStore, logger);
  }

  return dbSequenceStore;
}
