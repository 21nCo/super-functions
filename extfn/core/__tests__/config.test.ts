import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  defineExtension,
  resolveExtensionConfig,
} from '../src/index.js';

describe('resolveExtensionConfig', () => {
  it('resolves relative entries from the config file directory and builds target manifests', async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'extfn-config-'));
    const configPath = path.join(cwd, 'nested', 'extfn.config.ts');
    const sourceDir = path.join(cwd, 'nested', 'src');
    const messageDir = path.join(sourceDir, 'background', 'messages');

    await fs.mkdir(messageDir, { recursive: true });
    await fs.writeFile(configPath, '// fixture\n', 'utf8');
    await fs.writeFile(path.join(sourceDir, 'background.ts'), 'export {}\n', 'utf8');
    await fs.writeFile(path.join(sourceDir, 'popup.html'), '<html></html>\n', 'utf8');
    await fs.writeFile(path.join(sourceDir, 'options.html'), '<html></html>\n', 'utf8');
    await fs.writeFile(
      path.join(messageDir, 'upload.mjs'),
      `
      export default {
        namespace: 'upload',
        method: 'start',
        handle: async () => ({ accepted: true }),
      };
      `,
      'utf8'
    );

    try {
      const resolved = await resolveExtensionConfig(
        defineExtension({
          name: 'Pages Demo',
          version: '0.1.0',
          targets: ['chromium-mv3'],
          background: {
            serviceWorker: './src/background.ts',
            messageHandlersDir: './src/background/messages',
          },
          popup: {
            entry: './src/popup.html',
            title: 'Popup',
          },
          options: {
            entry: './src/options.html',
            title: 'Options',
          },
        }),
        {
          configPath,
        }
      );

      expect(resolved.configPath).toBe(configPath);
      expect(resolved.surfaces).toEqual([
        expect.objectContaining({
          surface: 'popup',
          entry: './src/popup.html',
          resolvedEntry: path.join(sourceDir, 'popup.html'),
          outputPath: 'popup.html',
          targets: ['chromium-mv3'],
        }),
        expect.objectContaining({
          surface: 'options',
          entry: './src/options.html',
          resolvedEntry: path.join(sourceDir, 'options.html'),
          outputPath: 'options.html',
          targets: ['chromium-mv3'],
        }),
      ]);
      expect(resolved.background).toEqual(
        expect.objectContaining({
          serviceWorker: './src/background.ts',
          resolvedServiceWorker: path.join(sourceDir, 'background.ts'),
          messageHandlersDir: './src/background/messages',
          resolvedMessageHandlersDir: path.join(sourceDir, 'background', 'messages'),
          messageHandlers: [
            expect.objectContaining({
              namespace: 'upload',
              method: 'start',
            }),
          ],
        })
      );
      expect(resolved.manifests['chromium-mv3']).toEqual({
        action: {
          default_popup: 'popup.html',
        },
        options_ui: {
          page: 'options.html',
          open_in_tab: true,
        },
        background: {
          service_worker: 'background.ts',
          type: 'module',
        },
      });
    } finally {
      await fs.rm(cwd, { recursive: true, force: true });
    }
  });

  it('rejects unsupported targets and unsupported sidepanel coverage deterministically', async () => {
    await expect(
      resolveExtensionConfig(
        defineExtension({
          name: 'Bad Sidepanel',
          version: '0.1.0',
          targets: ['chromium-mv3', 'firefox-mv3'],
          background: {
            serviceWorker: './src/background.ts',
          },
          sidepanel: {
            entry: './src/sidepanel.html',
          },
        }),
        {
          configPath: path.join(process.cwd(), 'extfn.config.ts'),
        }
      )
    ).rejects.toMatchObject({
      code: 'E_TARGET_UNSUPPORTED',
      message:
        'sidepanel is not available for every configured target; scope the surface or remove unsupported targets.',
    });

    await expect(
      resolveExtensionConfig(
        defineExtension({
          name: 'Bad Target',
          version: '0.1.0',
          targets: ['safari-mv3' as 'chromium-mv3'],
          background: {
            serviceWorker: './src/background.ts',
          },
        }),
        {
          configPath: path.join(process.cwd(), 'extfn.config.ts'),
        }
      )
    ).rejects.toMatchObject({
      code: 'E_CONFIG_INVALID',
      message: 'Unsupported target: safari-mv3',
    });
  });

  it('fails for missing page entries and duplicate background routes', async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'extfn-config-'));
    const configPath = path.join(cwd, 'extfn.config.ts');
    const sourceDir = path.join(cwd, 'src');
    const messageDir = path.join(sourceDir, 'background', 'messages');

    await fs.mkdir(messageDir, { recursive: true });
    await fs.writeFile(configPath, '// fixture\n', 'utf8');
    await fs.writeFile(path.join(sourceDir, 'background.ts'), 'export {}\n', 'utf8');
    await fs.writeFile(
      path.join(messageDir, 'first.mjs'),
      `
      export default {
        namespace: 'upload',
        method: 'start',
        handle: async () => ({ ok: true }),
      };
      `,
      'utf8'
    );
    await fs.writeFile(
      path.join(messageDir, 'second.mjs'),
      `
      export default {
        namespace: 'upload',
        method: 'start',
        handle: async () => ({ ok: true }),
      };
      `,
      'utf8'
    );

    try {
      await expect(
        resolveExtensionConfig(
          defineExtension({
            name: 'Missing Popup',
            version: '0.1.0',
            targets: ['chromium-mv3'],
            background: {
              serviceWorker: './src/background.ts',
            },
            popup: {
              entry: './src/popup.html',
            },
          }),
          {
            configPath,
          }
        )
      ).rejects.toMatchObject({
        code: 'E_ENTRY_NOT_FOUND',
        message: 'Missing page entry: ./src/popup.html',
      });

      await fs.writeFile(path.join(sourceDir, 'popup.html'), '<html></html>\n', 'utf8');

      await expect(
        resolveExtensionConfig(
          defineExtension({
            name: 'Duplicate Handlers',
            version: '0.1.0',
            targets: ['chromium-mv3'],
            background: {
              serviceWorker: './src/background.ts',
              messageHandlersDir: './src/background/messages',
            },
            popup: {
              entry: './src/popup.html',
            },
          }),
          {
            configPath,
          }
        )
      ).rejects.toMatchObject({
        code: 'E_MANIFEST_COLLISION',
        message: 'Duplicate background handler route: upload/start',
      });
    } finally {
      await fs.rm(cwd, { recursive: true, force: true });
    }
  });

  it('ignores declaration files when discovering handler modules', async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'extfn-config-'));
    const configPath = path.join(cwd, 'extfn.config.ts');
    const sourceDir = path.join(cwd, 'src');
    const messageDir = path.join(sourceDir, 'background', 'messages');

    await fs.mkdir(messageDir, { recursive: true });
    await fs.writeFile(configPath, '// fixture\n', 'utf8');
    await fs.writeFile(path.join(sourceDir, 'background.ts'), 'export {}\n', 'utf8');
    await fs.writeFile(
      path.join(messageDir, 'upload.mjs'),
      `
      export default {
        namespace: 'upload',
        method: 'start',
        handle: async () => ({ ok: true }),
      };
      `,
      'utf8'
    );
    await fs.writeFile(
      path.join(messageDir, 'upload.d.ts'),
      'export interface Upload {}\n',
      'utf8'
    );

    try {
      const resolved = await resolveExtensionConfig(
        defineExtension({
          name: 'Declarations',
          version: '0.1.0',
          targets: ['chromium-mv3'],
          background: {
            serviceWorker: './src/background.ts',
            messageHandlersDir: './src/background/messages',
          },
        }),
        {
          configPath,
        }
      );

      expect(resolved.background.messageHandlers).toHaveLength(1);
      expect(resolved.background.messageHandlers[0]).toMatchObject({
        namespace: 'upload',
        method: 'start',
      });
    } finally {
      await fs.rm(cwd, { recursive: true, force: true });
    }
  });
});
