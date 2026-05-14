import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { createServer } from 'vite';
import { describe, expect, it, vi } from 'vitest';

import { resolveExtensionConfig } from '@extfn/core';

import {
  assertSafeReloadDecision,
  decideReloadStrategy,
  detectChangedSurface,
  extfnVite,
} from '../src/index.js';

describe('reload policy', () => {
  it('distinguishes hmr, reinjection, and full reload strategies', () => {
    expect(
      decideReloadStrategy({
        changedFile: 'src/popup/App.svelte',
        surface: 'popup',
        target: 'chromium-mv3',
      })
    ).toMatchObject({ strategy: 'hmr' });

    expect(
      decideReloadStrategy({
        changedFile: 'src/content/twitter.ts',
        surface: 'content',
        target: 'chromium-mv3',
      })
    ).toMatchObject({ strategy: 'reinject' });

    expect(
      decideReloadStrategy({
        changedFile: 'src/background/index.ts',
        surface: 'background',
        target: 'chromium-mv3',
      })
    ).toMatchObject({ strategy: 'full-reload' });
  });

  it('rejects unsafe hmr selection for content surfaces', () => {
    const unsafeDecision = {
        changedFile: 'src/content/twitter.ts',
        reason: 'forced unsafe mode',
        strategy: 'hmr',
        surface: 'content',
        target: 'chromium-mv3',
      } as const;

    try {
      assertSafeReloadDecision(unsafeDecision);
      throw new Error('Expected unsafe content HMR decision to throw.');
    } catch (error) {
      expect(error).toMatchObject({
      code: 'E_CONFIG_INVALID',
      message: 'Unsafe HMR strategy selected for content surface.',
      });
    }
  });

  it('detects changed surfaces from resolved extension entries', async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'extfn-reload-'));
    const srcDir = path.join(cwd, 'src');

    await fs.mkdir(srcDir, { recursive: true });
    await fs.writeFile(path.join(srcDir, 'background.ts'), 'export {}\n', 'utf8');
    await fs.writeFile(path.join(srcDir, 'popup.html'), '<html></html>\n', 'utf8');
    await fs.writeFile(path.join(srcDir, 'content.ts'), 'export {}\n', 'utf8');

    try {
      const resolved = await resolveExtensionConfig(
        {
          name: 'Reload Demo',
          version: '0.1.0',
          targets: ['chromium-mv3'],
          background: { serviceWorker: './src/background.ts' },
          popup: { entry: './src/popup.html' },
          contentScripts: [
            {
              id: 'feed',
              entry: './src/content.ts',
              matches: ['https://example.com/*'],
            },
          ],
        },
        {
          configPath: path.join(cwd, 'extfn.config.ts'),
        }
      );

      expect(
        detectChangedSurface(resolved, path.join(srcDir, 'popup.html'))
      ).toBe('popup');
      expect(
        detectChangedSurface(resolved, path.join(srcDir, 'content.ts'))
      ).toBe('content');
      expect(
        detectChangedSurface(resolved, path.join(srcDir, 'background.ts'))
      ).toBe('background');
    } finally {
      await fs.rm(cwd, { recursive: true, force: true });
    }
  });

  it('emits structured dev logs and dev target directories', async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'extfn-reload-'));
    const srcDir = path.join(cwd, 'src');
    const logs: string[] = [];

    await fs.mkdir(srcDir, { recursive: true });
    await fs.writeFile(path.join(srcDir, 'background.ts'), 'export {}\n', 'utf8');
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
        name: 'Reload Demo',
        version: '0.1.0',
        targets: ['chromium-mv3', 'firefox-mv3'],
        background: { serviceWorker: './src/background.ts' },
        popup: { entry: './src/popup.html' }
      };
      `,
      'utf8'
    );

    try {
      const server = await createServer({
        configFile: false,
        root: cwd,
        logLevel: 'silent',
        plugins: [...extfnVite({ configPath: path.join(cwd, 'extfn.config.ts') })],
        customLogger: {
          clearScreen() {},
          error(message) {
            logs.push(`error:${String(message)}`);
          },
          hasErrorLogged() {
            return false;
          },
          hasWarned: false,
          info(message) {
            logs.push(String(message));
          },
          warn(message) {
            logs.push(`warn:${String(message)}`);
          },
        },
      });

      await server.listen();
      await server.watcher.emit('change', path.join(srcDir, 'background.ts'));
      await new Promise((resolve) => setTimeout(resolve, 50));
      await server.close();

      await expect(
        fs.stat(path.join(cwd, 'dist', 'chromium-mv3-dev', 'manifest.json'))
      ).resolves.toBeDefined();
      await expect(
        fs.stat(path.join(cwd, 'dist', 'firefox-mv3-dev', 'manifest.json'))
      ).resolves.toBeDefined();
      expect(logs.some((entry) => entry.includes('"strategy":"full-reload"'))).toBe(
        true
      );
    } finally {
      await fs.rm(cwd, { recursive: true, force: true });
    }
  });
});
