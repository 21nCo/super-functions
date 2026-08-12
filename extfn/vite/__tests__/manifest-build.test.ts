import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { build } from 'vite';
import { describe, expect, it } from 'vitest';

import { buildManifest, createTargetBuildOutputs, extfnVite } from '../src/index.js';
import { loadExtensionConfig } from '../src/loadExtensionConfig.js';
import { applyFirefoxTargetManifest } from '../src/targets/firefox.js';

describe('buildManifest', () => {
  it('builds deterministic dual-target manifests and emits target directories through vite build', async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'extfn-vite-build-'));
    const srcDir = path.join(cwd, 'src');

    await fs.mkdir(srcDir, { recursive: true });
    await fs.writeFile(path.join(srcDir, 'background.ts'), 'export {}\n', 'utf8');
    await fs.writeFile(path.join(srcDir, 'content.ts'), 'export {}\n', 'utf8');
    await fs.writeFile(path.join(srcDir, 'content.css'), '.root{color:red;}\n', 'utf8');
    await fs.writeFile(
      path.join(srcDir, 'popup.html'),
      '<!doctype html><html><body><script type="module" src="./popup.ts"></script></body></html>\n',
      'utf8'
    );
    await fs.writeFile(path.join(srcDir, 'popup.ts'), 'console.log("popup")\n', 'utf8');
    await fs.writeFile(
      path.join(cwd, 'extfn.config.ts'),
      `
      export default {
        name: 'Dual Target Demo',
        version: '0.1.0',
        targets: ['chromium-mv3', 'firefox-mv3'],
        background: { serviceWorker: './src/background.ts' },
        popup: { entry: './src/popup.html', title: 'Popup' },
        contentScripts: [
          {
            id: 'feed',
            entry: './src/content.ts',
            matches: ['https://example.com/*'],
            css: ['./src/content.css']
          }
        ]
      };
      `,
      'utf8'
    );

    try {
      await build({
        configFile: false,
        root: cwd,
        logLevel: 'silent',
        plugins: [...extfnVite({ configPath: path.join(cwd, 'extfn.config.ts') })],
      });

      const chromiumManifestPath = path.join(
        cwd,
        'dist',
        'chromium-mv3',
        'manifest.json'
      );
      const firefoxManifestPath = path.join(
        cwd,
        'dist',
        'firefox-mv3',
        'manifest.json'
      );

      await expect(fs.stat(chromiumManifestPath)).resolves.toBeDefined();
      await expect(fs.stat(firefoxManifestPath)).resolves.toBeDefined();

      const chromiumManifest = JSON.parse(
        await fs.readFile(chromiumManifestPath, 'utf8')
      );
      const firefoxManifest = JSON.parse(
        await fs.readFile(firefoxManifestPath, 'utf8')
      );

      expect(chromiumManifest.action).toEqual({
        default_popup: 'popup.html',
        default_title: 'Popup',
      });
      expect(chromiumManifest.content_scripts).toEqual([
        {
          css: ['content/feed/content.css'],
          js: ['content/feed.js'],
          matches: ['https://example.com/*'],
        },
      ]);
      expect(firefoxManifest.browser_specific_settings).toEqual({
        gecko: {
          id: 'extfn@example.local',
        },
      });
      expect(chromiumManifest.background).toEqual({
        service_worker: 'background.js',
        type: 'module',
      });
      expect(firefoxManifest.background).toEqual({
        scripts: ['background.js'],
        type: 'module',
      });

      await expect(
        fs.stat(path.join(cwd, 'dist', 'chromium-mv3', 'background.js'))
      ).resolves.toBeDefined();
      await expect(
        fs.stat(path.join(cwd, 'dist', 'firefox-mv3', 'content', 'feed.js'))
      ).resolves.toBeDefined();
      await expect(
        fs.stat(
          path.join(cwd, 'dist', 'chromium-mv3', 'content', 'feed', 'content.css')
        )
      ).resolves.toBeDefined();
    } finally {
      await fs.rm(cwd, { recursive: true, force: true });
    }
  });

  it('fails before output emission when sidepanel is unsupported for a configured target', async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'extfn-vite-build-'));
    const srcDir = path.join(cwd, 'src');

    await fs.mkdir(srcDir, { recursive: true });
    await fs.writeFile(path.join(srcDir, 'background.ts'), 'export {}\n', 'utf8');
    await fs.writeFile(path.join(srcDir, 'sidepanel.html'), '<html></html>\n', 'utf8');
    await fs.writeFile(
      path.join(cwd, 'extfn.config.ts'),
      `
      export default {
        name: 'Bad Sidepanel',
        version: '0.1.0',
        targets: ['chromium-mv3', 'firefox-mv3'],
        background: { serviceWorker: './src/background.ts' },
        sidepanel: { entry: './src/sidepanel.html' }
      };
      `,
      'utf8'
    );

    try {
      await expect(
        build({
          configFile: false,
          root: cwd,
          logLevel: 'silent',
          plugins: [...extfnVite({ configPath: path.join(cwd, 'extfn.config.ts') })],
        })
      ).rejects.toMatchObject({
        code: 'E_TARGET_UNSUPPORTED',
        message:
          'sidepanel is not available for every configured target; scope the surface or remove unsupported targets.',
      });
    } finally {
      await fs.rm(cwd, { recursive: true, force: true });
    }
  });

  it('produces stable manifest structures for identical inputs', async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'extfn-manifest-'));
    const srcDir = path.join(cwd, 'src');

    await fs.mkdir(srcDir, { recursive: true });
    await fs.writeFile(path.join(srcDir, 'background.ts'), 'export {}\n', 'utf8');
    await fs.writeFile(path.join(srcDir, 'popup.html'), '<html></html>\n', 'utf8');
    await fs.writeFile(
      path.join(cwd, 'extfn.config.ts'),
      `
      export default {
        name: 'Pages Demo',
        version: '0.1.0',
        targets: ['chromium-mv3'],
        background: { serviceWorker: './src/background.ts' },
        popup: { entry: './src/popup.html', title: 'Popup' }
      };
      `,
      'utf8'
    );

    try {
      const loaded = await loadExtensionConfig(path.join(cwd, 'extfn.config.ts'));
      const resolved = await import('@extfn/core').then((module) =>
        module.resolveExtensionConfig(loaded.config, {
          configPath: loaded.configPath,
        })
      );
      const outputs = createTargetBuildOutputs(resolved);

      const manifestA = buildManifest(resolved, 'chromium-mv3', outputs);
      const manifestB = buildManifest(resolved, 'chromium-mv3', outputs);

      expect(JSON.stringify(manifestA)).toBe(JSON.stringify(manifestB));
    } finally {
      await fs.rm(cwd, { recursive: true, force: true });
    }
  });

  it('preserves user gecko settings while keeping the default firefox id', async () => {
    const manifest = applyFirefoxTargetManifest({
      name: 'Firefox demo',
      browser_specific_settings: {
        gecko: {
          strict_min_version: '128.0',
        },
      },
    });

    expect(manifest.browser_specific_settings).toEqual({
      gecko: {
        id: 'extfn@example.local',
        strict_min_version: '128.0',
      },
    });
  });

  it('translates the background service worker into event-page scripts for firefox', () => {
    const manifest = applyFirefoxTargetManifest({
      name: 'Firefox demo',
      background: {
        service_worker: 'background.js',
        type: 'module',
      },
    });

    expect(manifest.background).toEqual({
      scripts: ['background.js'],
      type: 'module',
    });
  });

  it('preserves existing firefox background scripts when translating a service worker', () => {
    const manifest = applyFirefoxTargetManifest({
      name: 'Firefox demo',
      background: {
        scripts: ['polyfill.js'],
        service_worker: 'background.js',
        type: 'module',
      },
    });

    expect(manifest.background).toEqual({
      scripts: ['polyfill.js', 'background.js'],
      type: 'module',
    });

    const deduplicatedManifest = applyFirefoxTargetManifest({
      name: 'Firefox demo',
      background: {
        scripts: ['polyfill.js', 'background.js'],
        service_worker: 'background.js',
      },
    });

    expect(deduplicatedManifest.background).toEqual({
      scripts: ['polyfill.js', 'background.js'],
    });
  });
});
