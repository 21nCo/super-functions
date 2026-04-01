import { describe, expect, it } from 'vitest';

import { createEventBus } from '../src/index.js';

describe('events', () => {
  it('fans out events in order and isolates listener failures', async () => {
    const popupReceived: number[] = [];
    const sidepanelReceived: number[] = [];
    const errors: string[] = [];
    const bus = createEventBus({
      source: {
        context: 'background',
        surfaceId: 'background',
      },
      onError(error) {
        errors.push((error as { code: string }).code);
      },
    });

    bus.on('datafn', 'mutation_applied', async (payload) => {
      popupReceived.push((payload as { seq: number }).seq);
    });
    bus.on('datafn', 'mutation_applied', async (payload) => {
      sidepanelReceived.push((payload as { seq: number }).seq);
    });
    bus.on('datafn', 'mutation_applied', async (payload) => {
      if ((payload as { seq: number }).seq === 1) {
        throw new Error('listener failed');
      }
    });

    await bus.emit('datafn', 'mutation_applied', { seq: 1 });
    await bus.emit('datafn', 'mutation_applied', { seq: 2 });

    expect(popupReceived).toEqual([1, 2]);
    expect(sidepanelReceived).toEqual([1, 2]);
    expect(errors).toEqual(['E_RUNTIME_PROTOCOL']);
  });

  it('returns unsubscribe handlers', async () => {
    const received: number[] = [];
    const bus = createEventBus({
      source: {
        context: 'background',
        surfaceId: 'background',
      },
    });

    const unsubscribe = bus.on('demo', 'changed', async (payload) => {
      received.push((payload as { seq: number }).seq);
    });

    await bus.emit('demo', 'changed', { seq: 1 });
    unsubscribe();
    await bus.emit('demo', 'changed', { seq: 2 });

    expect(received).toEqual([1]);
  });
});
