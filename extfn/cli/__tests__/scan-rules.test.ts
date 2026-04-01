import { describe, expect, it } from 'vitest';

import { contentSocketsRule } from '../src/scan/rules/contentSockets.js';
import { remoteHostedCodeRule } from '../src/scan/rules/remoteHostedCode.js';

describe('scan rules', () => {
  it('detects remote hosted code with query strings and flexible attribute spacing', () => {
    const findings = remoteHostedCodeRule.evaluate({
      target: 'chromium-mv3',
      outputDir: 'dist/chromium-mv3',
      manifestPath: 'dist/chromium-mv3/manifest.json',
      manifest: {},
      files: [
        {
          absolutePath: '/tmp/popup.html',
          relativePath: 'popup.html',
          contents:
            '<script type="module" src = "https://cdn.example.com/app.js?v=1#hash"></script>',
        },
      ],
    });

    expect(findings).toEqual([
      expect.objectContaining({
        ruleId: 'SCAN-RHC-001',
        file: 'popup.html',
      }),
    ]);
  });

  it('limits socket findings to manifest-declared content scripts', () => {
    const findings = contentSocketsRule.evaluate({
      target: 'chromium-mv3',
      outputDir: 'dist/chromium-mv3',
      manifestPath: 'dist/chromium-mv3/manifest.json',
      manifest: {
        content_scripts: [
          {
            js: ['content/feed.js'],
          },
        ],
      },
      files: [
        {
          absolutePath: '/tmp/background.js',
          relativePath: 'background.js',
          contents: 'new WebSocket("wss://background.example");',
        },
        {
          absolutePath: '/tmp/content/feed.js',
          relativePath: 'content/feed.js',
          contents: 'new WebSocket("wss://content.example");',
        },
      ],
    });

    expect(findings).toEqual([
      expect.objectContaining({
        ruleId: 'SCAN-SOCKET-001',
        file: 'content/feed.js',
      }),
    ]);
  });
});
