import { ValidationError } from '../errors';

const RESERVED_CUSTOM_HEADERS = new Set([
  'bcc', 'cc', 'content-disposition', 'content-transfer-encoding', 'content-type', 'date',
  'dkim-signature', 'from', 'message-id', 'mime-version', 'reply-to', 'return-path',
  'sender', 'subject', 'to', 'x-sendfn-idempotency-key',
]);

export function assertCustomEmailHeaders(headers: Record<string, string> | undefined): void {
  for (const [name, value] of Object.entries(headers ?? {})) {
    const normalized = name.toLowerCase();
    if (
      !/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name) || /[\r\n]/.test(value) ||
      RESERVED_CUSTOM_HEADERS.has(normalized) || normalized.startsWith('content-') ||
      normalized.startsWith('resent-') || normalized === 'received'
    ) {
      throw new ValidationError(`Custom email header ${name} is not allowed`, {
        code: 'SENDFN_VALIDATION_ERROR', retryable: false,
      });
    }
  }
}
