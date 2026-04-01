export interface MetricsEmitter {
  track(event: string, payload?: Record<string, unknown>): void;
}

export function createMetricsEmitter(): MetricsEmitter {
  return {
    track() {},
  };
}

export function createNamespacedEmitter(
  namespace: string,
  emitter: MetricsEmitter
): MetricsEmitter {
  return {
    track(event, payload) {
      emitter.track(`${namespace}.${event}`, payload);
    },
  };
}
