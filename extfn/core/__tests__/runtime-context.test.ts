import { describe, expect, it } from 'vitest';

import {
  assertValidCapabilityMap,
  createRuntime,
  detectBrowserTarget,
  getBrowserCapabilities,
  mergeManifestPermissions,
  resolveRuntimeAddress,
} from '../src/index.js';

describe('runtime context', () => {
  it('resolves content runtime metadata including tab and frame identifiers', () => {
    const runtime = createRuntime({
      globals: {
        location: {
          protocol: 'https:',
          pathname: '/timeline',
        },
        document: {},
        browser: {},
        __EXTFN_CONTENT_SCRIPT_ID__: 'twitter-profile',
        __EXTFN_TAB_ID__: 42,
        __EXTFN_FRAME_ID__: 0,
      },
      target: 'firefox-mv3',
    });

    expect(runtime.address).toEqual({
      context: 'content',
      contentScriptId: 'twitter-profile',
      tabId: 42,
      frameId: 0,
    });
    expect(runtime.capabilities).toEqual({
      target: 'firefox-mv3',
      sidepanel: false,
      offscreen: false,
      scripting: true,
    });
    expect(runtime.browser.capabilities).toEqual(runtime.capabilities);
  });

  it('detects popup, options, sidepanel, and background contexts from extension URLs', () => {
    expect(
      resolveRuntimeAddress({
        location: {
          protocol: 'chrome-extension:',
          pathname: '/popup/index.html',
        },
        chrome: {},
      })
    ).toEqual({
      context: 'popup',
      surfaceId: 'popup',
    });

    expect(
      resolveRuntimeAddress({
        location: {
          protocol: 'chrome-extension:',
          pathname: '/options/index.html',
        },
        chrome: {},
      })
    ).toEqual({
      context: 'options',
      surfaceId: 'options',
    });

    expect(
      resolveRuntimeAddress({
        location: {
          protocol: 'chrome-extension:',
          pathname: '/sidepanel/index.html',
        },
        chrome: {},
      })
    ).toEqual({
      context: 'sidepanel',
      surfaceId: 'sidepanel',
    });

    expect(
      resolveRuntimeAddress({
        location: {
          protocol: 'moz-extension:',
          pathname: '/background.html',
        },
        browser: {},
      })
    ).toEqual({
      context: 'background',
      surfaceId: 'background',
    });
  });

  it('fails when runtime context cannot be resolved', () => {
    try {
      resolveRuntimeAddress({
        browser: {},
      });
      throw new Error('expected resolveRuntimeAddress to throw');
    } catch (error) {
      expect(error).toMatchObject({
        code: 'E_CONTEXT_UNAVAILABLE',
        message: 'Runtime context could not be resolved.',
      });
    }
  });

  it('derives target-specific capabilities and rejects invalid capability maps', () => {
    expect(detectBrowserTarget({
      location: {
        protocol: 'moz-extension:',
      },
      browser: {},
    })).toBe('firefox-mv3');

    expect(getBrowserCapabilities('chromium-mv3')).toEqual({
      target: 'chromium-mv3',
      sidepanel: true,
      offscreen: true,
      scripting: true,
    });

    try {
      assertValidCapabilityMap({
        target: 'firefox-mv3',
        sidepanel: true,
        offscreen: false,
        scripting: true,
      });
      throw new Error('expected assertValidCapabilityMap to throw');
    } catch (error) {
      expect(error).toMatchObject({
        code: 'E_RUNTIME_PROTOCOL',
        message: 'Capability registry emitted an invalid target capability map.',
      });
    }
  });

  it('merges permissions deterministically and rejects duplicates', () => {
    expect(
      mergeManifestPermissions({
        config: {
          permissions: ['storage'],
          optionalPermissions: ['tabs'],
          hostPermissions: ['https://example.com/*'],
        },
        plugins: [
          {
            permissions: ['alarms'],
            hostPermissions: ['https://api.example.com/*'],
          },
        ],
      })
    ).toEqual({
      permissions: ['alarms', 'storage'],
      optionalPermissions: ['tabs'],
      hostPermissions: ['https://api.example.com/*', 'https://example.com/*'],
    });

    try {
      mergeManifestPermissions({
        config: {
          permissions: ['storage'],
        },
        plugins: [
          {
            permissions: ['storage'],
          },
        ],
      });
      throw new Error('expected mergeManifestPermissions to throw');
    } catch (error) {
      expect(error).toMatchObject({
        code: 'E_CONFIG_INVALID',
        message: 'Duplicate permissions declaration: storage',
      });
    }
  });
});
