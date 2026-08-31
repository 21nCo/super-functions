import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getSchema, SENDFN_SCHEMA_VERSION } from '../src/schema';
import { StrongMockAdapter, WeakOverwriteMockAdapter, assertTestDoubleFidelity } from './mock-adapter';

type ReleaseGateResult = {
  allPassed: boolean;
  error?: {
    code: string;
    message: string;
  };
};

function evaluateTypeScriptReleaseGateFailure(command: string, stderr: string): ReleaseGateResult {
  if (command === 'npm run build --workspace sendfn/typescript' && /tsup: command not found/i.test(stderr)) {
    return {
      allPassed: false,
      error: {
        code: 'SENDFN_RELEASE_GATE_FAILED',
        message: 'TypeScript build tooling is not available from the documented install path',
      },
    };
  }

  return { allPassed: true };
}

describe('release gate metadata', () => {
  it('stores email recipient lists in a JSON-compatible field', () => {
    const schema = getSchema();
    const emailTransactions = schema.schemas.find((table) => table.modelName === 'email_transactions');

    expect(SENDFN_SCHEMA_VERSION).toBe(2);
    expect(emailTransactions?.fields.to).toMatchObject({ type: 'json', required: true });
  });

  it('documents repo-root TypeScript release-gate commands and required tooling', () => {
    const packageJson = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    );
    const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
    const eventExample = readFileSync(new URL('../examples/event-handling.ts', import.meta.url), 'utf8');

    expect(packageJson.scripts).toMatchObject({
      build: 'tsup',
      lint: 'tsc --noEmit',
      test: 'vitest run',
      'release:verify': 'npm run build && npm run lint && npm test -- --run',
    });
    expect(packageJson.devDependencies).toMatchObject({
      tsup: expect.any(String),
      typescript: expect.any(String),
      vitest: expect.any(String),
    });

    expect(readme).toContain('npm install');
    expect(readme).toContain('npm run build --workspace sendfn/typescript');
    expect(readme).toContain('npm run lint --workspace sendfn/typescript');
    expect(readme).toContain('npm test --workspace sendfn/typescript -- --run');
    expect(readme).toContain('npm run release:verify');
    expect(readme).not.toContain('npm run release:verify --workspace sendfn/typescript');
    expect(readme).toContain("import { sendfn, awsSesAdapter, consoleSmsAdapter } from 'sendfn';");
    expect(readme).toContain("import { apnsAdapter } from 'sendfn/adapters/apns';");
    expect(readme).toContain("app.post('/webhooks/aws-ses'");
    expect(readme).toContain('Present only when awsSns.topicArns is configured');
    expect(eventExample).toContain('AWS_SNS_TOPIC_ARN');
    expect(eventExample).toContain('topicArns: [awsSnsTopicArn]');
    expect(readme).not.toContain('@sendfn/core');
    expect(readme).not.toContain('Twilio');
  });

  it('reports a stable release-gate failure when TypeScript build tooling is missing', () => {
    expect(
      evaluateTypeScriptReleaseGateFailure(
        'npm run build --workspace sendfn/typescript',
        'sh: tsup: command not found',
      ),
    ).toEqual({
      allPassed: false,
      error: {
        code: 'SENDFN_RELEASE_GATE_FAILED',
        message: 'TypeScript build tooling is not available from the documented install path',
      },
    });
  });
});

describe('test double fidelity', () => {
  it('accepts the strong mock adapter and rejects silent overwrite behavior', async () => {
    await expect(assertTestDoubleFidelity(new StrongMockAdapter())).resolves.toBeUndefined();
    await expect(assertTestDoubleFidelity(new WeakOverwriteMockAdapter())).rejects.toMatchObject({
      code: 'SENDFN_TEST_DOUBLE_FIDELITY',
      message: 'Test double silently overwrites duplicate primary keys',
    });
  });
});
