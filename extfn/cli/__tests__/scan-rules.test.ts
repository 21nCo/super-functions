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

  it('derives the scan path prefix from the output directory', () => {
    const findings = contentSocketsRule.evaluate({
      target: 'firefox-mv3',
      outputDir: 'dist/custom-firefox',
      manifestPath: 'dist/custom-firefox/manifest.json',
      manifest: {
        content_scripts: [
          {
            js: ['content/feed.js'],
          },
        ],
      },
      files: [
        {
          absolutePath: '/tmp/custom-firefox/content/feed.js',
          relativePath: 'custom-firefox/content/feed.js',
          contents: 'new WebSocket("wss://content.example");',
        },
      ],
    });

    expect(findings).toEqual([
      expect.objectContaining({
        ruleId: 'SCAN-SOCKET-001',
        file: 'custom-firefox/content/feed.js',
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
          contents: [
            'http://www.w3.org/1998/Math/MathML',
            'http://www.w3.org/1999/xhtml',
            'http://www.w3.org/1999/xlink',
            'http://www.w3.org/2000/svg',
            'http://www.w3.org/2000/xmlns/',
            'http://www.w3.org/XML/1998/namespace',
          ]
            .map((uri, index) => `const NS_${index} = "${uri}";`)
            .join(' '),
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

  it('still flags insecure w3.org URLs that are not exact namespace identifiers', () => {
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
            'fetch("http://www.w3.org/api"); fetch("http://www.w3.org/2000/svg/network");',
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

  it('flags exact namespace URIs when they are used as transport endpoints', () => {
    for (const contents of [
      'fetch("http://www.w3.org/2000/svg");',
      'new Request("http://www.w3.org/2000/svg");',
      'xhr.open("GET", "http://www.w3.org/2000/svg");',
      'xhr.open(method, "http://www.w3.org/2000/svg");',
      'window.open("http://www.w3.org/2000/svg");',
      'location = "http://www.w3.org/2000/svg";',
      'window.location.href = "http://www.w3.org/2000/svg";',
      'location.assign("http://www.w3.org/2000/svg");',
      '<img src=http://www.w3.org/2000/svg>',
      'background: url(http://www.w3.org/2000/svg)',
    ]) {
      const findings = insecureTransportRule.evaluate({
        target: 'chromium-mv3',
        outputDir: 'dist/chromium-mv3',
        manifestPath: 'dist/chromium-mv3/manifest.json',
        manifest: {},
        files: [
          {
            absolutePath: '/tmp/popup.js',
            relativePath: 'popup.js',
            contents,
          },
        ],
      });

      expect(findings).toEqual([
        expect.objectContaining({
          ruleId: 'SCAN-HTTP-001',
          file: 'popup.js',
        }),
      ]);
    }
  });

  it('allows exact namespace identifiers in unquoted HTML attributes', () => {
    const findings = insecureTransportRule.evaluate({
      target: 'chromium-mv3',
      outputDir: 'dist/chromium-mv3',
      manifestPath: 'dist/chromium-mv3/manifest.json',
      manifest: {},
      files: [
        {
          absolutePath: '/tmp/popup.html',
          relativePath: 'popup.html',
          contents: '<svg xmlns=http://www.w3.org/2000/svg></svg>',
        },
      ],
    });

    expect(findings).toEqual([]);
  });

  it('flags allowlisted namespace constants used by transport APIs', () => {
    for (const contents of [
      'const endpoint = "http://www.w3.org/2000/svg"; fetch(endpoint);',
      'const endpoint = "http://www.w3.org/2000/svg"; xhr.open(method, endpoint);',
      'const endpoint = "http://www.w3.org/2000/svg"; window.open(endpoint);',
      'const endpoint = "http://www.w3.org/2000/svg"; location.href = endpoint;',
    ]) {
      const findings = insecureTransportRule.evaluate({
        target: 'chromium-mv3',
        outputDir: 'dist/chromium-mv3',
        manifestPath: 'dist/chromium-mv3/manifest.json',
        manifest: {},
        files: [
          {
            absolutePath: '/tmp/popup.js',
            relativePath: 'popup.js',
            contents,
          },
        ],
      });

      expect(findings).toEqual([
        expect.objectContaining({
          ruleId: 'SCAN-HTTP-001',
          file: 'popup.js',
        }),
      ]);
    }
  });

  it('does not flag namespace constants reassigned before transport', () => {
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
            'let endpoint = "http://www.w3.org/2000/svg"; endpoint = "https://example.com"; fetch(endpoint);',
        },
      ],
    });

    expect(findings).toEqual([]);
  });

  it('does not treat property writes as namespace variable reassignment', () => {
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
            'const endpoint = "http://www.w3.org/2000/svg"; config.endpoint = "https://example.com"; fetch(endpoint);',
        },
      ],
    });

    expect(findings).toHaveLength(1);
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

  it('does not treat nested objects named after browser globals as global eval', () => {
    const findings = dynamicExecutionRule.evaluate({
      target: 'chromium-mv3',
      outputDir: 'dist/chromium-mv3',
      manifestPath: 'dist/chromium-mv3/manifest.json',
      manifest: {},
      files: [
        {
          absolutePath: '/tmp/vendor.js',
          relativePath: 'vendor.js',
          contents: [
            'sandbox.window.eval(input);',
            'sandbox.window["eval"](input);',
            '(sandbox.window).eval(input);',
            'foo(window).eval(input);',
            'foo(((window))).eval(input);',
            'parse(self).eval(input);',
            'Object(self)?.eval(input);',
            'wrap(globalThis)["eval"](input);',
            'sandbox.window.Function("return 1");',
            'foo(window).Function("return 1");',
            'foo(((window))).Function("return 1");',
            'wrap(globalThis)["Function"]("return 1");',
            'foo(eval)(input);',
            'foo(Function)(input);',
            'foo()(eval)(input);',
            'if (ready) foo (eval)(input);',
            '/* window.eval(input); */',
            'const source = "window/* retained */.eval(input)";',
          ].join('\n'),
        },
      ],
    });

    expect(findings).toEqual([]);
  });

  it('flags direct calls to the global eval', () => {
    for (const contents of [
      'eval(untrusted);',
      '(eval)(untrusted);',
      'if (ready) (eval)(untrusted);',
      'const slash = /[//]/; eval(untrusted);',
      'const star = /[/*]/; eval(untrusted);',
    ]) {
      const findings = dynamicExecutionRule.evaluate({
        target: 'chromium-mv3',
        outputDir: 'dist/chromium-mv3',
        manifestPath: 'dist/chromium-mv3/manifest.json',
        manifest: {},
        files: [
          {
            absolutePath: '/tmp/vendor.js',
            relativePath: 'vendor.js',
            contents,
          },
        ],
      });

      expect(findings).toEqual([
        expect.objectContaining({
          ruleId: 'SCAN-DYN-001',
          file: 'vendor.js',
        }),
      ]);
    }
  });

  it('flags eval accessed through browser global objects', () => {
    for (const contents of [
      'window.eval(untrusted);',
      'globalThis.eval(untrusted);',
      'self?.eval(untrusted);',
      '(window).eval(untrusted);',
      '((window)).eval(untrusted);',
      '(((window)))?.eval(untrusted);',
      'return (window).eval(untrusted);',
      'while (ready) (window).eval(untrusted);',
      'window["eval"](untrusted);',
      'window[`eval`](untrusted);',
      '(globalThis)?.["eval"](untrusted);',
      '((globalThis))["eval"](untrusted);',
      'window/* retained */.eval(untrusted);',
    ]) {
      const findings = dynamicExecutionRule.evaluate({
        target: 'chromium-mv3',
        outputDir: 'dist/chromium-mv3',
        manifestPath: 'dist/chromium-mv3/manifest.json',
        manifest: {},
        files: [
          {
            absolutePath: '/tmp/vendor.js',
            relativePath: 'vendor.js',
            contents,
          },
        ],
      });

      expect(findings).toEqual([
        expect.objectContaining({
          ruleId: 'SCAN-DYN-001',
          file: 'vendor.js',
        }),
      ]);
    }
  });

  it('flags Function constructor calls with and without new', () => {
    for (const contents of [
      'Function("return 1");',
      'new Function("return 1");',
      '(Function)("return 1");',
      'window.Function("return 1");',
      'globalThis?.Function("return 1");',
      'self["Function"]("return 1");',
      'window[`Function`]("return 1");',
      '((window)).Function("return 1");',
      '((globalThis))["Function"]("return 1");',
    ]) {
      const findings = dynamicExecutionRule.evaluate({
        target: 'chromium-mv3',
        outputDir: 'dist/chromium-mv3',
        manifestPath: 'dist/chromium-mv3/manifest.json',
        manifest: {},
        files: [
          {
            absolutePath: '/tmp/vendor.js',
            relativePath: 'vendor.js',
            contents,
          },
        ],
      });

      expect(findings).toEqual([
        expect.objectContaining({
          ruleId: 'SCAN-DYN-001',
          file: 'vendor.js',
        }),
      ]);
    }
  });
});
