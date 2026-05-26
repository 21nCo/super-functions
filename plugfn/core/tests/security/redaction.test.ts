import { describe, expect, it } from 'vitest';
import {
  TelemetryRedactionError,
  assertTelemetryRedacted,
  redactLogEvent,
  redactMetricDimensions,
  redactTelemetry,
} from '../../src/security/redaction.js';

describe('security telemetry redaction', () => {
  it('redacts access tokens and message bodies in logs', () => {
    const redacted = redactLogEvent({
      accessToken: 'at_123',
      messageBody: 'secret',
      nested: {
        refreshToken: 'rt_456',
      },
    });

    expect(redacted).toEqual({
      accessToken: '[REDACTED]',
      messageBody: '[REDACTED]',
      nested: {
        refreshToken: '[REDACTED]',
      },
    });
  });

  it('redacts sensitive metric dimensions and keeps safe dimensions', () => {
    const redacted = redactMetricDimensions({
      provider: 'gmail',
      refreshToken: 'rt_plaintext',
      operation: 'mail.sync',
      requestCount: 2,
      messageBody: 'invoice data',
    });

    expect(redacted).toEqual({
      provider: 'gmail',
      refreshToken: '[REDACTED]',
      operation: 'mail.sync',
      requestCount: 2,
      messageBody: '[REDACTED]',
    });
  });

  it('detects a sensitive telemetry leak when redaction is bypassed', () => {
    expect(() =>
      assertTelemetryRedacted({
        logEvent: {
          refreshToken: 'rt_plaintext',
        },
      })
    ).toThrowError(TelemetryRedactionError);

    expect(() =>
      assertTelemetryRedacted({
        logEvent: {
          refreshToken: 'rt_plaintext',
        },
      })
    ).toThrowError('sensitive telemetry leak detected');
  });

  it('passes redaction assertion after sanitization', () => {
    const event = redactTelemetry({
      refreshToken: 'rt_plaintext',
      messageBody: 'highly sensitive',
    });

    expect(() => assertTelemetryRedacted(event)).not.toThrow();
  });

  it('redacts token-like string payloads even without key-based hints', () => {
    const redacted = redactTelemetry({
      note: 'Bearer abcdef.12345.zzzz',
      safe: 'completed',
    });

    expect(redacted).toEqual({
      note: '[REDACTED]',
      safe: 'completed',
    });
  });
});
