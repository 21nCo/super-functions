import {
  createErrorRegistry,
  createTypedError,
  type ErrorRegistry,
  type SuperfunctionError
} from '@superfunctions/errors';

const definitions = [
  {
    code: 'BILLFN_VALIDATION_ERROR',
    httpStatus: 400,
    retryable: false
  },
  {
    code: 'BILLFN_NOT_FOUND',
    httpStatus: 404,
    retryable: false
  },
  {
    code: 'BILLFN_CONFLICT',
    httpStatus: 409,
    retryable: false
  },
  {
    code: 'BILLFN_UNAUTHORIZED',
    httpStatus: 403,
    retryable: false
  },
  {
    code: 'BILLFN_PROVIDER_ERROR',
    httpStatus: 502,
    retryable: true
  },
  {
    code: 'BILLFN_PROVIDER_UNSUPPORTED',
    httpStatus: 501,
    retryable: false
  },
  {
    code: 'BILLFN_WEBHOOK_SIGNATURE_INVALID',
    httpStatus: 401,
    retryable: false
  },
  {
    code: 'BILLFN_SUBSCRIPTION_INACTIVE',
    httpStatus: 402,
    retryable: false
  },
  {
    code: 'BILLFN_QUOTA_EXCEEDED',
    httpStatus: 403,
    retryable: false
  },
  {
    code: 'BILLFN_FEATURE_UNAVAILABLE',
    httpStatus: 403,
    retryable: false
  },
  {
    code: 'BILLFN_CATALOG_PRICE_NOT_FOUND',
    httpStatus: 404,
    retryable: false
  },
  {
    code: 'BILLFN_INTERNAL_ERROR',
    httpStatus: 500,
    retryable: false
  }
] as const;

export const billFnErrorRegistry: ErrorRegistry = createErrorRegistry([...definitions]);

export function createBillFnError(input: {
  code: (typeof definitions)[number]['code'];
  message?: string;
  details?: Record<string, unknown>;
}): SuperfunctionError {
  return createTypedError({
    code: input.code,
    message: input.message,
    details: input.details,
    registry: billFnErrorRegistry
  });
}
