import { describe, expect, it } from 'vitest';
import { ConfigError, readBooleanEnv, readIntEnv, readIntEnvOrDefault, readStringEnv } from '../index.js';

describe('config', () => {
  it('reads bounded integer env values', () => {
    expect(
      readIntEnv('RECFN_RATE_LIMIT_WINDOW_MS', {
        env: { RECFN_RATE_LIMIT_WINDOW_MS: '2000' },
        defaultValue: 1000,
        min: 100,
      })
    ).toBe(2000);
  });

  it('throws ENV_VALUE_OUT_OF_RANGE for out of range integer', () => {
    expect(() =>
      readIntEnv('RECFN_RATE_LIMIT_WINDOW_MS', {
        env: { RECFN_RATE_LIMIT_WINDOW_MS: '-1' },
        defaultValue: 1000,
        min: 100,
      })
    ).toThrowError(ConfigError);
  });

  it('rejects integers outside the JavaScript safe range', () => {
    expect(() =>
      readIntEnv('RECFN_RATE_LIMIT_WINDOW_MS', {
        env: { RECFN_RATE_LIMIT_WINDOW_MS: '9007199254740993' },
        defaultValue: 1000,
      })
    ).toThrowError(ConfigError);
  });

  it('can fallback deterministically using readIntEnvOrDefault', () => {
    expect(
      readIntEnvOrDefault('RECFN_RATE_LIMIT_WINDOW_MS', {
        env: { RECFN_RATE_LIMIT_WINDOW_MS: '-1' },
        defaultValue: 1000,
        min: 100,
      })
    ).toBe(1000);
  });

  it('validates the default used by readIntEnvOrDefault', () => {
    expect(() =>
      readIntEnvOrDefault('RECFN_RATE_LIMIT_WINDOW_MS', {
        env: { RECFN_RATE_LIMIT_WINDOW_MS: '-1' },
        defaultValue: 50,
        min: 100,
      })
    ).toThrowError(ConfigError);
  });

  it('reads strings and booleans', () => {
    expect(readStringEnv('A', { env: { A: 'value' }, defaultValue: 'x' })).toBe('value');
    expect(readBooleanEnv('B', { env: { B: 'true' }, defaultValue: false })).toBe(true);
  });

  it('uses the default for empty string values when empty strings are not allowed', () => {
    expect(readStringEnv('A', { env: { A: '' }, defaultValue: 'fallback' })).toBe('fallback');
    expect(readStringEnv('A', { env: { A: '' }, defaultValue: 'fallback', allowEmpty: true })).toBe('');
  });

  it('validates default string values when empty strings are not allowed', () => {
    expect(() =>
      readStringEnv('A', {
        env: {},
        defaultValue: '',
        allowEmpty: false,
      })
    ).toThrowError(ConfigError);
  });
});
