import { describe, expect, it } from 'vitest';
import { MetricsMiddleware } from '../src/middleware/metrics.js';

describe('MetricsMiddleware', () => {
  it('keeps local action metrics when the telemetry emitter fails', () => {
    const middleware = new MetricsMiddleware({
      track() {
        throw new Error('backend unavailable');
      },
    });

    expect(() =>
      middleware.record({
        provider: 'gmail',
        action: 'messages.list',
        userId: 'user-1',
        status: 'success',
        duration: 42,
      })
    ).not.toThrow();

    expect(middleware.getMetrics()).toMatchObject({
      totalRequests: 1,
      successfulRequests: 1,
      failedRequests: 0,
    });
  });
});
