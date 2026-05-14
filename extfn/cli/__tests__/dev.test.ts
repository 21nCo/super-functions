import fs from 'node:fs/promises';
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

function createTestContext() {
  const stdout: string[] = [];
  const stderr: string[] = [];

  return {
    stdout,
    stderr,
    ctx: {
      cwd: REPO_ROOT,
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
    const { ctx } = createTestContext();
    const result = await runDevCommand(
      {
        config: 'extfn/examples/svelte-multi-content-demo/extfn.config.ts',
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
  });

  it('emits the active dev output path when target selection is explicit', async () => {
    const outputDir = path.join(
      REPO_ROOT,
      'extfn/examples/svelte-multi-content-demo/dist/chromium-mv3-dev'
    );
    await fs.rm(path.join(REPO_ROOT, 'extfn/examples/svelte-multi-content-demo/dist'), {
      recursive: true,
      force: true,
    });

    const { ctx, stdout } = createTestContext();
    const result = await runDevCommand(
      {
        config: 'extfn/examples/svelte-multi-content-demo/extfn.config.ts',
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
      devOutput:
        'extfn/examples/svelte-multi-content-demo/dist/chromium-mv3-dev',
    });
    await expect(fs.stat(path.join(outputDir, 'manifest.json'))).resolves.toBeDefined();
    expect(stdout.join('')).toContain('Load the unpacked extension from:');
  });
});
