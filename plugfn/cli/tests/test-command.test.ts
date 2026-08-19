import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  formatDiagnosticReport,
  runProviderDiagnostics,
  testCommand,
} from '../src/commands/test.js';

describe('plugfn cli test command', () => {
  it('returns deterministic success diagnostics against configured runtime state', async () => {
    const report = await runProviderDiagnostics({
      provider: 'github',
      userId: 'user_1',
      action: 'issues.get',
    }, {
      runtime: createRuntimeHarness(),
    });

    expect(report.ok).toBe(true);
    expect(report.status).toBe('pass');
    expect(report.exitCode).toBe(0);
    expect(report.provider).toBe('github');
    expect(report.action).toBe('issues.get');
    expect(report.checks.runtime).toBe(true);
    expect(report.checks.provider).toBe(true);
    expect(report.checks.connection).toBe(true);
    expect(report.checks.action).toBe(true);
    expect(report.checks.oauth).toBe(true);
  });

  it('loads runtime from plugfn.config.ts when no runtime dependency is injected', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'plugfn-cli-'));
    writeFileSync(
      join(cwd, 'plugfn.config.ts'),
      `export const plug = {
  config: {
    baseUrl: 'https://app.example.com',
    integrations: {
      github: {
        type: 'oauth2',
        redirectUris: ['https://app.example.com/callback']
      }
    }
  },
  connections: {
    async list() { return [{ id: 'conn_cfg_1' }]; },
    async getAuthUrl() { return 'https://github.com/login/oauth/authorize?state=cfg'; }
  },
  webhooks: {
    async handle() { return { ok: true }; }
  },
  providers: {
    get(name) { return name === 'github' ? { name: 'github' } : undefined; }
  },
  github: {
    async ['issues.get']() { return { id: 1 }; }
  }
};`
    );

    const report = await runProviderDiagnostics(
      {
        provider: 'github',
        userId: 'user_1',
        action: 'issues.get',
      },
      { cwd }
    );

    expect(report.ok).toBe(true);
    expect(report.metadata.configPath).toContain('plugfn.config.ts');
  });

  it('fails with CLI_PROVIDER_CHECK_FAILED for broken connection resolution', async () => {
    const report = await runProviderDiagnostics({
      provider: 'github',
      userId: 'user_1',
      action: 'issues.get',
    }, {
      runtime: createRuntimeHarness({
        connections: [],
      }),
    });

    expect(report.ok).toBe(false);
    expect(report.exitCode).toBe(2);
    expect(report.error).toMatchObject({
      code: 'CLI_PROVIDER_CHECK_FAILED',
    });
  });

  it('sets exit code 3 on webhook diagnostic failure in json mode', async () => {
    const stdout = vi.fn();
    const setExitCode = vi.fn();
    const cwd = mkdtempSync(join(tmpdir(), 'plugfn-cli-fixture-'));
    const fixturePath = join(cwd, 'webhook-fixture.json');
    writeFileSync(
      fixturePath,
      JSON.stringify({
        event: 'issues.opened',
        payload: { action: 'opened' },
        headers: {
          'x-hub-signature-256': 'sha256=bad',
        },
        secret: 'whsec_test',
      })
    );

    await testCommand(
      {
        provider: 'github',
        userId: 'user_1',
        action: 'issues.get',
        webhookFixture: fixturePath,
        json: true,
      },
      {
        cwd,
        runtime: createRuntimeHarness({
          webhookError: new Error('signature verification failed'),
        }),
        stdout,
        setExitCode,
      }
    );

    expect(setExitCode).toHaveBeenCalledWith(3);
    const output = stdout.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(output);
    expect(parsed.error.code).toBe('CLI_WEBHOOK_DIAGNOSTIC_FAILED');
  });

  it('formats human-readable output with explicit pass/fail states', async () => {
    const report = await runProviderDiagnostics({
      provider: 'github',
      userId: 'user_1',
      action: 'issues.get',
    }, {
      runtime: createRuntimeHarness(),
    });
    const text = formatDiagnosticReport(report, false);

    expect(text).toContain('Provider diagnostics for github');
    expect(text).toContain('PASS runtime');
    expect(text).toContain('PASS provider');
    expect(text).toContain('PASS connection');
    expect(text).toContain('PASS action');
    expect(text).toContain('PASS oauth');
    expect(text).toContain('Overall: PASS (exit 0)');
  });
});

function createRuntimeHarness(options: {
  connections?: Array<{ id: string }>;
  webhookError?: Error;
} = {}) {
  const connections = options.connections ?? [{ id: 'conn_1' }];

  return {
    config: {
      baseUrl: 'https://app.example.com',
      integrations: {
        github: {
          type: 'oauth2',
          redirectUris: ['https://app.example.com/callback'],
          webhookSecret: 'whsec_test',
        },
      },
    },
    connections: {
      async list() {
        return connections;
      },
      async getAuthUrl() {
        return 'https://github.com/login/oauth/authorize?state=diag';
      },
    },
    webhooks: {
      async handle() {
        if (options.webhookError) {
          throw options.webhookError;
        }
        return { ok: true };
      },
    },
    providers: {
      get(name: string) {
        return name === 'github' ? { name: 'github' } : undefined;
      },
    },
    github: {
      async ['issues.get']() {
        return {
          id: 1,
        };
      },
    },
  };
}
