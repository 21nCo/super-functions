import { describe, expect, it } from 'vitest';
import { isRetryableError } from '../retry.js';

describe('isRetryableError', () => {
  it('returns false for unknown non-network values', () => {
    expect(isRetryableError({ code: 'INVALID_STATE' })).toBe(false);
    expect(isRetryableError(42)).toBe(false);
    expect(isRetryableError(null)).toBe(false);
  });

  it('keeps retrying server and network failures', () => {
    expect(isRetryableError({ status: 503 })).toBe(true);
    expect(isRetryableError(new Error('network connection reset'))).toBe(true);
    expect(isRetryableError('fetch failed')).toBe(true);
  });
});
