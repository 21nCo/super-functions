import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';

import {
  MountRegistry,
  createMountRootId,
  defineContentScript,
  resolveAnchors,
  mountContentScript,
  validateContentScripts,
} from '../src/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, 'fixtures', 'content');
const coreDir = path.resolve(__dirname, '..');

describe('content anchors', () => {
  it('supports multiple content modules without mount collisions', async () => {
    const dom = new JSDOM(`
      <main>
        <section id="post-anchor"></section>
        <section id="profile-anchor"></section>
      </main>
    `);
    const registry = new MountRegistry();
    const scripts = [
      defineContentScript({
        id: 'twitter-post',
        entry: './__tests__/fixtures/content/twitter-post.ts',
        matches: ['https://x.com/*'],
        anchors: [{ kind: 'selector', selector: '#post-anchor', mountMode: 'append' }],
      }),
      defineContentScript({
        id: 'twitter-profile',
        entry: './__tests__/fixtures/content/twitter-profile.ts',
        matches: ['https://x.com/*'],
        anchors: [{ kind: 'selector', selector: '#profile-anchor', mountMode: 'append' }],
      }),
    ];

    for (const script of scripts) {
      await mountContentScript(script, {
        document: dom.window.document,
        moduleId: script.id,
        registry,
        render({ root }) {
          root.textContent = script.id;
        },
      });
    }

    expect(createMountRootId('twitter-post', 'twitter-post/anchor-0')).toBe(
      'extfn-root-twitter-post'
    );
    expect(createMountRootId('twitter-profile', 'twitter-profile/anchor-0')).toBe(
      'extfn-root-twitter-profile'
    );
    expect(
      [...dom.window.document.querySelectorAll('[data-extfn-module-id]')].map(
        (node) => node.id
      )
    ).toEqual([
      'extfn-root-twitter-post-post-anchor',
      'extfn-root-twitter-profile-profile-anchor',
    ]);
  });

  it('resolves selector-list and resolver anchors, tolerates empty anchors, and logs resolver failures', async () => {
    const dom = new JSDOM(`
      <main>
        <article class="tweet" data-testid="tweet-1"></article>
        <article class="tweet" data-testid="tweet-2"></article>
        <aside data-toolbar="primary"></aside>
      </main>
    `);
    const registry = new MountRegistry();
    const loggedErrors: string[] = [];
    const resolverModule = await import(
      pathToFileURL(path.join(fixturesDir, 'resolvers.mjs')).href
    );

    const healthyScript = defineContentScript({
      id: 'twitter-toolbar',
      entry: './__tests__/fixtures/content/twitter-post.ts',
      matches: ['https://x.com/*'],
      anchors: [
        { kind: 'selector-list', selector: '.tweet', mountMode: 'append' },
        { kind: 'resolver', exportName: 'getToolbarAnchors', mountMode: 'shadow' },
      ],
      css: ['.toolbar { color: red; }'],
      styleIsolation: 'shadow-root',
      normalizeRootStyles: true,
    });

    const mounted = await mountContentScript(healthyScript, {
      document: dom.window.document,
      moduleId: healthyScript.id,
      registry,
      resolverLoader: async (exportName) => resolverModule[exportName],
      logger(error) {
        loggedErrors.push((error as { code: string }).code);
      },
      render({ root, shadowRoot }) {
        (shadowRoot ?? root).append(dom.window.document.createElement('span'));
      },
    });

    expect(mounted).toHaveLength(3);
    expect(loggedErrors).toEqual([]);

    const missingAnchors = await mountContentScript(
      defineContentScript({
        id: 'empty-script',
        entry: './__tests__/fixtures/content/twitter-profile.ts',
        matches: ['https://x.com/*'],
        anchors: [{ kind: 'selector-list', selector: '.missing', mountMode: 'append' }],
      }),
      {
        document: dom.window.document,
        moduleId: 'empty-script',
        registry,
        render() {},
      }
    );
    expect(missingAnchors).toHaveLength(0);

    await mountContentScript(
      defineContentScript({
        id: 'broken-resolver',
        entry: './__tests__/fixtures/content/twitter-profile.ts',
        matches: ['https://x.com/*'],
        anchors: [{ kind: 'resolver', exportName: 'getBrokenAnchors', mountMode: 'append' }],
      }),
      {
        document: dom.window.document,
        moduleId: 'broken-resolver',
        registry,
        resolverLoader: async (exportName) => resolverModule[exportName],
        logger(error) {
          loggedErrors.push((error as { code: string }).code);
        },
        render() {},
      }
    );

    expect(loggedErrors).toContain('E_ANCHOR_RESOLUTION');
    expect(
      dom.window.document.querySelectorAll('[data-extfn-module-id="twitter-toolbar"]').length
    ).toBe(3);
  });

  it('creates unique keys for multiple selector anchors in one content script', async () => {
    const dom = new JSDOM(`
      <main>
        <section class="target" id="first"></section>
        <section class="target" id="second"></section>
      </main>
    `);

    const anchors = await resolveAnchors(
      defineContentScript({
        id: 'selector-script',
        entry: './__tests__/fixtures/content/twitter-post.ts',
        matches: ['https://x.com/*'],
        anchors: [
          { kind: 'selector', selector: '#first', mountMode: 'append' },
          { kind: 'selector', selector: '#second', mountMode: 'append' },
        ],
      }),
      {
        document: dom.window.document,
        moduleId: 'selector-script',
      }
    );

    expect(anchors.map((anchor) => anchor.anchorKey)).toEqual([
      'selector-script/first',
      'selector-script/second',
    ]);
  });

  it('validates content script ids, entries, and style isolation deterministically', async () => {
    await expect(
      validateContentScripts(
        [
          defineContentScript({
            id: 'twitter-post',
            entry: './__tests__/fixtures/content/twitter-post.ts',
            matches: ['https://x.com/*'],
          }),
          defineContentScript({
            id: 'twitter-post',
            entry: './__tests__/fixtures/content/twitter-profile.ts',
            matches: ['https://x.com/*'],
          }),
        ],
        coreDir
      )
    ).rejects.toMatchObject({
      code: 'E_CONFIG_INVALID',
      message: 'Duplicate content script id: twitter-post',
    });

    await expect(
      validateContentScripts(
        [
          {
            id: 'twitter-toolbar',
            entry: './__tests__/fixtures/content/twitter-post.ts',
            matches: ['https://x.com/*'],
            styleIsolation: 'global' as 'inherit',
          },
        ],
        coreDir
      )
    ).rejects.toMatchObject({
      code: 'E_CONFIG_INVALID',
      message: 'Unsupported styleIsolation mode: global',
    });

    await expect(
      validateContentScripts(
        [
          defineContentScript({
            id: 'missing-entry',
            entry: './__tests__/fixtures/content/missing.ts',
            matches: ['https://x.com/*'],
          }),
        ],
        coreDir
      )
    ).rejects.toMatchObject({
      code: 'E_ENTRY_NOT_FOUND',
      message: 'Missing content entry: ./__tests__/fixtures/content/missing.ts',
    });

    await expect(
      validateContentScripts(
        [
          defineContentScript({
            id: 'bad-target',
            entry: './__tests__/fixtures/content/twitter-post.ts',
            matches: ['https://x.com/*'],
            targets: ['safari-mv3' as 'chromium-mv3'],
          }),
        ],
        coreDir
      )
    ).rejects.toMatchObject({
      code: 'E_CONFIG_INVALID',
      message: 'Content script bad-target contains unsupported target: safari-mv3',
    });

    await expect(
      validateContentScripts(
        [
          defineContentScript({
            id: 'out-of-scope',
            entry: './__tests__/fixtures/content/twitter-post.ts',
            matches: ['https://x.com/*'],
            targets: ['firefox-mv3'],
          }),
        ],
        coreDir,
        ['chromium-mv3']
      )
    ).rejects.toMatchObject({
      code: 'E_CONFIG_INVALID',
      message:
        'Content script out-of-scope target is not listed in extension.targets: firefox-mv3',
    });
  });
});
