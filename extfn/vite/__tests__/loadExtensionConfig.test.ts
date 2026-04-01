import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { loadExtensionConfig } from '../src/loadExtensionConfig.js';

describe('loadExtensionConfig', () => {
  it('loads a valid config fixture and resolves entries relative to the config file directory', async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'extfn-vite-loader-'));
    const configDir = path.join(cwd, 'app');
    const sourceDir = path.join(configDir, 'src');
    const handlerDir = path.join(sourceDir, 'background', 'messages');

    await fs.mkdir(sourceDir, { recursive: true });
    await fs.mkdir(handlerDir, { recursive: true });
    await fs.writeFile(path.join(sourceDir, 'background.ts'), 'export {}\n', 'utf8');
    await fs.writeFile(path.join(sourceDir, 'popup.html'), '<html></html>\n', 'utf8');
    await fs.writeFile(
      path.join(handlerDir, 'ping.ts'),
      `
      export default {
        namespace: 'demo',
        method: 'ping',
        handle: async () => ({ ok: true }),
      };
      `,
      'utf8'
    );
    await fs.writeFile(
      path.join(configDir, 'extfn.config.ts'),
      `
      export default {
        name: 'Spec Demo',
        version: '0.1.0',
        targets: ['chromium-mv3'],
        background: {
          serviceWorker: './src/background.ts',
          messageHandlersDir: './src/background/messages'
        },
        popup: { entry: './src/popup.html', title: 'Popup' },
      };
      `,
      'utf8'
    );

    try {
      const loaded = await loadExtensionConfig(
        path.join(configDir, 'extfn.config.ts')
      );

      expect(loaded.configPath).toBe(path.join(configDir, 'extfn.config.ts'));
      expect(loaded.config).toEqual({
        name: 'Spec Demo',
        version: '0.1.0',
        targets: ['chromium-mv3'],
        background: {
          serviceWorker: './src/background.ts',
          messageHandlersDir: './src/background/messages',
        },
        popup: { entry: './src/popup.html', title: 'Popup' },
      });
      expect(loaded.resolvedConfig.background.messageHandlers).toEqual([
        expect.objectContaining({
          namespace: 'demo',
          method: 'ping',
        }),
      ]);
    } finally {
      await fs.rm(cwd, { recursive: true, force: true });
    }
  });

  it('rejects missing default exports and unsupported targets with extfn errors', async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'extfn-vite-loader-'));
    const sourceDir = path.join(cwd, 'src');

    await fs.mkdir(sourceDir, { recursive: true });
    await fs.writeFile(path.join(sourceDir, 'background.ts'), 'export {}\n', 'utf8');

    try {
      const namedOnlyPath = path.join(cwd, 'named-only.config.ts');
      await fs.writeFile(
        namedOnlyPath,
        `
        export const config = {
          name: 'Named Only',
          version: '0.1.0',
          targets: ['chromium-mv3'],
          background: { serviceWorker: './src/background.ts' },
        };
        `,
        'utf8'
      );

      await expect(loadExtensionConfig(namedOnlyPath)).rejects.toMatchObject({
        code: 'E_CONFIG_INVALID',
        message:
          'Extension config file must default-export defineExtension(...).',
      });

      const unsupportedTargetPath = path.join(cwd, 'unsupported-target.config.ts');
      await fs.writeFile(
        unsupportedTargetPath,
        `
        export default {
          name: 'Bad Target',
          version: '0.1.0',
          targets: ['safari-mv3'],
          background: { serviceWorker: './src/background.ts' },
        };
        `,
        'utf8'
      );

      await expect(
        loadExtensionConfig(unsupportedTargetPath)
      ).rejects.toMatchObject({
        code: 'E_CONFIG_INVALID',
        message: 'Unsupported target: safari-mv3',
      });
    } finally {
      await fs.rm(cwd, { recursive: true, force: true });
    }
  });

  it('fails deterministically for missing page entries and unsupported sidepanel coverage', async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'extfn-vite-loader-'));
    const sourceDir = path.join(cwd, 'src');

    await fs.mkdir(sourceDir, { recursive: true });
    await fs.writeFile(path.join(sourceDir, 'background.ts'), 'export {}\n', 'utf8');

    try {
      const missingEntryPath = path.join(cwd, 'missing-entry.config.ts');
      await fs.writeFile(
        missingEntryPath,
        `
        export default {
          name: 'Missing Entry',
          version: '0.1.0',
          targets: ['chromium-mv3'],
          background: { serviceWorker: './src/background.ts' },
          popup: { entry: './src/popup.html' },
        };
        `,
        'utf8'
      );

      await expect(loadExtensionConfig(missingEntryPath)).rejects.toMatchObject({
        code: 'E_ENTRY_NOT_FOUND',
        message: 'Missing page entry: ./src/popup.html',
      });

      await fs.writeFile(path.join(sourceDir, 'sidepanel.html'), '<html></html>\n', 'utf8');

      const badSidepanelPath = path.join(cwd, 'bad-sidepanel.config.ts');
      await fs.writeFile(
        badSidepanelPath,
        `
        export default {
          name: 'Bad Sidepanel',
          version: '0.1.0',
          targets: ['chromium-mv3', 'firefox-mv3'],
          background: { serviceWorker: './src/background.ts' },
          sidepanel: { entry: './src/sidepanel.html' },
        };
        `,
        'utf8'
      );

      await expect(loadExtensionConfig(badSidepanelPath)).rejects.toMatchObject({
        code: 'E_TARGET_UNSUPPORTED',
        message:
          'sidepanel is not available for every configured target; scope the surface or remove unsupported targets.',
      });
    } finally {
      await fs.rm(cwd, { recursive: true, force: true });
    }
  });
});
