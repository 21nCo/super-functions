/**
 * Error system for adapters
 */

import type { WhereClause } from './types.js';

export enum AdapterErrorCode {
  // Connection errors
  CONNECTION_FAILED = 'ADAPTER_CONNECTION_FAILED',
  CONNECTION_TIMEOUT = 'ADAPTER_CONNECTION_TIMEOUT',
  CONNECTION_CLOSED = 'ADAPTER_CONNECTION_CLOSED',

  // Query errors
  QUERY_FAILED = 'ADAPTER_QUERY_FAILED',
  QUERY_TIMEOUT = 'ADAPTER_QUERY_TIMEOUT',
  INVALID_QUERY = 'ADAPTER_INVALID_QUERY',

  // Data errors
  CONSTRAINT_VIOLATION = 'ADAPTER_CONSTRAINT_VIOLATION',
  NOT_FOUND = 'ADAPTER_NOT_FOUND',
  DUPLICATE_KEY = 'ADAPTER_DUPLICATE_KEY',
  INVALID_DATA = 'ADAPTER_INVALID_DATA',

  // Transaction errors
  TRANSACTION_FAILED = 'ADAPTER_TRANSACTION_FAILED',
  TRANSACTION_DEADLOCK = 'ADAPTER_TRANSACTION_DEADLOCK',

  // Schema errors
  SCHEMA_INVALID = 'ADAPTER_SCHEMA_INVALID',
  SCHEMA_CONFLICT = 'ADAPTER_SCHEMA_CONFLICT',
  MIGRATION_FAILED = 'ADAPTER_MIGRATION_FAILED',

  // Operation errors
  OPERATION_NOT_SUPPORTED = 'ADAPTER_OPERATION_NOT_SUPPORTED',
  BATCH_SIZE_EXCEEDED = 'ADAPTER_BATCH_SIZE_EXCEEDED',

  // Unknown
  UNKNOWN_ERROR = 'ADAPTER_UNKNOWN_ERROR',
}

export interface AdapterErrorOptions {
  cause?: unknown;
  context?: Record<string, any>;
  retryable?: boolean;
  severity?: 'fatal' | 'error' | 'warning';
}

/**
 * Base adapter error class
 */
export class AdapterError extends Error {
  public override readonly name: string = 'AdapterError';
  public readonly timestamp: Date;

  constructor(
    public readonly code: AdapterErrorCode,
    message: string,
    public readonly options?: AdapterErrorOptions
  ) {
    super(message);
    this.timestamp = new Date();

    // Maintain proper stack trace for where error was thrown (V8 only)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  isRetryable(): boolean {
    return this.options?.retryable ?? false;
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      timestamp: this.timestamp.toISOString(),
      context: this.options?.context,
      retryable: this.isRetryable(),
      severity: this.options?.severity ?? 'error',
    };
  }

  static from(error: unknown, code = AdapterErrorCode.UNKNOWN_ERROR): AdapterError {
    if (error instanceof AdapterError) {
      return error;
    }
    const message = error instanceof Error ? error.message : String(error);
    return new AdapterError(code, message, { cause: error });
  }
}

/**
 * Connection error - fatal, retryable
 */
export class ConnectionError extends AdapterError {
  public override readonly name = 'ConnectionError';
  
  constructor(message: string, options?: AdapterErrorOptions) {
    super(AdapterErrorCode.CONNECTION_FAILED, message, {
      ...options,
      severity: 'fatal',
      retryable: true,
    });
  }
}

/**
 * Constraint violation error - not retryable
 */
export class ConstraintViolationError extends AdapterError {
  public override readonly name = 'ConstraintViolationError';
  
  constructor(message: string, public readonly constraint: string) {
    super(AdapterErrorCode.CONSTRAINT_VIOLATION, message, {
      context: { constraint },
      retryable: false,
    });
  }
}

/**
 * Not found error - not retryable
 */
export class NotFoundError extends AdapterError {
  public override readonly name = 'NotFoundError';
  
  constructor(model: string, where: WhereClause[]) {
    super(AdapterErrorCode.NOT_FOUND, `Record not found in ${model}`, {
      context: { model, where },
      retryable: false,
    });
  }
}

/**
 * Duplicate key error - not retryable
 */
export class DuplicateKeyError extends AdapterError {
  public override readonly name = 'DuplicateKeyError';
  
  constructor(message: string, public readonly key: string) {
    super(AdapterErrorCode.DUPLICATE_KEY, message, {
      context: { key },
      retryable: false,
    });
  }
}

/**
 * Query failed error - may be retryable
 */
export class QueryFailedError extends AdapterError {
  public override readonly name = 'QueryFailedError';
  
  constructor(message: string, options?: AdapterErrorOptions) {
    super(AdapterErrorCode.QUERY_FAILED, message, options);
  }
}

/**
 * Transaction failed error - may be retryable
 */
export class TransactionError extends AdapterError {
  public override readonly name = 'TransactionError';
  
  constructor(message: string, options?: AdapterErrorOptions) {
    super(AdapterErrorCode.TRANSACTION_FAILED, message, {
      ...options,
      retryable: options?.retryable ?? true,
    });
  }
}

/**
 * Schema validation error - not retryable
 */
export class SchemaValidationError extends AdapterError {
  public override readonly name = 'SchemaValidationError';
  
  constructor(message: string, public readonly errors: string[]) {
    super(AdapterErrorCode.SCHEMA_INVALID, message, {
      context: { errors },
      retryable: false,
    });
  }
}

/**
 * Operation not supported error - not retryable
 */
export class OperationNotSupportedError extends AdapterError {
  public override readonly name = 'OperationNotSupportedError';
  
  constructor(operation: string, adapterName: string) {
    super(
      AdapterErrorCode.OPERATION_NOT_SUPPORTED,
      `Operation '${operation}' is not supported by ${adapterName}`,
      {
        context: { operation, adapterName },
        retryable: false,
      }
    );
  }
}
