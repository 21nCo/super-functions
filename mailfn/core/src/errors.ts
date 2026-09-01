export type MailFnErrorCode =
  | 'MAILFN_UNAUTHORIZED'
  | 'MAILFN_FORBIDDEN'
  | 'MAILFN_NOT_FOUND'
  | 'MAILFN_CONFLICT'
  | 'MAILFN_VALIDATION_FAILED'
  | 'MAILFN_UNKNOWN_RECIPIENT'
  | 'MAILFN_INBOX_INACTIVE'
  | 'MAILFN_QUOTA_EXCEEDED'
  | 'MAILFN_RATE_LIMITED'
  | 'MAILFN_SENDER_BLOCKED'
  | 'MAILFN_MESSAGE_TOO_LARGE'
  | 'MAILFN_ATTACHMENT_TOO_LARGE'
  | 'MAILFN_PARSE_FAILED'
  | 'MAILFN_QUEUE_FAILED'
  | 'MAILFN_STORAGE_FAILED'
  | 'MAILFN_DOMAIN_ROUTING_FAILED'
  | 'MAILFN_WEBHOOK_FAILED'
  | 'MAILFN_TIMEOUT'
  | 'MAILFN_ABORTED'
  | 'MAILFN_PUBLIC_PLATFORM_DISABLED'
  | 'MAILFN_PRODUCTION_APPROVAL_REQUIRED'
  | 'MAILFN_DOMAIN_UNVERIFIED'
  | 'MAILFN_SEND_UNAVAILABLE';

export class MailFnError extends Error {
  public readonly code: MailFnErrorCode;
  public readonly status: number;
  public readonly retryable: boolean;
  public readonly details?: Record<string, unknown>;

  public constructor(input: {
    code: MailFnErrorCode;
    message: string;
    status: number;
    retryable?: boolean;
    details?: Record<string, unknown>;
    cause?: unknown;
  }) {
    super(input.message, { cause: input.cause });
    this.name = 'MailFnError';
    this.code = input.code;
    this.status = input.status;
    this.retryable = input.retryable ?? false;
    this.details = input.details;
  }
}

export function assertMailFn(condition: unknown, input: ConstructorParameters<typeof MailFnError>[0]): asserts condition {
  if (!condition) {
    throw new MailFnError(input);
  }
}

export function toMailFnError(error: unknown): MailFnError {
  if (error instanceof MailFnError) return error;
  return new MailFnError({
    code: 'MAILFN_STORAGE_FAILED',
    message: 'MailFn dependency failed',
    status: 503,
    retryable: true,
    cause: error,
  });
}
