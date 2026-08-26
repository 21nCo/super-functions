#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  phase18MutationResults,
  phase18SemanticMutationResults,
  expandPhase14ConsensusTraces,
  PHASE_18_RULES,
  sha256,
  stableJson,
  inspectTraceParity,
  validateFailureArtifact,
  validateLedger,
} from './uifn-phase-18-contract.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const evidencePath = process.env.UIFN_PHASE18_LEDGER_EVIDENCE ? path.resolve(process.env.UIFN_PHASE18_LEDGER_EVIDENCE) : null;
const readJson = (relative) => JSON.parse(readFileSync(path.join(root, relative), 'utf8'));
const catalog = readJson('uifn/catalog/generated/catalog.json');
const ledger = readJson('uifn/evidence/generated/phase-18/normative-ledger.json');
const automation = readJson('uifn/evidence/generated/phase-18/automation-manifest.json');
const handoff = readJson('uifn/evidence/generated/phase-18/manual-handoff.json');
const traces = expandPhase14ConsensusTraces(
  readJson('uifn/evidence/generated/phase-14/phase-14-semantic-traces.json'),
);

const startedAt = new Date();
const failures = [
  ...validateLedger(ledger, catalog, { now: new Date('2026-07-24T23:59:59Z') }),
  ...inspectTraceParity(traces),
];
const expectedPrimitiveCount = catalog.primitives.length;
const expectedModeCount = ledger.primitives.reduce(
  (count, primitive) => count + primitive.modes.length,
  0,
);
const expectedManualScriptCount = expectedPrimitiveCount * handoff.assistiveTechnologies.length;
if (
  ledger.primitiveCount !== expectedPrimitiveCount
  || ledger.primitives.length !== expectedPrimitiveCount
) {
  failures.push({ code: 'UIFN_A11Y_RULE_MISSING', reason: 'primitive-count' });
}
if (ledger.modeCount !== expectedModeCount) {
  failures.push({ code: 'UIFN_A11Y_RULE_MISSING', reason: 'mode-count', actual: ledger.modeCount });
}
if (ledger.ruleIds.join(',') !== PHASE_18_RULES.join(',')) failures.push({ code: 'UIFN_A11Y_RULE_MISSING', reason: 'rule-id-order' });
if (automation.matrix.length < 11 || automation.requiredAssertions.length < 13) failures.push({ code: 'UIFN_A11Y_AUTOMATION_MATRIX_INCOMPLETE' });
if (
  handoff.scriptCount !== expectedManualScriptCount
  || handoff.scripts.length !== expectedManualScriptCount
) {
  failures.push({
    code: 'UIFN_A11Y_MANUAL_HANDOFF_INCOMPLETE',
    actual: handoff.scripts.length,
    expected: expectedManualScriptCount,
  });
}
if (handoff.assistiveTechnologies.map((entry) => entry.at).sort().join(',') !== ['NVDA', 'TalkBack', 'VoiceOver', 'VoiceOver'].sort().join(',')) failures.push({ code: 'UIFN_A11Y_MANUAL_HANDOFF_INCOMPLETE', reason: 'at-matrix' });
if (handoff.jaws.status !== 'deferred-by-user' || handoff.scripts.some((script) => /jaws/i.test(JSON.stringify(script)))) failures.push({ code: 'UIFN_A11Y_MANUAL_HANDOFF_INCOMPLETE', reason: 'jaws-scope' });
if (ledger.releaseGate.claim10of10Allowed !== false || ledger.releaseGate.automatedStatus !== 'provisional-pending-phase-19') failures.push({ code: 'UIFN_A11Y_PREMATURE_RELEASE_CLAIM' });

const mutations = phase18MutationResults(ledger, catalog);
const semanticMutations = phase18SemanticMutationResults(traces);
mutations.push(...semanticMutations);
for (const mutation of mutations) if (mutation.observed !== mutation.expected) failures.push({ code: 'UIFN_A11Y_MUTATION_SURVIVED', ...mutation });

