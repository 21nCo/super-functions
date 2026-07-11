import { describe, expect, it } from 'vitest';

import { contentSocketsRule } from '../src/scan/rules/contentSockets.js';
import { dynamicExecutionRule } from '../src/scan/rules/dynamicExecution.js';
import { insecureTransportRule } from '../src/scan/rules/insecureTransport.js';
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

  it('matches content scripts even when scan paths carry a target prefix', () => {
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
          absolutePath: '/tmp/chromium-mv3/content/feed.js',
          relativePath: 'chromium-mv3/content/feed.js',
          contents: 'new WebSocket("wss://content.example");',
        },
      ],
    });

    expect(findings).toEqual([
      expect.objectContaining({
        ruleId: 'SCAN-SOCKET-001',
        file: 'chromium-mv3/content/feed.js',
      }),
    ]);
  });

  it('does not flag the SVG namespace URI as insecure transport', () => {
    const findings = insecureTransportRule.evaluate({
      target: 'chromium-mv3',
      outputDir: 'dist/chromium-mv3',
      manifestPath: 'dist/chromium-mv3/manifest.json',
      manifest: {},
      files: [
        {
          absolutePath: '/tmp/popup.js',
          relativePath: 'popup.js',
          contents:
            'const NS = "http://www.w3.org/2000/svg"; el.setAttributeNS(NS, "x", "1");',
        },
      ],
    });

    expect(findings).toEqual([]);
  });

  it('still flags genuine insecure http transport alongside namespace URIs', () => {
    const findings = insecureTransportRule.evaluate({
      target: 'chromium-mv3',
      outputDir: 'dist/chromium-mv3',
      manifestPath: 'dist/chromium-mv3/manifest.json',
      manifest: {},
      files: [
        {
          absolutePath: '/tmp/popup.js',
          relativePath: 'popup.js',
          contents:
            'const NS = "http://www.w3.org/2000/svg"; fetch("http://api.example.com/data");',
        },
      ],
    });

    expect(findings).toEqual([
      expect.objectContaining({
        ruleId: 'SCAN-HTTP-001',
        file: 'popup.js',
      }),
    ]);
  });

  it('does not flag member-access methods named eval as dynamic execution', () => {
    const findings = dynamicExecutionRule.evaluate({
      target: 'chromium-mv3',
      outputDir: 'dist/chromium-mv3',
      manifestPath: 'dist/chromium-mv3/manifest.json',
      manifest: {},
      files: [
        {
          absolutePath: '/tmp/vendor.js',
          relativePath: 'vendor.js',
          contents: 'sourceMap.eval(input);',
        },
      ],
    });

    expect(findings).toEqual([]);
  });

  it('flags direct calls to the global eval', () => {
    const findings = dynamicExecutionRule.evaluate({
      target: 'chromium-mv3',
      outputDir: 'dist/chromium-mv3',
      manifestPath: 'dist/chromium-mv3/manifest.json',
      manifest: {},
      files: [
        {
          absolutePath: '/tmp/vendor.js',
          relativePath: 'vendor.js',
          contents: 'eval(untrusted);',
        },
      ],
    });

    expect(findings).toEqual([
      expect.objectContaining({
        ruleId: 'SCAN-DYN-001',
        file: 'vendor.js',
      }),
    ]);
  });
});
