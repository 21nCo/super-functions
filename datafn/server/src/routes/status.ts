/**
 * GET /datafn/status endpoint
 * Returns server metadata, capabilities, limits, and schema hash
 */

import type { DatafnSchema } from "@datafn/core/types";
import { normalizeDfql } from "@datafn/core";
import { okResponse, errorResponse } from "../http/errors.js";
import { createHash } from "crypto";
import type { Adapter } from "@superfunctions/db";

export interface StatusResult {
  schemaHash: string;
  capabilities: string[];
  limits: {
    maxLimit: number;
    maxTransactSteps?: number;
    maxPayloadBytes?: number;
    maxPullLimit?: number;
  };
  serverTimeMs: number;
}

/**
 * Compute schema hash from validated schema
 * Format: sha256:${hex(sha256(JSON.stringify(normalizeDfql(validatedSchema))))}
 */
export function computeSchemaHash(schema: DatafnSchema): string {
  const normalized = normalizeDfql(schema);
  const json = JSON.stringify(normalized);
  const hash = createHash("sha256").update(json, "utf8").digest("hex");
  return `sha256:${hash}`;
}

/**
 * Create status route handler
 */
export function createStatusHandler(
  validatedSchema: DatafnSchema,
  limits: {
    maxLimit: number;
    maxTransactSteps?: number;
    maxPayloadBytes?: number;
    maxPullLimit?: number;
  },
  getServerTime: () => number = () => Date.now(),
  db?: Adapter,
) {
  const schemaHash = computeSchemaHash(validatedSchema);

  return async (): Promise<Response> => {
    // Check DB health if adapter is configured
    if (db) {
      const health = await db.isHealthy();
      if (!health.healthy) {
        return errorResponse(
          {
            code: "INTERNAL",
            message: "Internal error",
            details: { path: "$" },
          },
          500,
        );
      }
    }

    const result: StatusResult = {
      schemaHash,
      capabilities: [
        "dfql.query",
        "dfql.mutation",
        "dfql.transact",
        "sync.seed",
        "sync.clone",
        "sync.pull",
        "sync.push",
        "sync.reconcile",
      ],
      limits,
      // SRV-008: Round to nearest minute to avoid fingerprinting via exact timestamps
      serverTimeMs: Math.round(getServerTime() / 60000) * 60000,
    };

    return okResponse(result);
  };
}
