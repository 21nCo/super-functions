/**
 * Observability: Structured logging and redaction
 */

import type { DatafnSchema } from "./core-types.js";
import type { DatafnLogger } from "./logger.js";

export function redactSensitiveFields(
  record: Record<string, unknown>,
  resourceName: string,
  schema: DatafnSchema,
): Record<string, unknown> {
  const resource = schema.resources.find((r) => r.name === resourceName);
  if (!resource) return record;

  const redacted = { ...record };

  // SRV-002: Redact fields marked encrypt:true AND fields with sensitive names
  const SENSITIVE_NAMES = new Set([
    "password", "token", "secret", "authorization", "cookie",
    "apikey", "api_key", "accesstoken", "access_token",
    "refreshtoken", "refresh_token", "privatekey", "private_key",
  ]);

  for (const field of resource.fields) {
    if (
      (field as any).encrypt === true ||
      SENSITIVE_NAMES.has(field.name.toLowerCase())
    ) {
      if (redacted[field.name] !== undefined) {
        redacted[field.name] = "[REDACTED]";
      }
    }
  }
  
  return redacted;
}

export interface RequestLogMetadata {
  timestamp: string;
  endpoint: string;
  clientId?: string;
  mutationId?: string;
  resource?: string;
  operation?: string;
  duration_ms: number;
  [key: string]: unknown;
}

/**
 * Log a structured request record.
 *
 * FIX-LOG-002: Always routes through DatafnLogger — no console path.
 * Server initialization guarantees a logger instance for all routes.
 * LOW-009: Context is passed as structured data instead of being serialized eagerly.
 */
export function logRequest(metadata: RequestLogMetadata, logger?: DatafnLogger) {
  if (logger) {
    logger.info("request", metadata as Record<string, unknown>);
  }
}
