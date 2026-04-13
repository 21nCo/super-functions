import { describe, expect, it } from 'vitest';
import {
  err,
  normalizeLegacyEnvelope,
  ok,
  toLegacyDataEnvelope,
  toLegacyResultEnvelope,
} from '../index.js';

describe('envelope', () => {
  it('returns canonical ok/data/meta shape', () => {
    const result = ok({ x: 1 }, { timestamp: '2026-03-12T00:00:00.000Z' });
    expect(result).toEqual({
      ok: true,
      data: { x: 1 },
      meta: { timestamp: '2026-03-12T00:00:00.000Z' },
    });
  });

  it('returns INVALID_ENVELOPE_ERROR_SHAPE when retryable/status are missing', () => {
    const result = err({ code: 'BAD_REQUEST', message: 'x', status: 400 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('INVALID_ENVELOPE_ERROR_SHAPE');
    }
  });

  it('normalizes legacy {ok,result} and {ok,data} envelopes', () => {
    const resultEnvelope = normalizeLegacyEnvelope({ ok: true, result: { a: 1 } }, { timestamp: 't1' });
    const dataEnvelope = normalizeLegacyEnvelope({ ok: true, data: { a: 2 } }, { timestamp: 't2' });

    expect(resultEnvelope.ok && resultEnvelope.data).toEqual({ a: 1 });
    expect(dataEnvelope.ok && dataEnvelope.data).toEqual({ a: 2 });
  });

  it('does not treat malformed ok:false envelopes with data as successful payloads', () => {
    const normalized = normalizeLegacyEnvelope(
      {
        ok: false,
        data: { leaked: true },
        error: { code: 'BAD', message: 'broken legacy envelope' },
      } as never,
      { timestamp: 't3', defaultStatus: 502, defaultRetryable: false }
    );

    expect(normalized.ok).toBe(false);
    if (!normalized.ok) {
      expect(normalized.error.code).toBe('BAD');
      expect(normalized.error.status).toBe(502);
    }
  });

  it('guards malformed legacy error envelopes that omit the error payload', () => {
    const normalized = normalizeLegacyEnvelope(
      { ok: false } as never,
      { timestamp: 't4', defaultStatus: 503, defaultRetryable: true }
    );

    expect(normalized.ok).toBe(false);
    if (!normalized.ok) {
      expect(normalized.error.code).toBe('INVALID_ENVELOPE_ERROR_SHAPE');
      expect(normalized.error.status).toBe(503);
      expect(normalized.error.retryable).toBe(true);
    }
  });

  it('guards malformed legacy error envelopes with non-string code or message fields', () => {
    const normalized = normalizeLegacyEnvelope(
      { ok: false, error: { code: 42, message: null } } as never,
      { timestamp: 't5', defaultStatus: 422, defaultRetryable: false }
    );

    expect(normalized.ok).toBe(false);
    if (!normalized.ok) {
      expect(normalized.error.code).toBe('INVALID_ENVELOPE_ERROR_SHAPE');
      expect(normalized.error.status).toBe(422);
    }
  });

  it('converts canonical envelope back to legacy variants', () => {
    const canonical = ok({ y: 2 }, { timestamp: '2026-03-12T00:00:00.000Z' });
    expect(toLegacyDataEnvelope(canonical)).toEqual({ ok: true, data: { y: 2 } });
    expect(toLegacyResultEnvelope(canonical)).toEqual({ ok: true, result: { y: 2 } });
  });
});
