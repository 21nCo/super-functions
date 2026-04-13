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
});
