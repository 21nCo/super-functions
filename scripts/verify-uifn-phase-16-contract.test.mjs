import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifyPhase16Requirements,
  inspectGeneratedOutput,
  inspectSourceTemplate,
  verifyPhase16,
} from './verify-uifn-phase-16.mjs';

test('TV-GEN-001-N kills hand-edited generated output', () => {
  assert.deepEqual(inspectGeneratedOutput('canonical\n', 'canonical\n'), []);
  assert.equal(inspectGeneratedOutput('canonical\n', 'hand edit\n')[0].code, 'UIFN_GENERATED_SOURCE_DRIFT');
});

test('TV-REG-001-N kills traversal, repository leakage, and checksum mutation', () => {
  const valid = { destination: 'components/uifn/react/button.ts', contents: 'export const ok = true;\n', outputSha256: 'ad5abda1e1f8bfb618e985a13fbe07068662681d75f2c253244ec898a773c120', bytes: 24 };
  assert.deepEqual(inspectSourceTemplate(valid), []);
  assert.ok(inspectSourceTemplate({ ...valid, destination: '../outside.ts' }).some((failure) => failure.code === 'UIFN_REGISTRY_PATH_ESCAPE'));
  assert.ok(inspectSourceTemplate({ ...valid, contents: "import x from '../../../repo';\n" }).some((failure) => failure.code === 'UIFN_REGISTRY_REPOSITORY_LEAK'));
  assert.ok(inspectSourceTemplate({ ...valid, contents: 'tampered\n' }).some((failure) => failure.code === 'UIFN_REGISTRY_CHECKSUM_MISMATCH'));
});

test('phase requirements preserve the failed subcommand boundary', () => {
  assert.deepEqual(classifyPhase16Requirements([{
    code: 'UIFN_PHASE16_COMMAND_FAILED',
    command: '/opt/homebrew/bin/node scripts/generate-uifn-phase-16.mjs --check',
  }]), { 'GEN-001': 'failed', 'REG-001': 'passed' });
  assert.deepEqual(classifyPhase16Requirements([{
    code: 'UIFN_PHASE16_COMMAND_FAILED',
    command: '/opt/homebrew/bin/npm --workspace @uifn/registry run test',
  }]), { 'GEN-001': 'passed', 'REG-001': 'failed' });
  assert.deepEqual(classifyPhase16Requirements([{
    code: 'UIFN_PHASE16_COMMAND_FAILED',
    command: '/opt/homebrew/bin/node scripts/verify-uifn-phase-16-consumers.mjs',
  }]), { 'GEN-001': 'failed', 'REG-001': 'failed' });
});

test('PHASE_16 static contract is complete', () => {
  const result = verifyPhase16({ staticOnly: true });
  assert.equal(result.status, 'passed', JSON.stringify(result.failures, null, 2));
  assert.deepEqual(result.requirements, { 'GEN-001': 'passed', 'REG-001': 'passed' });
  assert.equal(result.vectors['TV-GEN-001-P/N'].components, 69);
  assert.equal(result.vectors['TV-GEN-001-P/N'].parts, 465);
  assert.equal(result.vectors['TV-GEN-001-P/N'].templates, 672);
});
