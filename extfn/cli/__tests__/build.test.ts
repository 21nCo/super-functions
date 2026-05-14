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
const EXTFN_IMPORT_SPECIFIER = '@extfn/core';

async function createFixtureExtension(): Promise<string> {
  const fixtureDir = await fs.mkdtemp(path.join(os.tmpdir(), 'extfn-cli-build-'));
  const srcDir = path.join(fixtureDir, 'src');

  await fs.mkdir(srcDir, { recursive: true });
  await fs.writeFile(
    path.join(srcDir, 'background.ts'),
    'console.log("background")\n',
    'utf8'
  );
  await fs.writeFile(
    path.join(srcDir, 'popup.html'),
    '<!doctype html><html><body><script type="module" src="./popup.ts"></script></body></html>\n',
    'utf8'
  );
  await fs.writeFile(path.join(srcDir, 'popup.ts'), 'console.log("popup")\n', 'utf8');
  await fs.writeFile(
    path.join(fixtureDir, 'extfn.config.ts'),
    `
      import { defineExtension } from '${EXTFN_IMPORT_SPECIFIER}';

      export default defineExtension({
        name: 'Spec Demo',
        version: '0.1.0',
        targets: ['chromium-mv3'],
        background: { serviceWorker: './src/background.ts' },
        popup: { entry: './src/popup.html', title: 'Spec Demo' }
      });
    `,
    'utf8'
  );

  return fixtureDir;
}

describe('extfn build', () => {
  it('resolves the Vite CLI entrypoint from the installed package', () => {
    expect(resolveViteCliEntrypoint().replace(/\\/g, '/')).toContain(
      '/vite/bin/vite.js'
    );
  });

  it('builds successfully even when cwd is not the repository root', async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'extfn-build-cwd-'));
    const fixtureDir = await createFixtureExtension();
    const stdout: string[] = [];
    const stderr: string[] = [];

    try {
      const result = await buildExtension(
        {
          config: path.join(fixtureDir, 'extfn.config.ts'),
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
      await fs.rm(fixtureDir, { recursive: true, force: true });
    }
  });
});
