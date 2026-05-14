import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createExec } from '@clifn/core/exec';
import { createOutput } from '@clifn/core/output';

import { runScanCommand, shouldFailScan, toStructuredLogEvent } from '../src/index.js';

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..'
);
const EXTFN_IMPORT_SPECIFIER = '@extfn/core';

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

async function createFixtureExtension(contents: {
  background: string;
  popup?: string;
}): Promise<string> {
  const fixtureDir = await fs.mkdtemp(path.join(os.tmpdir(), 'extfn-cli-scan-'));
  const srcDir = path.join(fixtureDir, 'src');

  await fs.mkdir(srcDir, { recursive: true });
  await fs.writeFile(path.join(srcDir, 'background.ts'), contents.background, 'utf8');
  await fs.writeFile(
    path.join(srcDir, 'popup.html'),
    contents.popup ??
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

describe('extfn scan', () => {
  it('emits structured enforceable and manual-review findings', async () => {
    const fixtureDir = await createFixtureExtension({
      background:
        "fetch('http://api.example.test/upload'); eval(userSuppliedCode); import('https://cdn.example.test/remote.js');\n",
    });

    try {
      const { ctx } = createTestContext();
      const result = await runScanCommand(
        {
          config: path.join(fixtureDir, 'extfn.config.ts'),
          strict: true,
          format: 'json',
        },
        ctx
      );

      expect(result.report.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ruleId: 'SCAN-RHC-001',
            severity: 'error',
            category: 'security',
            actionability: 'enforceable',
          }),
          expect.objectContaining({
            ruleId: 'SCAN-HTTP-001',
            severity: 'error',
            category: 'security',
            actionability: 'enforceable',
          }),
          expect.objectContaining({
            ruleId: 'SCAN-PERM-001',
            severity: 'warning',
            category: 'permissions',
            actionability: 'enforceable',
          }),
          expect.objectContaining({
            ruleId: 'SCAN-PRIVACY-001',
            severity: 'warning',
            category: 'privacy',
            actionability: 'manual-review',
          }),
        ])
      );
      expect(shouldFailScan(result.report)).toBe(true);
    } finally {
      await fs.rm(fixtureDir, { recursive: true, force: true });
    }
  });

  it('preserves findings when strict mode is disabled', async () => {
    const fixtureDir = await createFixtureExtension({
      background:
        "fetch('http://api.example.test/upload'); eval(userSuppliedCode); import('https://cdn.example.test/remote.js');\n",
    });

    try {
      const { ctx } = createTestContext();
      const strictResult = await runScanCommand(
        {
          config: path.join(fixtureDir, 'extfn.config.ts'),
          strict: true,
          format: 'json',
        },
        ctx
      );
      const relaxedResult = await runScanCommand(
        {
          config: path.join(fixtureDir, 'extfn.config.ts'),
          strict: false,
          format: 'json',
        },
        ctx
      );

      expect(shouldFailScan(strictResult.report)).toBe(true);
      expect(shouldFailScan(relaxedResult.report)).toBe(false);
      expect(relaxedResult.report.findings).toEqual(strictResult.report.findings);
    } finally {
      await fs.rm(fixtureDir, { recursive: true, force: true });
    }
  });

  it('scans a representative extension without blocking findings', async () => {
    const fixtureDir = await createFixtureExtension({
      background: 'console.log("background")\n',
    });

    try {
      const { ctx } = createTestContext();
      const result = await runScanCommand(
        {
          config: path.join(fixtureDir, 'extfn.config.ts'),
          strict: true,
        },
        ctx
      );

      expect(result.report.summary.errorCount).toBe(0);
    } finally {
      await fs.rm(fixtureDir, { recursive: true, force: true });
    }
  });

  it('redacts sensitive payload fields in structured logs', () => {
    expect(
      toStructuredLogEvent({
        level: 'error',
        code: 'E_TIMEOUT',
        message: 'Timed out',
        namespace: 'auth',
        method: 'refresh',
        payload: {
          token: 'secret-token',
          userId: 'u1',
        },
      })
    ).toEqual({
      code: 'E_TIMEOUT',
      details: undefined,
      message: 'Timed out',
      method: 'refresh',
      namespace: 'auth',
      payload: {
        token: '[REDACTED]',
        userId: 'u1',
      },
      sourceContext: undefined,
      target: undefined,
    });
  });
});