const artifactFixture = {
  code: 'UIFN_A11Y_FOCUS_ESCAPE',
  primitive: 'dialog',
  framework: 'react',
  deliveryMode: 'package',
  browser: 'chromium',
  version: 'fixture',
  sourceHash: ledger.definitionSha256,
  dom: '<div role="dialog" aria-label="fixture"></div>',
  semanticTrace: [{ role: 'dialog' }],
  eventTrace: [{ action: 'Tab' }],
  focusPath: ['dialog', 'outside'],
  screenshot: 'screenshot.png',
  capturedAt: '2026-07-24T00:00:00.000Z',
  expiresAt: '2026-07-31T00:00:00.000Z',
};
failures.push(...validateFailureArtifact(artifactFixture));
const malformedArtifactCodes = validateFailureArtifact({ ...artifactFixture, dom: '/Users/example/private token=abc', screenshot: '/tmp/failure.png' }).map((failure) => failure.code);
if (!malformedArtifactCodes.includes('UIFN_A11Y_FAILURE_ARTIFACT_UNSANITIZED') || !malformedArtifactCodes.includes('UIFN_A11Y_FAILURE_ARTIFACT_INCOMPLETE')) failures.push({ code: 'UIFN_A11Y_FAILURE_ARTIFACT_MUTATION_SURVIVED' });

const completedAt = new Date();
const result = {
  schemaVersion: 1,
  phase: 'PHASE_18',
  requirementIds: ['A11Y-001', 'A11Y-002'],
  vectorIds: ['TV-A11Y-001-P', 'TV-A11Y-001-N', 'TV-A11Y-002-P', 'TV-A11Y-002-N'],
  status: failures.length ? 'failed' : 'passed',
  definitionSha256: ledger.definitionSha256,
  timing: { startedAt: startedAt.toISOString(), completedAt: completedAt.toISOString(), durationMs: completedAt.getTime() - startedAt.getTime() },
  counts: {
    primitives: ledger.primitiveCount,
    modes: ledger.modeCount,
    rules: ledger.primitiveCount * ledger.ruleIds.length,
    canonicalTraces: traces.length,
    manualScripts: handoff.scriptCount,
    matrixCells: automation.matrix.length,
    mutations: mutations.length + 2,
  },
  coverage: {
    rules: ledger.ruleIds,
    everyRuleMapped: ledger.primitives.every((primitive) => primitive.rules.every((rule) => rule.automatedVectorIds.length && rule.manualVectorIds.length && rule.evidenceIds.length)),
    everyModeMapped: ledger.primitives.every((primitive) => primitive.modes.every((mode) => mode.automation.packageStoryIds.length === 3 && mode.automation.sourceFixtureIds.length === 3)),
    unjustifiedNotApplicable: ledger.primitives.flatMap((primitive) => primitive.rules.filter((rule) => rule.applicability === 'not-applicable' && rule.rationale.length < 12)).length,
  },
  artifacts: {
    ledger: { path: 'uifn/evidence/generated/phase-18/normative-ledger.json', sha256: sha256(readFileSync(path.join(root, 'uifn/evidence/generated/phase-18/normative-ledger.json'))) },
    automation: { path: 'uifn/evidence/generated/phase-18/automation-manifest.json', sha256: sha256(readFileSync(path.join(root, 'uifn/evidence/generated/phase-18/automation-manifest.json'))) },
    handoff: { path: 'uifn/evidence/generated/phase-18/manual-handoff.json', sha256: sha256(readFileSync(path.join(root, 'uifn/evidence/generated/phase-18/manual-handoff.json'))) },
  },
  mutations,
  provisionalUntil: ['signed-external-phase-14-compatibility', 'signed-phase-19-assistive-technology', 'independent-phase-19-review'],
  failures,
};
if (evidencePath) {
  mkdirSync(path.dirname(evidencePath), { recursive: true });
  writeFileSync(evidencePath, stableJson(result));
}
const summary = { ok: !failures.length, status: result.status, counts: result.counts, mutations, failureCount: failures.length, failures: failures.slice(0, 30), evidence: evidencePath ? path.relative(root, evidencePath).replaceAll(path.sep, '/') : null };
(failures.length ? console.error : console.log)(stableJson(summary));
if (failures.length) process.exitCode = 1;
