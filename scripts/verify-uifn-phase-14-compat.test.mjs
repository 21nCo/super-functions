import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  attachPhase14GitHubAttestation,
  phase14ArtifactSetHash,
  requiredPhase14CompatibilityCells,
  verifyPhase14RawResultSubject,
  verifyPhase14Compatibility,
} from './verify-uifn-phase-14-compat.mjs';

const commit = 'a'.repeat(40);
const snapshot = 'b'.repeat(64);
const consumerKitSha256 = 'f'.repeat(64);
const artifacts = [
  '@uifn/core', '@uifn/dom', '@uifn/adapter-kit', '@uifn/react', '@uifn/svelte', '@uifn/solid',
].map((packageName, index) => ({ package: packageName, filename: `${packageName.slice(6)}.tgz`, sha256: String(index + 1).repeat(64) }));
const trustPolicy = {
  schemaVersion: 1,
  github: {
    repository: '21nCo/super-functions',
    signerWorkflows: ['21nCo/super-functions/.github/workflows/uifn-phase-14-compat.yml'],
  },
};
const now = new Date('2026-07-18T12:00:00.000Z');
const verified = () => ({ ok: true, message: 'test attestation verified' });

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}

function canonicalSha256(value) {
  return createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}

function environment(required) {
  const base = { os: { name: 'Test OS', version: '1.0', architecture: 'arm64' } };
  if (required.kind === 'node') return { ...base, node: { version: `${required.major}.1.0` } };
  if (required.kind === 'framework') {
    const versions = { react: required.major === 18 ? '18.3.1' : '19.2.3', svelte: '5.46.1', solid: '1.9.13' };
    return { ...base, framework: { name: required.framework, version: versions[required.framework], mode: required.mode } };
  }
  if (required.kind === 'rendering') {
    return {
      ...base,
      browser: { name: 'chrome', product: 'Google Chrome', engine: 'blink', channel: 'latest', version: '150.0.1', execution: 'native' },
      frameworks: ['react', 'svelte', 'solid'],
      rendering: { profile: required.profile, evidence: ['react', 'svelte', 'solid'].map(() => ({ profile: required.profile, passed: true })) },
    };
  }
  const values = {
    chrome: ['chrome', 'Google Chrome', 'blink', required.channel === 'latest' ? '150.0.1' : '149.0.1'],
    firefox: ['firefox', 'Mozilla Firefox', 'gecko', required.channel === 'latest' ? '150.0.1' : '149.0.1'],
    edge: ['edge', 'Microsoft Edge', 'blink', required.channel === 'latest' ? '150.0.1' : '149.0.1'],
    safari: ['safari', 'Safari', 'webkit', required.channel === 'current' ? '26.4.0' : '26.3.0'],
    'ios-safari': ['ios-safari', 'Mobile Safari', 'webkit', required.channel === 'current' ? '26.4.0' : '26.3.0'],
    'android-chrome': ['android-chrome', 'Google Chrome', 'blink', '150.0.1'],
  };
  const [name, product, engine, version] = values[required.browser];
  return {
    ...base,
    browser: { name, product, engine, channel: required.channel, version, execution: required.kind === 'device' ? 'device-lab' : 'native' },
    frameworks: ['react', 'svelte', 'solid'],
    ...(required.kind === 'device' ? { device: { name: 'Physical test device', model: 'Test model', osVersion: '26.4', physical: true } } : {}),
  };
}

function observation(required) {
  const base = { passed: true, failures: 0, resultSha256: 'c'.repeat(64) };
  if (required.kind === 'node') return { ...base, packageCount: 3 };
  if (required.kind === 'framework') return { ...base, publicTreeCount: 69, frameworkCount: 1 };
  return { ...base, publicTreeCount: 207, frameworkCount: 3 };
}

