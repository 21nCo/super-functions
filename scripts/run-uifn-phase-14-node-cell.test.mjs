import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { phase14FrozenConsumerKitFiles, verifyPhase14FrozenBundle } from './run-uifn-phase-14-node-cell.mjs';
import { phase14ArtifactSetHash } from './verify-uifn-phase-14-compat.mjs';
import { createHash } from 'node:crypto';

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'uifn-phase-14-bundle-test-'));
  mkdirSync(path.join(root, 'tarballs'), { recursive: true });
  mkdirSync(path.join(root, 'consumer-kit'), { recursive: true });
  const consumerFiles = phase14FrozenConsumerKitFiles.map((file) => {
    const content = `consumer-${file}`;
    writeFileSync(path.join(root, 'consumer-kit', file), content);
    return { file, sha256: sha256(content) };
  }).sort((left, right) => left.file < right.file ? -1 : left.file > right.file ? 1 : 0);
  const packages = ['@uifn/core', '@uifn/dom', '@uifn/adapter-kit', '@uifn/react', '@uifn/svelte', '@uifn/solid'].map((packageName, index) => {
    const filename = `${index}.tgz`;
    const content = `tarball-${packageName}`;
    writeFileSync(path.join(root, 'tarballs', filename), content);
    return { package: packageName, filename, sha256: sha256(content) };
  });
  return {
    root,
    traceRun: {
      packages,
      artifactSetSha256: phase14ArtifactSetHash(packages),
      consumerKit: {
        version: 2,
        files: consumerFiles,
        sha256: sha256(JSON.stringify(consumerFiles)),
      },
    },
  };
}

test('validates every frozen tarball byte and the consumer kit', () => {
  const { root, traceRun } = fixture();
  assert.deepEqual(verifyPhase14FrozenBundle(root, traceRun), { ok: true, artifactSetSha256: traceRun.artifactSetSha256 });
});

test('rejects a tarball changed after the manifest was frozen', () => {
  const { root, traceRun } = fixture();
  writeFileSync(path.join(root, 'tarballs', traceRun.packages[0].filename), 'tampered');
  assert.throws(() => verifyPhase14FrozenBundle(root, traceRun), /hash mismatch/);
});

test('rejects a browser harness changed after the consumer kit was frozen', () => {
  const { root, traceRun } = fixture();
  writeFileSync(path.join(root, 'consumer-kit/browser-main.ts'), 'tampered');
  assert.throws(() => verifyPhase14FrozenBundle(root, traceRun), /consumer kit hash mismatch/);
});
