import type { AuthFnConfig, AuthFnEvent } from '../types.js';
import { createRequestId, resolveRequestId } from '../http/envelopes.js';

const REDACTED = '[redacted]';
const SENSITIVE_KEY_PATTERN = /(password|secret|token|code|hash|access|refresh|idtoken|clientsecret)/i;

export async function emitAuthEvent(
  config: Pick<AuthFnConfig, 'observability'>,
  event: AuthFnEvent
): Promise<void> {
  try {
    await config.observability?.emit?.(sanitizeEvent(event));
  } catch {
    // Fail-open by contract for observability sinks.
  }
}

export function eventRequestId(request?: Request): string {
  if (request) {
    return resolveRequestId(request);
  }

  return createRequestId();
}

function sanitizeEvent(event: AuthFnEvent): AuthFnEvent {
  return sanitizeValue(event) as AuthFnEvent;
}

function sanitizeValue(value: unknown, key?: string): unknown {
  if (key && SENSITIVE_KEY_PATTERN.test(key)) {
    return REDACTED;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeValue(entry));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([entryKey, entryValue]) => [
        entryKey,
        sanitizeValue(entryValue, entryKey)
      ])
    );
  }

  return value;
}
