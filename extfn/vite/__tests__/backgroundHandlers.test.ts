import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { discoverBackgroundHandlers } from '../src/discovery/backgroundHandlers.js';

describe('discoverBackgroundHandlers', () => {
  it('discovers modular handlers deterministically and rejects duplicates', async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'extfn-handlers-'));
    const handlersDir = path.join(cwd, 'handlers');
    await fs.mkdir(handlersDir, { recursive: true });

    try {
      await fs.writeFile(
        path.join(handlersDir, 'upload.mjs'),
        `
        export default {
          namespace: 'upload',
          method: 'start',
          handle: async () => ({ accepted: true }),
        };
        `,
        'utf8'
      );

      const handlers = await discoverBackgroundHandlers(handlersDir);
      expect(handlers.map((handler) => ({
        namespace: handler.namespace,
        method: handler.method,
      }))).toEqual([{ namespace: 'upload', method: 'start' }]);

      await fs.writeFile(
        path.join(handlersDir, 'upload-duplicate.mjs'),
        `
        export default {
          namespace: 'upload',
          method: 'start',
          handle: async () => ({ accepted: true }),
        };
        `,
        'utf8'
      );

      await expect(discoverBackgroundHandlers(handlersDir)).rejects.toMatchObject({
        code: 'E_MANIFEST_COLLISION',
        message: 'Duplicate background handler route: upload/start',
      });
    } finally {
      await fs.rm(cwd, { recursive: true, force: true });
    }
  });
});
