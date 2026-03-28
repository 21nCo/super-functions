import { errorResponse } from "./errors.js";
import type { DatafnLogger } from "../logger.js";

/**
 * Check payload size against Content-Length header.
 * Returns an error Response if over limit, or null if OK.
 */
export function checkPayloadLimit(req: Request, maxBytes: number): Response | null {
  const contentLength = req.headers.get("content-length");
  if (contentLength) {
    const length = parseInt(contentLength, 10);
    if (!isNaN(length) && length > maxBytes) {
      return errorResponse({
        code: "LIMIT_EXCEEDED",
        message: "Request payload exceeds maximum size",
        details: { path: "$", max: maxBytes },
      }, 413);
    }
  }
  return null;
}

/**
 * Read and validate request body size.
 * Reads the body text and rejects if it exceeds maxBytes.
 * Returns the body text on success, or an error Response on failure.
 */
export async function readBodyWithLimit(
  req: Request,
  maxBytes: number,
  logger?: DatafnLogger,
): Promise<{ ok: true; body: string } | { ok: false; response: Response }> {
  // Fast reject via Content-Length header
  const headerCheck = checkPayloadLimit(req, maxBytes);
  if (headerCheck) {
    return { ok: false, response: headerCheck };
  }

  // For requests without Content-Length, enforce limit on actual body
  try {
    const body = await req.text();
    // SEC-007: Use Buffer.byteLength for correct multi-byte character measurement
    if (Buffer.byteLength(body, 'utf8') > maxBytes) {
      return {
        ok: false,
        response: errorResponse({
          code: "LIMIT_EXCEEDED",
          message: "Request payload exceeds maximum size",
          details: { path: "$", max: maxBytes },
        }, 413),
      };
    }
    return { ok: true, body };
  } catch (error) {
    logger?.warn("Failed to read request body", { error: String(error), operation: "readBody" });
    return {
      ok: false,
      response: errorResponse({
        code: "DFQL_INVALID",
        message: "Failed to read request body",
        details: { path: "$" },
      }, 400),
    };
  }
}

