/**
 * HTTP JSON utilities for parsing and responding
 */

import type { DatafnError } from "@datafn/core";

/**
 * Result type for safe JSON parsing
 */
export type ParseJsonResult =
  | { ok: true; data: unknown }
  | { ok: false; error: DatafnError };

/**
 * Safely parse JSON body from a Request
 * Returns a result envelope instead of throwing
 */
export async function parseJsonBody(req: Request): Promise<ParseJsonResult> {
  try {
    const text = await req.text();
    if (!text || text.trim() === "") {
      // Empty body is valid (parsed as null/undefined depending on use case)
      // But for POST endpoints expecting JSON, empty is invalid
      return {
        ok: false,
        error: {
          code: "DFQL_INVALID",
          message: "Invalid JSON",
          details: { path: "$" },
        },
      };
    }
    const data = JSON.parse(text);
    return { ok: true, data };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: "DFQL_INVALID",
        message: "Invalid JSON",
        details: { path: "$" },
      },
    };
  }
}

/**
 * Legacy function for backwards compatibility - throws on parse failure
 * @deprecated Use parseJsonBody which returns a result envelope
 */
export async function parseJsonBodyOrThrow(req: Request): Promise<unknown> {
  const result = await parseJsonBody(req);
  if (!result.ok) {
    throw new Error("Invalid JSON");
  }
  return result.data;
}

/**
 * Create a JSON Response with proper headers
 */
export function jsonResponse(body: unknown, status: number = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

/**
 * Get parsed body from context (set by withAuth) or parse from request
 * Handlers should prefer using ctx.parsedBody when available to avoid re-parsing
 */
export async function getBodyFromContext(
  req: Request,
  ctx?: { parsedBody?: unknown }
): Promise<ParseJsonResult> {
  // If context has parsedBody, use it (already parsed by withAuth middleware)
  if (ctx && ctx.parsedBody !== undefined) {
    return { ok: true, data: ctx.parsedBody };
  }

  // Fallback to parsing (for cases where withAuth wasn't used or body wasn't parsed)
  return parseJsonBody(req);
}
