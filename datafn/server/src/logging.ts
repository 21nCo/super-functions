/**
 * Observability: Structured logging and redaction
 */

import type { DatafnSchema } from "@datafn/core";

export function redactSensitiveFields(
  record: Record<string, unknown>,
  resourceName: string,
  schema: DatafnSchema,
): Record<string, unknown> {
  const resource = schema.resources.find((r) => r.name === resourceName);
  if (!resource) return record;

  const redacted = { ...record };
  
  // Identify sensitive fields (encrypt: true)
  // Assuming schema fields have 'encrypt' property or similar metadata.
  // The spec says "fields marked encrypt: true".
  
  for (const field of resource.fields) {
    if ((field as any).encrypt === true) {
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

export function logRequest(metadata: RequestLogMetadata) {
  // Structured logging to stdout
  console.log(JSON.stringify(metadata));
}
