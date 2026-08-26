#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const node = process.env.UIFN_NODE_PATH ?? process.execPath;
const npm = process.env.UIFN_NPM_PATH ?? (process.platform === 'win32' ? 'npm.cmd' : 'npm');
const evidenceRoot = process.env.UIFN_PHASE17_EVIDENCE_DIR ? path.resolve(process.env.UIFN_PHASE17_EVIDENCE_DIR) : null;
const staticOnly = process.argv.includes('--static-only');

function run(command, args, env = {}) {
  const result = spawnSync(command, args, { cwd: root, env: { ...process.env, ...env }, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  return { command: [command, ...args].join(' '), passed: result.status === 0, status: result.status, stdoutTail: (result.stdout ?? '').split('\n').slice(-40).join('\n'), stderrTail: (result.stderr ?? '').split('\n').slice(-40).join('\n') };
}

const storyEvidence = evidenceRoot ? path.join(evidenceRoot, 'storybook.json') : undefined;
const docsEvidence = evidenceRoot ? path.join(evidenceRoot, 'docs.json') : undefined;
if (evidenceRoot) mkdirSync(evidenceRoot, { recursive: true });
const commands = [
  [node, ['scripts/generate-uifn-phase-17.mjs', '--check']],
  [node, ['scripts/generate-uifn-phase-17.mjs', '--check']],
  [npm, ['--workspace', '@uifn/storybook', 'run', 'typecheck']],
  [npm, ['--workspace', '@uifn/storybook', 'run', 'test']],
  [npm, ['--workspace', '@uifn/storybook', 'run', 'build']],
  [node, ['--test', 'scripts/verify-uifn-phase-17-contract.test.mjs']],
  [npm, ['--workspace', '@uifn/storybook', 'pack', '--dry-run']],
  [node, ['scripts/verify-uifn-phase-16.mjs', '--static-only']],
];
if (staticOnly) {
  commands.push([node, ['scripts/verify-uifn-phase-17-docs.mjs', '--static-only']]);
} else {
  commands.push(
    [node, ['scripts/verify-uifn-phase-17-storybook.mjs'], storyEvidence ? { UIFN_PHASE17_STORY_EVIDENCE: storyEvidence } : {}],
    [node, ['scripts/verify-uifn-phase-17-docs.mjs'], docsEvidence ? { UIFN_PHASE17_DOCS_EVIDENCE: docsEvidence } : {}],
  );
}

const checks = [];
const failures = [];
for (const [command, args, env = {}] of commands) {
  const check = run(command, args, env);
  checks.push(check);
  if (!check.passed) failures.push({ code: 'UIFN_PHASE17_COMMAND_FAILED', command: check.command, status: check.status, stdoutTail: check.stdoutTail, stderrTail: check.stderrTail });
}
let story = null;
let docs = null;
if (storyEvidence && existsSync(storyEvidence)) story = JSON.parse(readFileSync(storyEvidence, 'utf8'));
if (docsEvidence && existsSync(docsEvidence)) docs = JSON.parse(readFileSync(docsEvidence, 'utf8'));
const storyCheck = staticOnly ? null : checks.at(-2);
const docsCheck = checks.at(-1);
const storyPassed = staticOnly
  ? false
  : story
    ? story.status === 'passed'
    : storyCheck?.passed === true;
const docsPassed = docs
  ? docs.status === 'passed'
  : docsCheck?.passed === true;
const result = {
  schemaVersion: 1,
  phase: 'PHASE_17',
  status: failures.length ? 'failed' : 'passed',
  requirements: {
    'STORY-001': staticOnly ? 'not-run-static-only' : storyPassed ? 'passed' : 'failed',
    'DOCS-001': staticOnly ? (docsPassed ? 'static-passed' : 'failed') : docsPassed ? 'passed' : 'failed',
  },
  checks,
  evidence: { story: storyEvidence ?? null, docs: docsEvidence ?? null },
  failures,
  gateSplit: {
    semanticParityAllowsPhase18: true,
    signedExternalCompatibilityRequiredBeforePhase19Phase20Release: true,
  },
  provisionalUntilSignedPhase14Compatibility: true,
};
if (evidenceRoot) writeFileSync(path.join(evidenceRoot, 'phase-17.json'), `${JSON.stringify(result, null, 2)}\n`);
const summary = { ok: !failures.length, phase: result.phase, status: result.status, requirements: result.requirements, checkCount: checks.length, failureCount: failures.length, failures: failures.slice(0, 20), evidence: evidenceRoot ? path.join(evidenceRoot, 'phase-17.json') : null };
(failures.length ? console.error : console.log)(JSON.stringify(summary, null, 2));
if (failures.length) process.exitCode = 1;
