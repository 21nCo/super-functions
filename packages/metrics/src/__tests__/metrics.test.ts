import { describe, expect, it } from 'vitest';
import { createMetricsEmitter, createNamespacedEmitter } from '../index.js';

describe('metrics', () => {
  it('creates no-op emitter', () => {
    const metrics = createMetricsEmitter();
    expect(() => metrics.track('api.request')).not.toThrow();
  });

  it('creates namespaced emitter', () => {
    const events: string[] = [];
    const base = createMetricsEmitter((event) => events.push(event));
    const namespaced = createNamespacedEmitter('recfn', base);

    namespaced.track('event');
    expect(events).toEqual(['recfn.event']);
  });

  it('swallows asynchronous telemetry failures', async () => {
    const metrics = createMetricsEmitter(async () => {
      throw new Error('telemetry unavailable');
    });

    expect(metrics.track('api.request')).toBeUndefined();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
});