function documentFor(required, runId) {
  const artifactSetSha256 = phase14ArtifactSetHash(artifacts);
  const provenanceUri = `https://github.com/21nCo/super-functions/actions/runs/${runId}/attempts/1`;
  const rawResult = {
    id: required.id,
    cellId: required.id,
    status: 'passed',
    executedAt: '2026-07-18T10:00:00.000Z',
    environment: environment(required),
    command: `ci run ${required.id}`,
    observed: observation(required),
    ...(required.kind === 'device' ? {
      lab: {
        provider: 'browserstack',
        sessionId: `session-${required.id}`,
        sessionUrl: `https://automate.browserstack.com/sessions/${required.id}`,
        capabilitiesSha256: 'd'.repeat(64),
        resultSha256: 'e'.repeat(64),
      },
    } : {}),
  };
  delete rawResult.id;
  const cell = {
    id: required.id,
    kind: required.kind,
    status: rawResult.status,
    executedAt: rawResult.executedAt,
    expiresAt: '2026-08-01T10:00:00.000Z',
    sourceCommit: commit,
    sourceDirty: false,
    sourceSnapshotSha256: snapshot,
    artifactSetSha256,
    consumerKitSha256,
    environment: rawResult.environment,
    command: rawResult.command,
    observed: rawResult.observed,
    rawResultSubject: { filename: `${required.id}.result.json`, sha256: canonicalSha256(rawResult) },
    job: { provider: required.kind === 'device' ? 'browserstack' : 'github-actions', id: required.id, url: `${provenanceUri}/job/${required.id}`, immutable: true },
    ...(rawResult.lab ? { lab: rawResult.lab } : {}),
  };
  return attachPhase14GitHubAttestation({
    schemaVersion: 3,
    phase: 'PHASE_14',
    generatedAt: '2026-07-18T11:00:00.000Z',
    sourceCommit: commit,
    sourceDirty: false,
    sourceSnapshotSha256: snapshot,
    artifactSet: artifacts,
    artifactSetSha256,
    consumerKitSha256,
    cells: [cell],
  }, { provenanceUri, bundle: `${required.id}.sigstore.json` });
}

function rawResultFor(document) {
  const cell = document.cells[0];
  return {
    cellId: cell.id,
    status: cell.status,
    executedAt: cell.executedAt,
    command: cell.command,
    environment: cell.environment,
    observed: cell.observed,
    ...(cell.lab ? { lab: cell.lab } : {}),
  };
}

function completeDocuments() {
  return requiredPhase14CompatibilityCells().map((required, index) => documentFor(required, index + 100));
}

function verify(documents, attestationVerifier = verified) {
  return verifyPhase14Compatibility({ documents, artifactSet: artifacts, consumerKitSha256, expectedCommit: commit, now, trustPolicy, attestationVerifier });
}

test('TV-COMPAT-001-P accepts only a complete per-cell Sigstore-attested exact-artifact matrix', () => {
  const result = verify(completeDocuments());
  assert.equal(result.ok, true);
  assert.equal(result.trustScheme, 'github-sigstore-v1');
  assert.equal(result.requiredCellCount, 35);
  assert.equal(result.passedCellCount, 35);
});

test('TV-COMPAT-001-N fails previous iOS Safari and untested React 18.3 peer range', () => {
  const documents = completeDocuments().filter((document) => document.cells[0].id !== 'ios-safari-previous' && !document.cells[0].id.startsWith('react-18.3-'));
  const result = verify(documents);
  assert.equal(result.ok, false);
  assert(result.issues.some((issue) => issue.code === 'UIFN_COMPAT_MATRIX_MISSING' && issue.cell === 'ios-safari-previous'));
  assert(result.issues.some((issue) => issue.code === 'UIFN_PEER_RANGE_UNVERIFIED' && issue.path === '/peerDependencies/react'));
});

