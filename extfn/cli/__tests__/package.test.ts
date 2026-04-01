import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';

import { unzipSync } from 'fflate';
import { createExec } from 'clifn/exec';
import { createOutput } from 'clifn/output';

import { runPackageCommand } from '../src/index.js';

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..'
);
const EXTFN_IMPORT_URL = pathToFileURL(
  path.join(REPO_ROOT, 'extfn/core/dist/index.js')
).href;

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

async function createFixtureExtension(backgroundSource: string): Promise<string> {
  const fixtureDir = await fs.mkdtemp(path.join(os.tmpdir(), 'extfn-cli-package-'));
  const srcDir = path.join(fixtureDir, 'src');

  await fs.mkdir(srcDir, { recursive: true });
  await fs.writeFile(path.join(srcDir, 'background.ts'), backgroundSource, 'utf8');
  await fs.writeFile(
    path.join(srcDir, 'popup.html'),
    '<!doctype html><html><body><script type="module" src="./popup.ts"></script></body></html>\n',
    'utf8'
  );
  await fs.writeFile(path.join(srcDir, 'popup.ts'), 'console.log("popup")\n', 'utf8');
  await fs.writeFile(
    path.join(fixtureDir, 'extfn.config.ts'),
    `
      import { defineExtension } from '${EXTFN_IMPORT_URL}';

      export default defineExtension({
        name: 'Spec Demo',
        version: '0.1.0',
        targets: ['chromium-mv3', 'firefox-mv3'],
        background: { serviceWorker: './src/background.ts' },
        popup: { entry: './src/popup.html', title: 'Spec Demo' },
        manifest: {
          host_permissions: ['<all_urls>']
        }
      });
    `,
    'utf8'
  );

  return fixtureDir;
}

describe('extfn package', () => {
  it('builds, scans, and emits deterministic .zip and .xpi archives', async () => {
    const outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'extfn-cli-artifacts-'));
    const { ctx } = createTestContext();

    try {
      const result = await runPackageCommand(
        {
          config: 'extfn/examples/svelte-multi-content-demo/extfn.config.ts',
          outDir,
        },
        ctx
      );

      expect(result.exitCode).toBe(0);
      expect(result.archives.map((archive) => path.basename(archive.file))).toEqual([
        'svelte-multi-content-demo-0.1.0-chromium-mv3.zip',
        'svelte-multi-content-demo-0.1.0-firefox-mv3.xpi',
      ]);

      const firstBytes = await Promise.all(
        result.archives.map((archive) => fs.readFile(archive.file))
      );
      const secondRun = await runPackageCommand(
        {
          config: 'extfn/examples/svelte-multi-content-demo/extfn.config.ts',
          outDir,
        },
        ctx
      );
      const secondBytes = await Promise.all(
        secondRun.archives.map((archive) => fs.readFile(archive.file))
      );

      expect(secondRun.exitCode).toBe(0);
      expect(secondBytes.map((buffer) => Buffer.from(buffer))).toEqual(
        firstBytes.map((buffer) => Buffer.from(buffer))
      );

      const unzipEntries = unzipSync(new Uint8Array(firstBytes[0]));
      expect(Object.keys(unzipEntries)).toEqual(
        expect.arrayContaining(['manifest.json', 'background.js'])
      );
    } finally {
      await fs.rm(outDir, { recursive: true, force: true });
    }
  });

  it('blocks archive emission when scan findings are blocking in strict mode', async () => {
    const fixtureDir = await createFixtureExtension(
      "fetch('http://api.example.test/upload'); eval(userSuppliedCode); import('https://cdn.example.test/remote.js');\n"
    );
    const outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'extfn-cli-blocked-'));
    const { ctx } = createTestContext();

    try {
      const result = await runPackageCommand(
        {
          config: path.join(fixtureDir, 'extfn.config.ts'),
          outDir,
        },
        ctx
      );

      expect(result.exitCode).toBe(1);
      expect(result.archives).toEqual([]);
      expect(result.scanReportPath).toBeDefined();
    } finally {
      await fs.rm(outDir, { recursive: true, force: true });
      await fs.rm(fixtureDir, { recursive: true, force: true });
    }
  });

  it('emits archives when strict mode is explicitly disabled', async () => {
    const fixtureDir = await createFixtureExtension(
      "fetch('http://api.example.test/upload'); eval(userSuppliedCode); import('https://cdn.example.test/remote.js');\n"
    );
    const outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'extfn-cli-relaxed-'));
    const { ctx } = createTestContext();

    try {
      const result = await runPackageCommand(
        {
          config: path.join(fixtureDir, 'extfn.config.ts'),
          outDir,
          strict: false,
        },
        ctx
      );

      expect(result.exitCode).toBe(0);
      expect(result.archives.map((archive) => path.extname(archive.file))).toEqual([
        '.zip',
        '.xpi',
      ]);
      await Promise.all(
        result.archives.map((archive) =>
          expect(fs.stat(archive.file)).resolves.toBeDefined()
        )
      );
    } finally {
      await fs.rm(outDir, { recursive: true, force: true });
      await fs.rm(fixtureDir, { recursive: true, force: true });
    }
  });
});
