/**
 * POST /datafn/seed endpoint
 * Accepts clientId for dataset initialization
 */

import { okResponse, errorResponse } from "../http/errors.js";
import { getBodyFromContext } from "../http/json.js";
import type { Adapter } from "@superfunctions/db";
import { ensureInternalTable } from "../execution/internal-tables.js";
import type { DatafnLogger } from "../logger.js";

/**
 * Create seed route handler
 * SEC-011: Accepts extractNamespace to derive namespace from auth context
 */
export function createSeedHandler(
  db?: Adapter,
  extractNamespace?: (ctx: any) => Promise<string>,
  logger?: DatafnLogger,
) {
  return async (req: Request, ctx?: { parsedBody?: unknown }): Promise<Response> => {
    // SEC-011: Derive namespace from auth context, not hardcoded
    const namespace = extractNamespace ? await extractNamespace(ctx) : "datafn";
    // Get body from context (pre-parsed by withAuth) or parse from request
    const parseResult = await getBodyFromContext(req, ctx);
    if (!parseResult.ok) {
      return errorResponse(parseResult.error);
    }
    const body = parseResult.data;

    // Validate body is an object
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return errorResponse({
        code: "DFQL_INVALID",
        message: "Invalid DFQL: clientId must be string",
        details: { path: "clientId" },
      });
    }

    // Validate clientId exists and is a string
    const payload = body as Record<string, unknown>;
    if (typeof payload.clientId !== "string") {
      return errorResponse({
        code: "DFQL_INVALID",
        message: "Invalid DFQL: clientId must be string",
        details: { path: "clientId" },
      });
    }

    const clientId = payload.clientId as string;

    // Persist seed execution in __datafn_seed for idempotency (SERVER-SEED-001)
    if (db) {
      await ensureInternalTable(db, "__datafn_seed");
      try {
        // Check if seed already exists for this namespace
        const existing = await db.internal.findOne("__datafn_seed", [
          { field: "namespace", op: "eq", value: namespace },
        ]);

        if (!existing) {
          // Create seed record
          // Use payload timestamp if provided, else use 0 for determinism (DETERM-001)
          const timestamp = typeof payload.timestamp === "number" ? payload.timestamp : 0;
          await db.internal.create("__datafn_seed", {
            id: `seed:${namespace}`,
            namespace,
            seed_id: `seed:${namespace}`,
            status: "completed",
            created_at: new Date(timestamp).toISOString(),
          });
        }
        // If exists, seed is idempotent - just return success
      } catch (error) {
        // SRV-013: Propagate persistence failures instead of silently ignoring them
        logger?.error("Failed to persist seed", { error: String(error), operation: "seed" });
        return errorResponse({
          code: "INTERNAL",
          message: "Internal error",
          details: { path: "$" },
        }, 500);
      }
    }

    // Success: return acknowledgment
    return okResponse({ ok: true });
  };
}
