import { createExtfnError, type ExtfnError } from '../errors.js';

export function createRuntimeProtocolError(
  message: string,
  details?: Record<string, unknown>
): ExtfnError {
  return createExtfnError('E_RUNTIME_PROTOCOL', message, details);
}

export function createHandlerNotFoundError(
  identifier: string,
  kind: 'request' | 'port' = 'request'
): ExtfnError {
  return createExtfnError(
    'E_HANDLER_NOT_FOUND',
    kind === 'port'
      ? `Unknown port channel: ${identifier}`
      : `No handler registered for ${identifier}`
  );
}

export function createTimeoutError(timeoutMs: number): ExtfnError {
  return createExtfnError(
    'E_TIMEOUT',
    `Request timed out after ${timeoutMs} ms.`,
    { timeoutMs }
  );
}
