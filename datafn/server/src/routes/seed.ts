/**
 * POST /datafn/seed endpoint
 * Accepts clientId for dataset initialization
 */

import { okResponse, errorResponse } from "../http/errors.js";
import { getBodyFromContext } from "../http/json.js";
import type { Adapter } from "@superfunctions/db";

/**
 * Create seed route handler
 */
export function createSeedHandler(db?: Adapter, namespace: string = "datafn") {
  return async (req: Request, ctx?: { parsedBody?: unknown }): Promise<Response> => {
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
      try {
        // Check if seed already exists for this namespace
        const existing = await db.findOne({
          model: "__datafn_seed",
          where: [{ field: "namespace", operator: "eq", value: namespace }],
          namespace,
        });

        if (!existing) {
          // Create seed record
          // Use payload timestamp if provided, else use 0 for determinism (DETERM-001)
          const timestamp = typeof payload.timestamp === "number" ? payload.timestamp : 0;
          await db.create({
            model: "__datafn_seed",
            data: {
              id: `seed:${namespace}`,
              namespace,
              seededAtMs: timestamp,
              createdAt: new Date(timestamp).toISOString(), 
            },
            namespace,
          });
        }
        // If exists, seed is idempotent - just return success
      } catch (error) {
        // Log but don't fail - seed persistence is best-effort
        console.error("Failed to persist seed:", error);
      }
    }

    // Success: return acknowledgment
    return okResponse({ ok: true });
  };
}
