import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { extractPhase14FrameworkCell } from './extract-uifn-phase-14-framework-cell.mjs';

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'uifn-phase14-framework-'));
  const traces = Array.from({ length: 69 }, (_, index) => ({ primitive: `P${index}`, framework: 'react', frameworkVersion: '18.3.1', installMode: 'package', result: 'passed' }));
  const traceFile = path.join(root, 'package-react.json');
  writeFileSync(traceFile, `${JSON.stringify(traces)}\n`);
  return {
    root,
    traceFile,
    traceRun: { generatedAt: '2026-07-18T10:00:00.000Z', counts: { primitives: 69 }, compatibility: { frameworkRuns: [{ cellId: 'react-18.3-client', framework: 'react', version: '18.3.1', mode: 'client', traceFile: 'package-react.json', traceSha256: createHash('sha256').update(`${JSON.stringify(traces)}\n`).digest('hex'), publicTreeCount: 69, command: 'vitest react.test.tsx' }] } },
  };
}

test('extracts only a byte-matched complete packed framework run', () => {
  const { root, traceRun } = fixture();
  const result = extractPhase14FrameworkCell({ cellId: 'react-18.3-client', bundleRoot: root, traceRun, os: { name: 'linux', version: '1', architecture: 'x64' } });
  assert.equal(result.observed.publicTreeCount, 69);
  assert.equal(result.environment.framework.version, '18.3.1');
});

test('rejects an unexecuted mode and changed trace bytes', () => {
  const { root, traceFile, traceRun } = fixture();
  assert.throws(() => extractPhase14FrameworkCell({ cellId: 'chrome-latest', bundleRoot: root, traceRun }), /cannot claim unexecuted/);
  writeFileSync(traceFile, '[]\n');
  assert.throws(() => extractPhase14FrameworkCell({ cellId: 'react-18.3-client', bundleRoot: root, traceRun }), /do not match/);
});