test('TV-COMPAT-001-N rejects Playwright WebKit as Safari and emulated mobile devices', () => {
  const documents = completeDocuments();
  const safari = documents.find((document) => document.cells[0].id === 'safari-current').cells[0];
  safari.environment.browser.execution = 'playwright';
  const ios = documents.find((document) => document.cells[0].id === 'ios-safari-current').cells[0];
  ios.environment.device.physical = false;
  const result = verify(documents);
  assert(result.issues.some((issue) => issue.code === 'UIFN_COMPAT_EMULATION_REJECTED' && issue.cell === 'safari-current'));
  assert(result.issues.some((issue) => issue.code === 'UIFN_COMPAT_PHYSICAL_DEVICE_REQUIRED' && issue.cell === 'ios-safari-current'));
});

test('TV-COMPAT-001-N rejects a content-valid document without a verified cryptographic attestation', () => {
  const result = verify(completeDocuments(), () => ({ ok: false, message: 'signature mismatch' }));
  assert.equal(result.passedCellCount, 0);
  assert(result.issues.some((issue) => issue.code === 'UIFN_COMPAT_ATTESTATION_INVALID'));
});

test('TV-COMPAT-001-N rejects cross-repository and untrusted-workflow provenance', () => {
  const documents = completeDocuments();
  documents[0].signature.repository = 'attacker/repository';
  documents[1].signature.signerWorkflow = '21nCo/super-functions/.github/workflows/other.yml';
  const result = verify(documents);
  assert(result.issues.filter((issue) => issue.code === 'UIFN_COMPAT_ATTESTATION_UNTRUSTED').length >= 2);
});

test('TV-COMPAT-001-N rejects batch-scoped attestations and incomplete raw observations', () => {
  const documents = completeDocuments();
  documents[0].cells.push(structuredClone(documents[1].cells[0]));
  documents.find((document) => document.cells[0].id === 'react-18.3-client').cells[0].observed.publicTreeCount = 1;
  const result = verify(documents);
  assert(result.issues.some((issue) => issue.code === 'UIFN_COMPAT_ATTESTATION_SCOPE_INVALID'));
  assert(result.issues.some((issue) => issue.code === 'UIFN_COMPAT_OBSERVATION_INCOMPLETE'));
});

test('TV-COMPAT-001-N rejects a cell produced by a different browser consumer kit', () => {
  const documents = completeDocuments();
  documents.find((document) => document.cells[0].id === 'chrome-latest').cells[0].consumerKitSha256 = '0'.repeat(64);
  const result = verify(documents);
  assert(result.issues.some((issue) => issue.code === 'UIFN_COMPAT_CONSUMER_KIT_MISMATCH' && issue.cell === 'chrome-latest'));
});

test('TV-COMPAT-001-N rejects missing raw-result subject metadata', () => {
  const documents = completeDocuments();
  delete documents[0].cells[0].rawResultSubject;
  const result = verify(documents);
  assert(result.issues.some((issue) => issue.code === 'UIFN_COMPAT_RAW_RESULT_SUBJECT_INVALID' && issue.cell === 'node-20'));
});

test('binds the downloaded raw result and detects tampering before Sigstore verification', (context) => {
  const directory = mkdtempSync(path.join(tmpdir(), 'uifn-phase14-raw-subject-'));
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  const document = documentFor(requiredPhase14CompatibilityCells()[0], 901);
  const evidencePath = path.join(directory, 'node-20.compat.json');
  const rawResultPath = path.join(directory, 'node-20.result.json');
  writeFileSync(evidencePath, `${JSON.stringify(document, null, 2)}\n`);
  writeFileSync(rawResultPath, `${JSON.stringify(rawResultFor(document), null, 2)}\n`);
  assert.equal(verifyPhase14RawResultSubject(document, evidencePath).ok, true);
  writeFileSync(rawResultPath, `${JSON.stringify({ ...rawResultFor(document), command: 'tampered' }, null, 2)}\n`);
  assert.match(verifyPhase14RawResultSubject(document, evidencePath).message, /hash does not match/);
});
