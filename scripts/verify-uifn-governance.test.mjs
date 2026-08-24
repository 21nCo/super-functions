import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyOwnershipFixture,
  calculateDefectSla,
  evaluateDefect,
  materializeEvidenceFixture,
  readJson,
  runGovernanceVerification,
  validateBaseline,
  validateEvidence,
  validateOwnership,
  validateProgramDecisions,
} from './verify-uifn-governance.mjs';

const contracts = 'uifn/evidence/contracts';

test('PHASE_00 governance verification passes both OPS-001 vectors', () => {
  const result = runGovernanceVerification();
  assert.equal(result.ok, true, JSON.stringify(result.failures, null, 2));
  assert.equal(result.summary.failed, 0);
  assert.equal(result.checks.find((entry) => entry.id === 'TV-OPS-001-P')?.status, 'passed');
  assert.equal(result.checks.find((entry) => entry.id === 'TV-OPS-001-N')?.status, 'passed');
});

test('complete evidence passes the fail-closed evidence validator', () => {
  const evidence = readJson(`${contracts}/fixtures/evidence/complete.json`);
  assert.deepEqual(validateEvidence(evidence, { now: '2026-07-17T13:00:00Z' }), []);
});

test('evidence expiry cannot exceed its class policy window', () => {
  const evidence = structuredClone(readJson(`${contracts}/fixtures/evidence/complete.json`));
  evidence.expiresAt = '2099-01-01T00:00:00Z';
  assert.ok(validateEvidence(evidence, { now: '2026-07-17T13:00:00Z' }).some((entry) => (
    entry.code === 'UIFN_EVIDENCE_STALE' && entry.reason === 'evidence-class-expiry-policy'
  )));
});

test('every required negative evidence fixture is caught by its intended error code', () => {
  for (const fixtureName of ['missing.json', 'stale.json', 'blocked.json', 'malformed.json', 'unsigned.json', 'dirty.json', 'skipped.json', 'not-applicable.json']) {
    const fixture = materializeEvidenceFixture(fixtureName);
    const codes = validateEvidence(fixture.evidence, { now: '2026-07-17T13:00:00Z' }).map((entry) => entry.code);
    for (const expected of fixture.expectedErrorCodes) assert.ok(codes.includes(expected), `${fixtureName} did not produce ${expected}; got ${codes.join(', ')}`);
  }
});

test('removing the dismissable-layer owner fails ownership coverage', () => {
  const decisions = readJson(`${contracts}/program-decisions.json`);
  const ownership = readJson(`${contracts}/ownership.json`);
  const fixture = readJson(`${contracts}/fixtures/ownership/missing-dom-owner.json`);
  const mutated = applyOwnershipFixture(ownership, fixture);
  const failures = validateOwnership(mutated, decisions, { skipCodeowners: true });
  assert.ok(failures.some((entry) => entry.code === 'UIFN_OWNER_MISSING' && entry.surface === 'dismissable-layer'));
});

test('P1 intake produces deterministic blocking SLA and expired a11y P1 fails', () => {
  const policy = readJson(`${contracts}/defect-policy.json`);
  const intake = readJson(`${contracts}/fixtures/defects/p1-intake.json`);
  assert.deepEqual(calculateDefectSla(intake, policy), intake.expected);
  assert.ok(evaluateDefect(intake, policy, '2026-07-17T13:00:00Z').some((entry) => entry.code === 'UIFN_DEFECT_RELEASE_BLOCKING_OPEN'));
  const expired = readJson(`${contracts}/fixtures/defects/expired-untriaged-a11y-p1.json`);
  assert.ok(evaluateDefect(expired, policy, expired.evaluateAt).some((entry) => entry.code === 'UIFN_DEFECT_UNTRIAGED_OR_EXPIRED'));
});

test('an open P2 requires a bounded signed exception and accessibility approval', () => {
  const policy = readJson(`${contracts}/defect-policy.json`);
  const p2 = {
    id: 'FIXTURE-P2',
    severity: 'P2',
    status: 'triaged',
    owner: 'uifn-maintainer',
    createdAt: '2026-07-17T00:00:00Z',
    lastTriagedAt: '2026-07-17T01:00:00Z',
    accessibility: true,
    affectedRequirements: ['A11Y-002'],
    exception: null,
  };
  assert.ok(evaluateDefect(p2, policy, '2026-07-17T13:00:00Z').some((entry) => entry.code === 'UIFN_DEFECT_P2_EXCEPTION_INVALID_OR_MISSING'));
  p2.exception = {
    id: 'EX-P2',
    defectId: p2.id,
    reason: 'Bounded interoperability risk',
    mitigation: 'Feature remains disabled in the affected matrix cell',
    owner: 'uifn-maintainer',
    approvedBy: 'independent-reviewer-fixture',
    approvedAt: '2026-07-17T02:00:00Z',
    expiresAt: '2026-07-18T02:00:00Z',
    affectedRequirements: ['A11Y-002'],
    accessibilityReviewerApproval: true,
  };
  assert.deepEqual(evaluateDefect(p2, policy, '2026-07-17T13:00:00Z'), []);
});

test('decision integrity signature detects a changed locked decision', () => {
  const decisions = structuredClone(readJson(`${contracts}/program-decisions.json`));
  decisions.decisions[0].decision += ' changed';
  assert.ok(validateProgramDecisions(decisions).some((entry) => entry.code === 'UIFN_DECISION_SIGNATURE_MISMATCH'));
});

test('baseline remains an explicit dirty FAIL snapshot with complete finding coverage', () => {
  const baseline = readJson(`${contracts}/baseline.json`);
  assert.deepEqual(validateBaseline(baseline), []);
  assert.equal(baseline.readiness.verdict, 'FAIL');
  assert.equal(baseline.repository.dirty, true);
  assert.equal(baseline.auditFindings.length, 18);
});
