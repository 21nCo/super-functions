/**
 * Database-backed idempotency store
 * Provides durable mutation deduplication using adapter storage
 */

import type { Adapter } from "@superfunctions/db";
import type { IdempotencyStore, MutationResult } from "./idempotency.js";

/**
 * Adapter-backed idempotency store for durable deduplication
 */
export class DbIdempotencyStore implements IdempotencyStore {
  constructor(
    private db: Adapter,
    private namespace: string = "datafn",
  ) {}

  async get(
    clientId: string,
    mutationId: string,
  ): Promise<MutationResult | null> {
    try {
      const record = await this.db.findOne({
        model: "__datafn_idempotency",
        where: [
          { field: "namespace", operator: "eq", value: this.namespace },
          { field: "clientId", operator: "eq", value: clientId },
          { field: "mutationId", operator: "eq", value: mutationId },
        ],
        namespace: this.namespace,
      });

      if (!record) {
        return null;
      }

      // Parse stored JSON result
      return JSON.parse(record.result as string);
    } catch (error) {
      // On error, treat as cache miss
      return null;
    }
  }

  async set(
    clientId: string,
    mutationId: string,
    result: MutationResult,
  ): Promise<void> {
    try {
      await this.db.create({
        model: "__datafn_idempotency",
        data: {
          id: `${this.namespace}:${clientId}:${mutationId}`,
          namespace: this.namespace,
          clientId,
          mutationId,
          result: JSON.stringify(result),
          createdAt: new Date().toISOString(),
        },
        namespace: this.namespace,
      });
    } catch (error) {
      // Silently fail - idempotency is best-effort
      // Duplicate key errors are expected on replay
    }
  }
}
