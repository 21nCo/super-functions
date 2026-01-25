import { errorResponse } from "./errors.js";

/**
 * Middleware to enforce payload size limits
 */
export function enforcePayloadLimit(maxBytes: number) {
  return async (req: Request, next: () => Promise<Response>): Promise<Response> => {
    // Check Content-Length if available
    const contentLength = req.headers.get("content-length");
    if (contentLength) {
      const length = parseInt(contentLength, 10);
      if (!isNaN(length) && length > maxBytes) {
        return errorResponse({
          code: "LIMIT_EXCEEDED",
          message: "Request payload exceeds maximum size",
          details: { path: "$", max: maxBytes },
        }, 413); // Payload Too Large
      }
    }

    // If stream reading enforcement is needed, it would be in getBodyFromContext
    // But Request body stream handling is environment specific.
    // For now, Content-Length check is the standard "fast reject".
    
    return next();
  };
}
