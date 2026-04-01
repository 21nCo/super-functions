export type ExtfnErrorCode =
  | 'E_CONFIG_INVALID'
  | 'E_TARGET_UNSUPPORTED'
  | 'E_MANIFEST_COLLISION'
  | 'E_ENTRY_NOT_FOUND'
  | 'E_HANDLER_NOT_FOUND'
  | 'E_CONTEXT_UNAVAILABLE'
  | 'E_TIMEOUT'
  | 'E_PAYLOAD_TOO_LARGE'
  | 'E_PLUGIN_CONFLICT'
  | 'E_RUNTIME_PROTOCOL'
  | 'E_ANCHOR_RESOLUTION';

export interface ExtfnErrorDetails {
  readonly [key: string]: unknown;
}

export class ExtfnError extends Error {
  readonly code: ExtfnErrorCode;
  readonly status: number;
  readonly retryable: boolean;
  readonly details?: ExtfnErrorDetails;

  constructor(
    code: ExtfnErrorCode,
    message: string,
    options: {
      status?: number;
      retryable?: boolean;
      details?: ExtfnErrorDetails;
      cause?: unknown;
    } = {}
  ) {
    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = 'ExtfnError';
    this.code = code;
    this.status = options.status ?? defaultStatusForCode(code);
    this.retryable = options.retryable ?? false;
    this.details = options.details;
  }
}

export function createExtfnError(
  code: ExtfnErrorCode,
  message: string,
  details?: ExtfnErrorDetails
): ExtfnError {
  return new ExtfnError(code, message, { details });
}

export function isExtfnError(value: unknown): value is ExtfnError {
  return value instanceof ExtfnError;
}

function defaultStatusForCode(code: ExtfnErrorCode): number {
  switch (code) {
    case 'E_ENTRY_NOT_FOUND':
      return 404;
    case 'E_CONTEXT_UNAVAILABLE':
      return 503;
    case 'E_HANDLER_NOT_FOUND':
      return 404;
    case 'E_TARGET_UNSUPPORTED':
      return 422;
    case 'E_TIMEOUT':
      return 504;
    case 'E_PAYLOAD_TOO_LARGE':
      return 413;
    case 'E_PLUGIN_CONFLICT':
      return 409;
    case 'E_ANCHOR_RESOLUTION':
      return 500;
    case 'E_RUNTIME_PROTOCOL':
      return 500;
    case 'E_CONFIG_INVALID':
    case 'E_MANIFEST_COLLISION':
    default:
      return 400;
  }
}
