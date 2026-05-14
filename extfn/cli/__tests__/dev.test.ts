import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createExec } from '@clifn/core/exec';
import { createOutput } from '@clifn/core/output';

import { createExtfnCli, runDevCommand } from '../src/index.js';

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..'
);

const EXTFN_IMPORT_SPECIFIER = '@extfn/core';

function createTestContext(cwd = REPO_ROOT) {
  const stdout: string[] = [];
  const stderr: string[] = [];

  return {
    stdout,
    stderr,
    ctx: {
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
    },
  };
}

async function createFixtureExtension(): Promise<string> {
  const fixtureDir = await fs.mkdtemp(path.join(os.tmpdir(), 'extfn-cli-dev-'));
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
        targets: ['chromium-mv3', 'firefox-mv3'],
        background: { serviceWorker: './src/background.ts' },
        popup: { entry: './src/popup.html', title: 'Spec Demo' }
      });
    `,
    'utf8'
  );

  return fixtureDir;
}

describe('extfn dev', () => {
  it('exposes the canonical command surface and config flag', async () => {
    const cli = createExtfnCli();
    const commands = cli.commands.map((command) => command.name());
    const packageJson = JSON.parse(
      await fs.readFile(path.join(REPO_ROOT, 'extfn/cli/package.json'), 'utf8')
    ) as {
      bin: Record<string, string>;
      dependencies: Record<string, string>;
    };

    expect(commands).toEqual(['dev', 'build', 'package', 'scan']);
    expect(
      cli.commands.every((command) =>
        command.options.some((option) => option.long === '--config')
      )
    ).toBe(true);
    expect(packageJson.bin.extfn).toBe('./dist/cli.js');
    expect(packageJson.dependencies['@clifn/core']).toBe('0.1.0');
    expect(packageJson.dependencies['@extfn/vite']).toBe('0.1.2');
    expect(
      Object.keys(packageJson.dependencies).some((name) => name.startsWith('hostfn'))
    ).toBe(false);
  });

  it('requires --target when more than one target is configured', async () => {
    const fixtureDir = await createFixtureExtension();

    try {
      const { ctx } = createTestContext(fixtureDir);
      const result = await runDevCommand(
        {
          config: 'extfn.config.ts',
          open: false,
        },
        ctx,
        {
          stayOpen: false,
        }
      );

      expect(result.exitCode).toBe(2);
      expect(result.data).toMatchObject({
        ok: false,
        error: {
          code: 'E_CONFIG_INVALID',
          message:
            'extfn dev requires --target when more than one target is configured.',
        },
      });
    } finally {
      await fs.rm(fixtureDir, { recursive: true, force: true });
    }
  });

  it('emits the active dev output path when target selection is explicit', async () => {
    const fixtureDir = await createFixtureExtension();
    const outputDir = path.join(fixtureDir, 'dist/chromium-mv3-dev');

    try {
      const { ctx, stdout } = createTestContext(fixtureDir);
      const result = await runDevCommand(
        {
          config: 'extfn.config.ts',
          target: 'chromium-mv3',
          open: false,
        },
        ctx,
        {
          stayOpen: false,
        }
      );

      expect(result.exitCode).toBe(0);
      expect(result.data).toMatchObject({
        ok: true,
        target: 'chromium-mv3',
        watching: true,
        printedLoadPath: true,
        devOutput: 'dist/chromium-mv3-dev',
      });
      await expect(
        fs.stat(path.join(outputDir, 'manifest.json'))
      ).resolves.toBeDefined();
      expect(stdout.join('')).toContain('Load the unpacked extension from:');
    } finally {
      await fs.rm(fixtureDir, { recursive: true, force: true });
    }
  });
});
