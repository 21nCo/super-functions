import type { MailFnErrorCode } from '@mailfn/core';

export class MailFnClientError extends Error {
  public constructor(
    public readonly code: MailFnErrorCode | 'MAILFN_NETWORK_ERROR' | 'MAILFN_INVALID_RESPONSE',
    message: string,
    public readonly status: number,
    public readonly retryable: boolean,
    public readonly requestId?: string,
    public readonly details?: Record<string, unknown>,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'MailFnClientError';
  }
}
