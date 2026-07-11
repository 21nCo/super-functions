import { describe, expect, it } from 'vitest';

import { createPortBroker } from '../src/index.js';

describe('ports', () => {
  it('preserves ordered bidirectional delivery and explicit client close', async () => {
    const received: Array<{ seq: number; payload: unknown }> = [];
    const closed: string[] = [];
    const broker = createPortBroker({
      address: {
        context: 'popup',
        surfaceId: 'popup',
      },
      handlers: [
        {
          channel: 'flux',
          async onMessage(_runtime, payload, envelope, port) {
            await port.send({
              seq: envelope.seq,
              payload,
            });
          },
        },
      ],
    });

    const port = await broker.client.open('flux');
    port.onMessage(async (payload, envelope) => {
      received.push({
        seq: envelope.seq,
        payload,
      });
    });
    port.onClose(async (envelope) => {
      closed.push(envelope.reason);
    });

    await port.send({ method: 'start' });
    await port.send({ method: 'status' });
    await port.close();

    expect(received).toEqual([
      { seq: 1, payload: { seq: 1, payload: { method: 'start' } } },
      { seq: 2, payload: { seq: 2, payload: { method: 'status' } } },
    ]);
    expect(closed).toEqual(['client-closed']);
  });

  it('delivers client messages to server-side onMessage listeners', async () => {
    const serverReceived: unknown[] = [];
    const broker = createPortBroker({
      address: {
        context: 'popup',
        surfaceId: 'popup',
      },
      handlers: [
        {
          channel: 'flux',
          onConnect(_runtime, port) {
            port.onMessage(async (payload) => {
              serverReceived.push(payload);
            });
          },
        },
      ],
    });

    const port = await broker.client.open('flux');
    await port.send({ method: 'start' });
    await port.send({ method: 'status' });

    expect(serverReceived).toEqual([{ method: 'start' }, { method: 'status' }]);
  });

  it('rejects unknown channels', async () => {
    const broker = createPortBroker({
      address: {
        context: 'popup',
        surfaceId: 'popup',
      },
      handlers: [],
    });

    await expect(broker.client.open('missing-channel')).rejects.toMatchObject({
      code: 'E_HANDLER_NOT_FOUND',
      message: 'Unknown port channel: missing-channel',
    });
  });

  it('reconnects resumable ports without duplicating listeners and closes when recovery fails', async () => {
    const states: string[] = [];
    const failedStates: string[] = [];
    const closed: string[] = [];
    const broker = createPortBroker({
      address: {
        context: 'popup',
        surfaceId: 'popup',
      },
      handlers: [
        {
          channel: 'datafn-sync',
          async onMessage(_runtime, payload, envelope, port) {
            await port.send({
              seq: envelope.seq,
              payload,
            });
          },
        },
      ],
      onStateChange(_portId, state) {
        states.push(state);
      },
    });

    const port = await broker.client.open('datafn-sync', undefined, {
      reconnect: 'background-resume',
      timeoutMs: 20,
    });
    const receivedAfterResume: number[] = [];
    port.onMessage(async (payload) => {
      receivedAfterResume.push((payload as { seq: number }).seq);
    });

    await broker.suspendBackground();
    await broker.resumeBackground();
    await port.send({ method: 'status' });

    expect(states).toEqual(['open', 'reconnecting', 'open']);
    expect(receivedAfterResume).toEqual([1]);

    const failingBroker = createPortBroker({
      address: {
        context: 'popup',
        surfaceId: 'popup',
      },
      handlers: [
        {
          channel: 'datafn-sync',
        },
      ],
      onStateChange(_portId, state) {
        failedStates.push(state);
      },
    });

    const failingPort = await failingBroker.client.open('datafn-sync', undefined, {
      reconnect: 'background-resume',
      timeoutMs: 10,
    });
    failingPort.onClose(async (envelope) => {
      closed.push(envelope.reason);
    });

    await failingBroker.suspendBackground();
    await new Promise((resolve) => setTimeout(resolve, 25));

    expect(failedStates).toEqual(['open', 'reconnecting', 'closed']);
    expect(closed).toEqual(['context-unavailable']);
  });
});
