import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';

import {
  MountRegistry,
  defineContentScript,
  mountContentScript,
} from '../src/index.js';

describe('content reinjection', () => {
  it('remains idempotent across repeated navigation and DOM replacement fixtures', async () => {
    const dom = new JSDOM(`<main><div id="player-1"></div></main>`);
    const registry = new MountRegistry();
    let renderCalls = 0;
    let connectedMessaging = false;
    const contentScript = defineContentScript({
      id: 'youtube-toolbar',
      entry: './__tests__/fixtures/content/youtube-toolbar.ts',
      matches: ['https://youtube.com/*'],
      anchors: [{ kind: 'selector', selector: '#player-1', mountMode: 'append' }],
    });

    await mountContentScript(contentScript, {
      document: dom.window.document,
      moduleId: contentScript.id,
      registry,
      render({ root }) {
        renderCalls += 1;
        connectedMessaging = true;
        root.textContent = 'toolbar';
      },
    });

    await mountContentScript(contentScript, {
      document: dom.window.document,
      moduleId: contentScript.id,
      registry,
      render() {
        renderCalls += 1;
      },
    });

    expect(
      dom.window.document.querySelectorAll('[data-extfn-module-id="youtube-toolbar"]').length
    ).toBe(1);
    expect(connectedMessaging).toBe(true);
    expect(renderCalls).toBe(1);

    const oldAnchor = dom.window.document.querySelector('#player-1');
    oldAnchor?.replaceWith(dom.window.document.createElement('div'));
    const replacement = dom.window.document.querySelector('main > div:last-child')!;
    replacement.id = 'player-1';

    await mountContentScript(contentScript, {
      document: dom.window.document,
      moduleId: contentScript.id,
      registry,
      render({ root }) {
        renderCalls += 1;
        connectedMessaging = true;
        root.textContent = 'toolbar-remounted';
      },
    });

    expect(
      dom.window.document.querySelectorAll('[data-extfn-module-id="youtube-toolbar"]').length
    ).toBe(1);
    expect(renderCalls).toBe(2);
    expect(connectedMessaging).toBe(true);
  });

  it('attaches styles idempotently and normalizes roots for shadow-root isolation', async () => {
    const dom = new JSDOM(`<main><button data-testid="bookmark"></button></main>`);
    const registry = new MountRegistry();
    const contentScript = defineContentScript({
      id: 'twitter-toolbar',
      entry: './__tests__/fixtures/content/twitter-post.ts',
      matches: ['*://*.x.com/*'],
      anchors: [
        { kind: 'selector-list', selector: '[data-testid="bookmark"]', mountMode: 'shadow' },
      ],
      css: ['.toolbar { color: rgb(29, 78, 216); }'],
      styleIsolation: 'shadow-root',
      normalizeRootStyles: true,
    });

    const firstMount = await mountContentScript(contentScript, {
      document: dom.window.document,
      moduleId: contentScript.id,
      registry,
      render({ shadowRoot }) {
        shadowRoot?.append(dom.window.document.createElement('span'));
      },
    });

    await mountContentScript(contentScript, {
      document: dom.window.document,
      moduleId: contentScript.id,
      registry,
      render() {},
    });

    const root = firstMount[0]!;
    const shadowRoot = root.shadowRoot!;
    expect(shadowRoot.querySelectorAll('style[data-extfn-style="twitter-toolbar:styles"]').length).toBe(1);
    expect(root.style.fontFamily).toBe('ui-sans-serif, system-ui, sans-serif');
    expect(root.style.boxSizing).toBe('border-box');
  });
});
