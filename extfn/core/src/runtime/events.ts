import { createEventEnvelope, type RuntimeEventEnvelope } from './envelope.js';
import { createRuntimeProtocolError } from './errors.js';
import type { RuntimeAddress } from '../types.js';

export interface EventBus {
  emit(namespace: string, event: string, payload: unknown): Promise<void>;
  on(
    namespace: string,
    event: string,
    handler: (payload: unknown, envelope: RuntimeEventEnvelope) => void | Promise<void>
  ): () => void;
}

export interface CreateEventBusOptions {
  source: RuntimeAddress;
  onError?: (error: unknown) => void;
}

export function createEventBus(
  options: CreateEventBusOptions
): EventBus {
  const listeners = new Map<
    string,
    Set<(payload: unknown, envelope: RuntimeEventEnvelope) => void | Promise<void>>
  >();
  const deliveryQueues = new Map<string, Promise<void>>();

  return {
    on(namespace, event, handler) {
      const key = getEventKey(namespace, event);
      const handlers = listeners.get(key) ?? new Set();
      handlers.add(handler);
      listeners.set(key, handlers);

      return () => {
        handlers.delete(handler);
        if (handlers.size === 0) {
          listeners.delete(key);
        }
      };
    },
    async emit(namespace, event, payload) {
      const key = getEventKey(namespace, event);
      const envelope = createEventEnvelope({
        namespace,
        event,
        source: options.source,
        payload,
      });
      const previousQueue = deliveryQueues.get(key) ?? Promise.resolve();
      const nextQueue = previousQueue.then(async () => {
        for (const handler of listeners.get(key) ?? []) {
          try {
            await handler(payload, envelope);
          } catch (error) {
            options.onError?.(
              createRuntimeProtocolError(
                error instanceof Error ? error.message : 'Event listener failed.'
              )
            );
          }
        }
      });

      deliveryQueues.set(key, nextQueue);
      await nextQueue;
    },
  };
}

function getEventKey(namespace: string, event: string): string {
  return `${namespace}:${event}`;
}
