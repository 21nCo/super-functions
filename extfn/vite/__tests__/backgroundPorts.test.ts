import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { discoverBackgroundPorts } from '../src/discovery/backgroundPorts.js';
import { loadExtensionConfig } from '../src/loadExtensionConfig.js';

describe('discoverBackgroundPorts', () => {
  it('discovers modular port handlers and supports coexistence with message handlers', async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'extfn-ports-'));
    const sourceDir = path.join(cwd, 'src');
    const messageDir = path.join(sourceDir, 'background', 'messages');
    const portDir = path.join(sourceDir, 'background', 'ports');

    await fs.mkdir(messageDir, { recursive: true });
    await fs.mkdir(portDir, { recursive: true });

    try {
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
        path.join(portDir, 'flux.mjs'),
        `
        export default {
          channel: 'flux',
          async onMessage(_runtime, payload, _envelope, port) {
            await port.send({ ok: true, echo: payload });
          },
        };
        `,
        'utf8'
      );
      await fs.writeFile(
        path.join(cwd, 'extfn.config.ts'),
        `
        export default {
          name: 'Ports Demo',
          version: '0.1.0',
          targets: ['chromium-mv3'],
          background: {
            serviceWorker: './src/background.ts',
            messageHandlersDir: './src/background/messages',
            portHandlersDir: './src/background/ports',
          },
        };
        `,
        'utf8'
      );

      const portHandlers = await discoverBackgroundPorts(portDir);
      expect(portHandlers.map((handler) => ({ channel: handler.channel }))).toEqual([
        { channel: 'flux' },
      ]);

      await expect(loadExtensionConfig(path.join(cwd, 'extfn.config.ts'))).resolves.toMatchObject({
        config: {
          background: {
            messageHandlersDir: './src/background/messages',
            portHandlersDir: './src/background/ports',
          },
        },
      });

      await fs.writeFile(
        path.join(portDir, 'duplicate.mjs'),
        `
        export default {
          channel: 'flux',
          async onMessage() {},
        };
        `,
        'utf8'
      );

      await expect(discoverBackgroundPorts(portDir)).rejects.toMatchObject({
        code: 'E_MANIFEST_COLLISION',
        message: 'Duplicate background port channel: flux',
      });
    } finally {
      await fs.rm(cwd, { recursive: true, force: true });
    }
  });
});
