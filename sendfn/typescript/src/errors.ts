import type { SendfnErrorDetails } from './types';

export interface SendfnErrorOptions {
  code?: string;
  retryable?: boolean;
  details?: SendfnErrorDetails;
  cause?: unknown;
}

export class SendfnError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly details?: SendfnErrorDetails;

  constructor(message: string, options: SendfnErrorOptions = {}) {
    super(message);
    this.name = new.target.name;
    this.code = options.code ?? 'SENDFN_ERROR';
    this.retryable = options.retryable ?? false;
    this.details = options.details;
    Object.setPrototypeOf(this, new.target.prototype);

    if (options.cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = options.cause;
    }
  }
}

export class EmailProviderError extends SendfnError {
  constructor(message: string, options: SendfnErrorOptions = {}) {
    super(message, {
      code: 'SENDFN_EMAIL_PROVIDER_ERROR',
      retryable: true,
      ...options,
    });
  }
}

export class PushProviderError extends SendfnError {
  constructor(message: string, options: SendfnErrorOptions = {}) {
    super(message, {
      code: 'SENDFN_PUSH_PROVIDER_ERROR',
      retryable: true,
      ...options,
    });
  }
}

export class SmsProviderError extends SendfnError {
  constructor(message: string, options: SendfnErrorOptions = {}) {
    super(message, {
      code: 'SENDFN_SMS_PROVIDER_ERROR',
      retryable: true,
      ...options,
    });
  }
}

export class WhatsAppProviderError extends SendfnError {
  constructor(message: string, options: SendfnErrorOptions = {}) {
    super(message, {
      code: 'SENDFN_WHATSAPP_PROVIDER_ERROR',
      retryable: true,
      ...options,
    });
  }
}

export class SuppressionError extends SendfnError {
  constructor(message: string, options: SendfnErrorOptions = {}) {
    super(message, {
      code: 'SENDFN_SUPPRESSION_ERROR',
      retryable: false,
      ...options,
    });
  }
}

export class TemplateError extends SendfnError {
  constructor(message: string, options: SendfnErrorOptions = {}) {
    super(message, {
      code: 'SENDFN_TEMPLATE_ERROR',
      retryable: false,
      ...options,
    });
  }
}

export class DatabaseError extends SendfnError {
  constructor(message: string, options: SendfnErrorOptions = {}) {
    super(message, {
      code: 'SENDFN_DATABASE_ERROR',
      retryable: true,
      ...options,
    });
  }
}

export class ValidationError extends SendfnError {
  constructor(message: string, options: SendfnErrorOptions = {}) {
    super(message, {
      code: 'SENDFN_VALIDATION_ERROR',
      retryable: false,
      ...options,
    });
  }
}
