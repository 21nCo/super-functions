import { describe, expect, it } from 'vitest';
import { SuperfunctionError, createErrorRegistry, createTypedError } from '../index.js';

describe('errors', () => {
  it('resolves registered error code metadata', () => {
    const registry = createErrorRegistry([
      { code: 'RATE_LIMIT_EXCEEDED', httpStatus: 429, retryable: true },
    ]);

    expect(registry.resolve('RATE_LIMIT_EXCEEDED')).toEqual({
      code: 'RATE_LIMIT_EXCEEDED',
      httpStatus: 429,
      retryable: true,
    });
  });

  it('throws ERROR_CODE_UNREGISTERED for unknown codes', () => {
    const registry = createErrorRegistry();

    expect(() => registry.resolve('UNKNOWN_CODE')).toThrowError(SuperfunctionError);
    try {
      registry.resolve('UNKNOWN_CODE');
    } catch (error) {
      const typed = error as SuperfunctionError;
      expect(typed.code).toBe('ERROR_CODE_UNREGISTERED');
    }
  });

  it('creates typed errors from registry metadata', () => {
    const registry = createErrorRegistry([
      { code: 'BAD_REQUEST', httpStatus: 400, retryable: false, defaultMessage: 'Bad request' },
    ]);

    const error = createTypedError({ code: 'BAD_REQUEST', registry, details: { field: 'name' } });
    expect(error).toBeInstanceOf(SuperfunctionError);
    expect(error.code).toBe('BAD_REQUEST');
    expect(error.status).toBe(400);
    expect(error.retryable).toBe(false);
    expect(error.details).toEqual({ field: 'name' });
  });
});
