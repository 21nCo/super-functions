import { describe, expect, it } from 'vitest';

import {
  createRpcClient,
  resolvePluginOrder,
  mergePluginContributions,
} from '../src/index.js';

describe('router', () => {
  it('routes valid envelopes and returns canonical responses', async () => {
    const router = createRpcClient({
      address: {
        context: 'popup',
        surfaceId: 'popup',
      },
      handlers: [
        {
          namespace: 'demo',
          method: 'ping',
          async handle(_runtime, payload) {
            return payload;
          },
        },
      ],
    });

    const response = await router.call('demo', 'ping', { value: 'hello' });

    expect(response).toEqual({ value: 'hello' });
  });

  it('keeps call usable after destructuring', async () => {
    const router = createRpcClient({
      address: {
        context: 'popup',
        surfaceId: 'popup',
      },
      handlers: [
        {
          namespace: 'demo',
          method: 'ping',
          async handle() {
            return { ok: true };
          },
        },
      ],
    });

    const { call } = router;
    await expect(call('demo', 'ping', {})).resolves.toEqual({ ok: true });
  });

  it('rejects invalid envelopes, unknown handlers, timeouts, and oversized payloads', async () => {
    const router = createRpcClient({
      address: {
        context: 'popup',
        surfaceId: 'popup',
      },
      handlers: [
        {
          namespace: 'upload',
          method: 'slow',
          async handle() {
            await new Promise((resolve) => setTimeout(resolve, 100));
            return { ok: true };
          },
        },
      ],
      defaultTimeoutMs: 10,
    });

    const invalid = await router.dispatch({
      v: 1,
      kind: 'request',
      requestId: 'req_01',
      namespace: '' as never,
      method: 'ping',
      source: { context: 'popup', surfaceId: 'popup' },
      target: { context: 'background', surfaceId: 'background' },
      payload: {},
    });

    expect(invalid).toMatchObject({
      ok: false,
      error: {
        code: 'E_RUNTIME_PROTOCOL',
        message: 'Request envelope is missing required field: namespace',
      },
    });

    const unknown = await router.dispatch({
      v: 1,
      kind: 'request',
      requestId: 'req_02',
      namespace: 'upload',
      method: 'missing',
      source: { context: 'popup', surfaceId: 'popup' },
      target: { context: 'background', surfaceId: 'background' },
      payload: {},
    });

    expect(unknown).toMatchObject({
      ok: false,
      error: {
        code: 'E_HANDLER_NOT_FOUND',
        message: 'No handler registered for upload/missing',
      },
    });

    const timeout = await router.dispatch({
      v: 1,
      kind: 'request',
      requestId: 'req_03',
      namespace: 'upload',
      method: 'slow',
      source: { context: 'popup', surfaceId: 'popup' },
      target: { context: 'background', surfaceId: 'background' },
      payload: {},
      timeoutMs: 10,
    });

    expect(timeout).toMatchObject({
      ok: false,
      error: {
        code: 'E_TIMEOUT',
        message: 'Request timed out after 10 ms.',
      },
    });

    const oversized = await router.dispatch({
      v: 1,
      kind: 'request',
      requestId: 'req_04',
      namespace: 'upload',
      method: 'slow',
      source: { context: 'popup', surfaceId: 'popup' },
      target: { context: 'background', surfaceId: 'background' },
      payload: {
        blob: 'a'.repeat((8 * 1024 * 1024) + 1024),
      },
    });

    expect(oversized).toMatchObject({
      ok: false,
      error: {
        code: 'E_PAYLOAD_TOO_LARGE',
        message: 'Payload exceeds 8 MiB limit.',
      },
    });
  });

  it('resolves plugin ordering deterministically and fails conflicting single-owner contributions', () => {
    expect(
      resolvePluginOrder([
        { id: 'alpha', dependsOn: [] },
        { id: 'beta', dependsOn: ['alpha'] },
      ])
    ).toEqual(['alpha', 'beta']);

    expect(
      mergePluginContributions([
        {
          id: 'alpha',
          contributeManifest() {
            return { permissions: ['storage'] };
          },
        },
        {
          id: 'beta',
          contributeManifest() {
            return { permissions: ['tabs'] };
          },
        },
      ])
    ).toEqual({
      permissions: ['storage', 'tabs'],
    });

    expect(() =>
      mergePluginContributions([
        {
          id: 'alpha',
          contributeManifest() {
            return { background: { serviceWorker: 'a.ts' } };
          },
        },
        {
          id: 'beta',
          contributeManifest() {
            return { background: { serviceWorker: 'b.ts' } };
          },
        },
      ])
    ).toThrowErrorMatchingInlineSnapshot(
      `[ExtfnError: Conflicting single-owner contribution: background.serviceWorker]`
    );
  });
});
