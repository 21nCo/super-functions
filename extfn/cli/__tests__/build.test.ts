import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createExec } from '@clifn/core/exec';
import { createOutput } from '@clifn/core/output';

import {
  buildExtension,
  resolveViteCliEntrypoint,
} from '../src/commands/build.js';

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..'
);

describe('extfn build', () => {
  it('resolves the Vite CLI entrypoint from the installed package', () => {
    expect(resolveViteCliEntrypoint().replace(/\\/g, '/')).toContain(
      '/vite/bin/vite.js'
    );
  });

  it('builds successfully even when cwd is not the repository root', async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'extfn-build-cwd-'));
    const stdout: string[] = [];
    const stderr: string[] = [];

    try {
      const result = await buildExtension(
        {
          config: path.join(
            REPO_ROOT,
            'extfn/examples/vanilla-messaging-demo/extfn.config.ts'
          ),
          target: 'chromium-mv3',
        },
        {
          cwd,
          env: process.env,
          exec: createExec(),
          output: createOutput({
            color: false,
            stdout: (text) => {
              stdout.push(text);
            },
            stderr: (text) => {
              stderr.push(text);
            },
          }),
        }
      );

      expect(result.targets).toEqual(['chromium-mv3']);
      await expect(
        fs.stat(path.join(result.outputDirs['chromium-mv3'], 'manifest.json'))
      ).resolves.toBeDefined();
    } finally {
      await fs.rm(cwd, { recursive: true, force: true });
    }
  });
});
