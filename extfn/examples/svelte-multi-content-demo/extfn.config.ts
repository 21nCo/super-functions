import { defineExtension } from '@extfn/core';

export default defineExtension({
  name: 'Svelte Multi Content Demo',
  version: '0.1.0',
  targets: ['chromium-mv3', 'firefox-mv3'],
  background: {
    serviceWorker: './src/background/index.ts',
    messageHandlersDir: './src/background/messages',
  },
  popup: {
    entry: './src/popup/index.html',
    title: 'Svelte Multi Content Demo',
  },
  contentScripts: [
    {
      id: 'twitter-anchor',
      entry: './src/contents/twitter.ts',
      matches: ['https://twitter.com/*'],
      anchors: [
        {
          kind: 'selector-list',
          selector: '[data-extfn-twitter-anchor]',
          mountMode: 'shadow',
        },
      ],
      styleIsolation: 'shadow-root',
      normalizeRootStyles: true,
    },
    {
      id: 'youtube-anchor',
      entry: './src/contents/youtube.ts',
      matches: ['https://www.youtube.com/*'],
      anchors: [
        {
          kind: 'selector-list',
          selector: '[data-extfn-youtube-anchor]',
          mountMode: 'append',
        },
      ],
    },
  ],
});
