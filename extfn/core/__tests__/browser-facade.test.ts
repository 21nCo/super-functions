import { describe, expect, it } from 'vitest';

import {
  MAX_RUNTIME_PAYLOAD_BYTES,
  assertPayloadWithinLimit,
  createBrowserFacade,
  createRuntime,
} from '../src/index.js';

describe('browser facade', () => {
  it('awaits callback-style browser methods and exposes raw access', async () => {
    const rawBrowser = {
      tabs: {
        query(
          queryInfo: { active: boolean; currentWindow: boolean },
          callback: (value: Array<{ id: number; active: boolean }>) => void
        ) {
          callback([
            { id: queryInfo.active ? 1 : 2, active: queryInfo.active },
          ]);
        },
      },
      runtime: {},
    };

    const runtime = createRuntime({
      globals: {
        location: {
          protocol: 'chrome-extension:',
          pathname: '/popup/index.html',
        },
        chrome: rawBrowser,
      },
      rawBrowser,
      target: 'chromium-mv3',
    });

    const result = await runtime.browser.call<Array<{ id: number }>>(
      'tabs.query',
      { active: true, currentWindow: true }
    );

    expect(runtime.browser.raw).toBe(rawBrowser);
    expect(Array.isArray(result)).toBe(true);
    expect(result[0]?.id).toBe(1);
  });

  it('awaits promise-style methods and proxies namespace calls', async () => {
    const rawBrowser = {
      tabs: {
        async query() {
          return [{ id: 42 }];
        },
      },
      runtime: {},
    };

    const browser = createBrowserFacade({
      raw: rawBrowser,
      target: 'chromium-mv3',
    });

    const result = await browser.namespace<{
      query: () => Promise<Array<{ id: number }>>;
    }>('tabs').query();

    expect(result).toEqual([{ id: 42 }]);
  });

  it('rejects unsupported firefox sidepanel calls and unavailable method paths', async () => {
    const browser = createBrowserFacade({
      raw: {
        tabs: {},
        runtime: {},
      },
      target: 'firefox-mv3',
    });

    await expect(browser.call('sidePanel.open', {})).rejects.toMatchObject({
      code: 'E_TARGET_UNSUPPORTED',
      message:
        'Browser method path is not supported on firefox-mv3: sidePanel.open',
    });

    await expect(browser.call('tabs.query', { active: true })).rejects.toMatchObject({
      code: 'E_CONTEXT_UNAVAILABLE',
      message:
        'Browser method path is unavailable in the current context: tabs.query',
    });
  });

  it('rejects payloads larger than 8 MiB before dispatch', () => {
    const payload = 'a'.repeat(MAX_RUNTIME_PAYLOAD_BYTES + 1024);

    try {
      assertPayloadWithinLimit({ payload });
      throw new Error('expected assertPayloadWithinLimit to throw');
    } catch (error) {
      expect(error).toMatchObject({
        code: 'E_PAYLOAD_TOO_LARGE',
        message: 'Payload exceeds 8 MiB limit.',
      });
    }
  });
});
