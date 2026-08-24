#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validateEvidence } from './verify-uifn-governance.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const node = process.env.UIFN_NODE_PATH ?? process.execPath;
const npm = process.env.UIFN_NPM_PATH ?? (process.platform === 'win32' ? 'npm.cmd' : 'npm');
const evidenceRoot = process.env.UIFN_PHASE18_EVIDENCE_DIR ? path.resolve(process.env.UIFN_PHASE18_EVIDENCE_DIR) : null;
const useExistingBrowser = process.argv.includes('--use-existing-browser');
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const relative = (absolute) => path.relative(root, absolute).replaceAll(path.sep, '/');
const readJson = (absolute) => JSON.parse(readFileSync(absolute, 'utf8'));
const fileHash = (absolute) => sha256(readFileSync(absolute));

function sanitizeDiagnostic(value) {
  return String(value)
    .replaceAll(root, '[repo-root]')
    .replace(/\/private\/var\/folders\/[^/\s]+\/[^/\s]+\/T\/[^/\s]+/g, '[temporary-workspace]')
    .replace(/\/(?:Users|home|Volumes)\/[^/\s]+\/[^\s"']+/g, '[local-path]');
}

function latestEvidenceRoot(phase, required) {
  const parent = path.join(root, `uifn/.conduct/evidence/${phase}`);
  if (!existsSync(parent)) return null;
  return readdirSync(parent)
    .map((name) => path.join(parent, name))
    .filter((candidate) => required.every((name) => existsSync(path.join(candidate, name))))
    .map((candidate) => ({
      candidate,
      modifiedAt: Math.max(...required.map((name) => statSync(path.join(candidate, name)).mtimeMs)),
    }))
    .sort((left, right) => right.modifiedAt - left.modifiedAt)[0]?.candidate ?? null;
}

function run(command, args, env = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    env: { ...process.env, ...env },
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
  return {
    command: [path.basename(command), ...args].join(' '),
    passed: result.status === 0,
    status: result.status,
    stdoutTail: sanitizeDiagnostic((result.stdout ?? '').split('\n').slice(-40).join('\n')),
    stderrTail: sanitizeDiagnostic((result.stderr ?? '').split('\n').slice(-40).join('\n')),
  };
}

function requirePassedEvidence(absolute, code, failures) {
  if (!absolute || !existsSync(absolute)) {
    failures.push({ code, reason: 'missing', path: absolute ? relative(absolute) : null });
    return null;
  }
  const value = readJson(absolute);
  if (value.status !== 'passed') failures.push({ code, reason: 'not-passed', status: value.status });
  const source = readFileSync(absolute, 'utf8');
  if (/\/(?:Users|home|private\/var|Volumes)\//.test(source) || /(?:Bearer|password|secret|token)=/i.test(source)) {
    failures.push({ code: 'UIFN_A11Y_EVIDENCE_UNSANITIZED', artifact: relative(absolute) });
  }
  return value;
}

const startedAt = new Date();
const failures = [];
const checks = [];
if (!evidenceRoot) failures.push({ code: 'UIFN_A11Y_EVIDENCE_PATH_MISSING', environment: 'UIFN_PHASE18_EVIDENCE_DIR' });
if (evidenceRoot) mkdirSync(evidenceRoot, { recursive: true });

const phase17Root = process.env.UIFN_PHASE18_PHASE17_EVIDENCE_DIR
  ? path.resolve(process.env.UIFN_PHASE18_PHASE17_EVIDENCE_DIR)
  : latestEvidenceRoot('phase-17', ['storybook.json', 'docs.json']);
const storyPath = phase17Root ? path.join(phase17Root, 'storybook.json') : null;
const docsPath = phase17Root ? path.join(phase17Root, 'docs.json') : null;
const browserPath = evidenceRoot ? path.join(evidenceRoot, 'browser.json') : null;
const ledgerPath = evidenceRoot ? path.join(evidenceRoot, 'ledger.json') : null;

const ledgerSourcePath = path.join(root, 'uifn/evidence/generated/phase-18/normative-ledger.json');
const automationPath = path.join(root, 'uifn/evidence/generated/phase-18/automation-manifest.json');
const handoffPath = path.join(root, 'uifn/evidence/generated/phase-18/manual-handoff.json');
const ledgerSource = readJson(ledgerSourcePath);
const handoffSource = readJson(handoffPath);
const storyInventory = readJson(path.join(root, 'uifn/storybook/generated/story-inventory.json'));
const docsCoverage = readJson(path.join(root, 'uifn/docs/generated/docs-coverage.json'));
const docsSamples = readJson(path.join(root, 'uifn/docs/generated/sample-manifest.json'));
const expectedRuleCount = ledgerSource.primitiveCount * ledgerSource.ruleIds.length;
const expectedTraceCount = ledgerSource.primitiveCount * 3 * 2;
const traceRoot = evidenceRoot ? path.join(evidenceRoot, 'phase-14-traces') : null;

const commands = [
  [node, ['scripts/generate-uifn-catalog.mjs', '--check']],
  [node, ['scripts/generate-uifn-phase-11.mjs', '--check']],
  [node, ['scripts/generate-uifn-phase-12.mjs', '--check']],
  [node, ['scripts/generate-uifn-phase-13.mjs', '--check']],
  [node, ['scripts/generate-uifn-phase-17.mjs', '--check']],
  [node, ['scripts/generate-uifn-phase-17.mjs', '--check']],
  [node, ['scripts/generate-uifn-phase-18.mjs']],
  [node, ['scripts/generate-uifn-phase-18.mjs']],
  [node, ['--test', 'scripts/verify-uifn-phase-18-contract.test.mjs']],
  [npm, ['--workspace', '@uifn/core', 'run', 'typecheck']],
  [npm, ['--workspace', '@uifn/core', 'run', 'test']],
  [npm, ['--workspace', '@uifn/components', 'run', 'typecheck']],
  [npm, ['--workspace', '@uifn/components', 'run', 'test']],
  [npm, ['--workspace', '@uifn/storybook', 'run', 'typecheck']],
  [npm, ['--workspace', '@uifn/storybook', 'run', 'test']],
  [npm, ['--workspace', '@uifn/storybook', 'run', 'build:workbenches']],
];
if (traceRoot) {
  commands.push(
    [node, ['scripts/run-uifn-phase-14-traces.mjs', '--output-dir', relative(traceRoot)]],
    [node, ['scripts/verify-uifn-phase-14-parity.mjs', '--trace-dir', relative(traceRoot)]],
  );
}
if (ledgerPath) commands.push([node, ['scripts/verify-uifn-phase-18-ledger.mjs'], { UIFN_PHASE18_LEDGER_EVIDENCE: ledgerPath }]);
if (!useExistingBrowser && browserPath && storyPath && docsPath) {
  commands.push([node, ['scripts/verify-uifn-phase-18-browser.mjs'], {
    UIFN_PHASE18_BROWSER_EVIDENCE: browserPath,
    UIFN_PHASE18_PHASE17_STORY_EVIDENCE: storyPath,
    UIFN_PHASE18_PHASE17_DOCS_EVIDENCE: docsPath,
  }]);
}

for (const [command, args, env = {}] of commands) {
  const check = run(command, args, env);
  checks.push(check);
  if (!check.passed) {
    failures.push({
      code: 'UIFN_PHASE18_COMMAND_FAILED',
      command: check.command,
      status: check.status,
      stdoutTail: check.stdoutTail,
      stderrTail: check.stderrTail,
    });
  }
}

const story = requirePassedEvidence(storyPath, 'UIFN_A11Y_STORY_EVIDENCE_INVALID', failures);
const docs = requirePassedEvidence(docsPath, 'UIFN_A11Y_DOCS_EVIDENCE_INVALID', failures);
const browser = requirePassedEvidence(browserPath, 'UIFN_A11Y_BROWSER_EVIDENCE_INVALID', failures);
const ledger = requirePassedEvidence(ledgerPath, 'UIFN_A11Y_LEDGER_EVIDENCE_INVALID', failures);

if (
  story
  && (
    story.counts?.storiesExpected !== storyInventory.storyCount
    || story.counts?.storiesPassed !== storyInventory.storyCount
  )
) {
  failures.push({ code: 'UIFN_A11Y_STORY_EVIDENCE_INVALID', counts: story.counts });
}
if (
  docs
  && (
    docs.counts?.primitives !== docsCoverage.primitiveCount
    || docs.counts?.consumers !== 6
    || docs.counts?.samples !== docsSamples.sampleCount
  )
) {
  failures.push({ code: 'UIFN_A11Y_DOCS_EVIDENCE_INVALID', counts: docs.counts });
}
if (ledger) {
  if (ledger.definitionSha256 !== ledgerSource.definitionSha256
    || ledger.counts?.rules !== expectedRuleCount
    || ledger.counts?.canonicalTraces !== expectedTraceCount
    || ledger.counts?.manualScripts !== handoffSource.scriptCount
    || ledger.counts?.mutations !== 12
    || ledger.coverage?.everyRuleMapped !== true
    || ledger.coverage?.everyModeMapped !== true
    || ledger.coverage?.unjustifiedNotApplicable !== 0
    || ledger.failures?.length) {
    failures.push({ code: 'UIFN_A11Y_LEDGER_EVIDENCE_INVALID', counts: ledger.counts, coverage: ledger.coverage });
  }
}
if (browser) {
  const reviewCount = browser.incompleteReviews?.reduce((count, review) => count + review.occurrences, 0) ?? 0;
  const unreviewed = browser.incompleteReviews?.filter((review) => review.disposition === 'unreviewed') ?? [];
  const expectedIndexes = story?.indexes ?? {};
  const staticIdentityMatches = ['react', 'svelte', 'solid'].every((framework) => (
    browser.staticBuild?.[framework]?.index?.sha256 === expectedIndexes[framework]?.sha256
    && browser.staticBuild?.[framework]?.index?.expectedSha256 === expectedIndexes[framework]?.sha256
  ));
  const upstreamIdentityMatches = browser.upstreamEvidence?.story?.sha256 === fileHash(storyPath)
    && browser.upstreamEvidence?.docs?.sha256 === fileHash(docsPath);
  if (browser.source?.definitionSha256 !== ledgerSource.definitionSha256
    || browser.counts?.browserAssertions !== expectedRuleCount
    || browser.counts?.passed !== expectedRuleCount
    || browser.counts?.failed !== 0
    || browser.counts?.axeSeriousCritical !== 0
    || browser.counts?.axeIncomplete !== reviewCount
    || browser.counts?.axeIncompleteReviewed !== reviewCount
    || unreviewed.length
    || browser.failures?.length
    || !staticIdentityMatches
    || !upstreamIdentityMatches
    || browser.mutationArtifact?.status !== 'mutation-detected'
    || browser.mutationArtifact?.validation?.length) {
    failures.push({
      code: 'UIFN_A11Y_BROWSER_EVIDENCE_INVALID',
      counts: browser.counts,
      reviewCount,
      unreviewed: unreviewed.map((review) => review.id),
      staticIdentityMatches,
      upstreamIdentityMatches,
      mutationArtifact: browser.mutationArtifact,
    });
  }
  const requiredReviews = new Map((browser.incompleteReviews ?? []).map((review) => [review.id, review]));
  if (requiredReviews.get('aria-valid-attr-value')?.disposition !== 'reviewed-by-explicit-idref-audit'
    || requiredReviews.get('bypass')?.disposition !== 'reviewed-outside-component-scope'
    || requiredReviews.get('color-contrast')?.disposition !== 'reviewed-phase-19-visual-check-required'
    || requiredReviews.get('color-contrast')?.releaseBlocking !== true) {
    failures.push({ code: 'UIFN_A11Y_AXE_INCOMPLETE_UNREVIEWED', reviews: [...requiredReviews.keys()] });
  }
}

const completedAt = new Date();
let evidence = null;
if (evidenceRoot && browser && ledger && story && docs) {
  const artifacts = [
    browserPath,
    ledgerPath,
    storyPath,
    docsPath,
    ledgerSourcePath,
    automationPath,
    handoffPath,
    ...ledgerSource.traceHashes.map((entry) => path.join(root, entry.path)),
  ];
  const gitCommit = run('git', ['rev-parse', 'HEAD']).stdoutTail.trim().split('\n').at(-1);
  const gitDirty = spawnSync('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: root, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 }).stdout.trim().length > 0;
  const browserVersions = [...new Set((browser.matrix ?? []).map((cell) => `${cell.engine} ${cell.browserVersion}`))].sort().join(', ');
  const packageLockPath = path.join(root, 'package-lock.json');
  const total = (browser.counts?.browserAssertions ?? 0) + (ledger.counts?.rules ?? 0) + (ledger.counts?.mutations ?? 0);
  evidence = {
    schemaVersion: 1,
    evidenceId: `phase18-a11y-${completedAt.toISOString().replace(/[-:.]/g, '')}`,
    evidenceClass: 'browser-compatibility',
    requirementIds: ['A11Y-001', 'A11Y-002'],
    vectorIds: ['TV-A11Y-001-P', 'TV-A11Y-001-N', 'TV-A11Y-002-P', 'TV-A11Y-002-N'],
    status: failures.length ? 'failed' : 'passed',
    source: {
      commit: gitCommit,
      dirty: gitDirty,
      dirtyReason: gitDirty
        ? 'Phase 18 automated evidence is provisional because no clean commit was authorized. Phase 19, Phase 20, release, and any 10/10 claim require a clean committed source identity plus signed external compatibility and assistive-technology evidence.'
        : null,
      lockfileSha256: fileHash(packageLockPath),
      definitionSha256: ledgerSource.definitionSha256,
      artifactHashes: artifacts.map((absolute) => ({ path: relative(absolute), sha256: fileHash(absolute) })),
    },
    environment: {
      os: process.platform,
      arch: process.arch,
      runtime: process.version,
      tools: {
        phase18Verifier: '18.0.0',
        playwright: JSON.parse(readFileSync(path.join(root, 'node_modules/playwright/package.json'), 'utf8')).version,
        axeCore: JSON.parse(readFileSync(path.join(root, 'node_modules/axe-core/package.json'), 'utf8')).version,
      },
      framework: 'React, Svelte, Solid',
      browser: browserVersions,
      assistiveTechnology: null,
    },
    timing: {
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      durationMs: completedAt.getTime() - startedAt.getTime(),
    },
    counts: {
      total,
      executed: total,
      passed: failures.length ? 0 : total,
      failed: failures.length ? total : 0,
      blocked: 0,
      skipped: 0,
      notApplicable: 0,
    },
    artifacts: artifacts.map(relative),
    defects: [],
    signatures: [{
      kind: 'automation',
      signer: 'scripts/verify-uifn-phase-18.mjs',
      signedAt: completedAt.toISOString(),
      attestation: 'Normative rule mappings, package/source/framework semantic parity, clean-package stories, clean package/source consumers, browser accessibility assertions, reviewed axe incompletes, failure artifacts, and negative mutations were verified. This automation signature is provisional and is not an assistive-technology or independent-review signature.',
    }],
    expiresAt: new Date(completedAt.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    supersedes: null,
  };
  const schemaFailures = validateEvidence(evidence).filter((failure) => failure.code !== 'UIFN_EVIDENCE_DIRTY');
  if (schemaFailures.length) {
    failures.push(...schemaFailures);
    evidence.status = 'failed';
    evidence.counts.passed = 0;
    evidence.counts.failed = evidence.counts.total;
  }
  writeFileSync(path.join(evidenceRoot, 'phase-18.json'), `${JSON.stringify(evidence, null, 2)}\n`);
  writeFileSync(path.join(evidenceRoot, 'run.json'), `${JSON.stringify({
    schemaVersion: 1,
    phase: 'PHASE_18',
    status: failures.length ? 'failed' : 'passed',
    gateSplit: {
      phase18AutomatedGate: failures.length ? 'failed' : 'passed-provisional',
      signedExternalCompatibilityRequiredBefore: ['PHASE_19', 'PHASE_20', 'release', '10-of-10-claim'],
      phase19AssistiveTechnologyAndIndependentReviewRequired: true,
    },
    checks,
    failures,
  }, null, 2)}\n`);
}

const summary = {
  ok: failures.length === 0,
  phase: 'PHASE_18',
  status: failures.length ? 'failed' : 'passed',
  requirements: {
    'A11Y-001': failures.length ? 'failed' : 'passed-provisional',
    'A11Y-002': failures.length ? 'failed' : 'passed-provisional',
  },
  checkCount: checks.length,
  counts: evidence?.counts ?? null,
  failureCount: failures.length,
  failures: failures.slice(0, 30),
  evidence: evidenceRoot ? relative(path.join(evidenceRoot, 'phase-18.json')) : null,
};
(failures.length ? console.error : console.log)(JSON.stringify(summary, null, 2));
if (failures.length) process.exitCode = 1;
