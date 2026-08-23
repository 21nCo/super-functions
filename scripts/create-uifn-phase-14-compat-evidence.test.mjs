import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { createPhase14CompatibilityEvidence } from './create-uifn-phase-14-compat-evidence.mjs';
import { phase14ArtifactSetHash } from './verify-uifn-phase-14-compat.mjs';

const packages = [
  '@uifn/core', '@uifn/dom', '@uifn/adapter-kit', '@uifn/react', '@uifn/svelte', '@uifn/solid',
].map((packageName, index) => ({ package: packageName, filename: `${index}.tgz`, sha256: String(index + 1).repeat(64) }));
const traceRun = {
  source: { commit: 'a'.repeat(40), dirty: false, snapshotSha256: 'b'.repeat(64) },
  packages,
  artifactSetSha256: phase14ArtifactSetHash(packages),
  consumerKit: {
    version: 2,
    files: [{ file: 'browser-main.ts', sha256: 'd'.repeat(64) }],
    sha256: createHash('sha256').update(JSON.stringify([{ file: 'browser-main.ts', sha256: 'd'.repeat(64) }])).digest('hex'),
  },
};
const result = {
  cellId: 'node-22',
  status: 'passed',
  executedAt: '2026-07-18T10:00:00.000Z',
  command: 'node node-smoke.mjs',
  environment: { os: { name: 'Ubuntu', version: '24.04', architecture: 'x64' }, node: { version: '22.17.0' } },
  observed: { passed: true, failures: 0, packageCount: 3, resultSha256: 'c'.repeat(64) },
};

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}

function canonicalSha256(value) {
  return createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}

test('creates one-cell clean-source evidence bound to an immutable GitHub run', () => {
  const evidence = createPhase14CompatibilityEvidence({
    cellId: 'node-22', traceRun, result, repository: '21nCo/super-functions', runId: '123', runAttempt: '2', jobId: 'node-22', generatedAt: '2026-07-18T10:01:00.000Z',
  });
  assert.equal(evidence.schemaVersion, 3);
  assert.equal(evidence.cells.length, 1);
  assert.equal(evidence.cells[0].artifactSetSha256, traceRun.artifactSetSha256);
  assert.equal(evidence.cells[0].consumerKitSha256, traceRun.consumerKit.sha256);
  assert.equal(evidence.cells[0].rawResultSubject.filename, 'node-22.result.json');
  assert.equal(evidence.cells[0].rawResultSubject.sha256, canonicalSha256(result));
  assert.equal(evidence.signature.scheme, 'github-sigstore-v1');
  assert.equal(evidence.signature.provenanceUri, 'https://github.com/21nCo/super-functions/actions/runs/123/attempts/2');
});

test('rejects dirty source and mismatched cell payloads', () => {
  assert.throws(() => createPhase14CompatibilityEvidence({
    cellId: 'node-22', traceRun: { ...traceRun, source: { ...traceRun.source, dirty: true } }, result, repository: '21nCo/super-functions', runId: '123', runAttempt: '1', jobId: 'node', generatedAt: '2026-07-18T10:01:00.000Z',
  }), /clean frozen source/);
  assert.throws(() => createPhase14CompatibilityEvidence({
    cellId: 'node-20', traceRun, result, repository: '21nCo/super-functions', runId: '123', runAttempt: '1', jobId: 'node', generatedAt: '2026-07-18T10:01:00.000Z',
  }), /does not match/);
});

test('rejects browser evidence when the embedded raw observation does not match its hash', () => {
  const raw = { cellId: 'chrome-latest', payloads: [{ framework: 'react' }] };
  const browserResult = {
    cellId: 'chrome-latest',
    status: 'passed',
    executedAt: '2026-07-18T10:00:00.000Z',
    command: 'run exact chrome',
    environment: { os: { name: 'Ubuntu', version: '24.04', architecture: 'x64' }, browser: {}, frameworks: ['react', 'svelte', 'solid'] },
    observed: { passed: true, failures: 0, publicTreeCount: 207, frameworkCount: 3, resultSha256: createHash('sha256').update(JSON.stringify(raw)).digest('hex') },
    raw,
  };
  assert.doesNotThrow(() => createPhase14CompatibilityEvidence({
    cellId: 'chrome-latest', traceRun, result: browserResult, repository: '21nCo/super-functions', runId: '123', runAttempt: '1', jobId: 'chrome', generatedAt: '2026-07-18T10:01:00.000Z',
  }));
  assert.throws(() => createPhase14CompatibilityEvidence({
    cellId: 'chrome-latest', traceRun, result: { ...browserResult, raw: { ...raw, tampered: true } }, repository: '21nCo/super-functions', runId: '123', runAttempt: '1', jobId: 'chrome', generatedAt: '2026-07-18T10:01:00.000Z',
  }), /canonical hash/);
});
