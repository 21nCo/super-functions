#!/usr/bin/env node

import crypto from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = process.cwd();
const contractsRoot = 'uifn/.conduct/contracts';
const sha256Pattern = /^[a-f0-9]{64}$/;
const commitPattern = /^[a-f0-9]{40}$/;
const requirementPattern = /^[A-Z0-9]+-[0-9]{3}$/;
const vectorPattern = /^TV-[A-Z0-9]+-[0-9]{3}-[PN]$/;

const expectedDomServices = [
  'root-scope-modality-tabbability',
  'dismissable-layer',
  'focus-scope',
  'modal-isolation-scroll-lock',
  'positioning-auto-update',
  'portal-presence-transitions',
  'form-bridges-live-regions',
];

const expectedPrimitiveFamilies = [
  'disclosure',
  'modal-overlay',
  'menu-navigation',
  'selection-collection',
  'forms-input',
  'range-gesture',
  'date-color',
  'status-feedback',
  'static-foundation',
];

const expectedAccessibilitySurfaces = [
  'normative-ledger',
  'automated-browser-a11y',
  'manual-voiceover-macos',
  'manual-voiceover-ios',
  'manual-nvda-windows',
  'manual-talkback-android',
  'independent-accessibility-review',
];

const expectedSecurityPerformanceSurfaces = [
  'threat-model-and-unsafe-dom',
  'dependency-vulnerability-license-sbom',
  'artifact-signing-and-provenance',
  'registry-adversarial-safety',
  'bundle-and-tree-shaking-budgets',
  'runtime-latency-and-long-tasks',
  'resource-and-heap-leaks',
];

function contractPath(relative) {
  return path.join(contractsRoot, relative);
}

export function readJson(relative) {
  return JSON.parse(readFileSync(path.join(repoRoot, relative), 'utf8'));
}

function issue(code, details = {}) {
  return { code, ...details };
}

function unique(values) {
  return [...new Set(values)];
}

function ids(entries = []) {
  return entries.map((entry) => entry.id);
}

function missing(expected, actual) {
  const actualSet = new Set(actual);
  return expected.filter((value) => !actualSet.has(value));
}

function duplicates(values) {
  const seen = new Set();
  const repeated = new Set();
  for (const value of values) {
    if (seen.has(value)) repeated.add(value);
    seen.add(value);
  }
  return [...repeated];
}

export function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function validateProgramDecisions(decisions) {
  const failures = [];
  if (decisions?.schemaVersion !== 1 || decisions?.contractId !== 'uifn-10-readiness-decisions' || decisions?.status !== 'active') {
    failures.push(issue('UIFN_DECISION_CONTRACT_MALFORMED'));
  }
  if (!Array.isArray(decisions?.decisions) || decisions.decisions.length !== 10) {
    failures.push(issue('UIFN_DECISION_COUNT_INVALID', { actual: decisions?.decisions?.length ?? null }));
  }
  if (decisions?.decisions?.some((entry) => entry.locked !== true)) {
    failures.push(issue('UIFN_DECISION_NOT_LOCKED'));
  }
  if (duplicates(ids(decisions?.decisions)).length > 0) {
    failures.push(issue('UIFN_DECISION_ID_DUPLICATE'));
  }
  for (const source of [decisions?.sourceSpec, decisions?.sourceAudit]) {
    if (typeof source !== 'string' || path.isAbsolute(source) || source.includes('..') || !existsSync(path.join(repoRoot, source))) {
      failures.push(issue('UIFN_DECISION_SOURCE_INVALID', { source: source ?? null }));
    }
  }
  const signature = decisions?.signature;
  if (signature?.scheme !== 'sha256-content-attestation-v1' || !Array.isArray(signature?.signedFields) || !sha256Pattern.test(signature?.payloadSha256 ?? '')) {
    failures.push(issue('UIFN_DECISION_SIGNATURE_MALFORMED'));
  } else {
    const payload = Object.fromEntries(signature.signedFields.map((field) => [field, decisions[field]]));
    const actual = crypto.createHash('sha256').update(stableStringify(payload)).digest('hex');
    if (actual !== signature.payloadSha256) {
      failures.push(issue('UIFN_DECISION_SIGNATURE_MISMATCH', { expected: signature.payloadSha256, actual }));
    }
  }
  const classes = decisions?.targetPackageClasses;
  for (const classification of ['stable', 'experimental', 'removed', 'private']) {
    if (!Array.isArray(classes?.[classification]) || classes[classification].length === 0 || duplicates(classes[classification]).length > 0) {
      failures.push(issue('UIFN_DECISION_PACKAGE_CLASS_INVALID', { classification }));
    }
  }
  return failures;
}

export function validateSupportedMatrix(matrix) {
  const failures = [];
  if (matrix?.schemaVersion !== 1 || matrix?.status !== 'target-not-yet-proven') failures.push(issue('UIFN_SUPPORT_MATRIX_MALFORMED'));
  for (const nodeVersion of ['20', '22', '24']) {
    if (!matrix?.nodes?.includes(nodeVersion)) failures.push(issue('UIFN_SUPPORT_MATRIX_CELL_MISSING', { cell: `node-${nodeVersion}` }));
  }
  for (const framework of ['react', 'svelte', 'solid']) {
    if (!matrix?.frameworks?.some((entry) => entry.name === framework)) failures.push(issue('UIFN_SUPPORT_MATRIX_CELL_MISSING', { cell: framework }));
  }
  for (const at of ['voiceover', 'nvda', 'talkback']) {
    if (!matrix?.assistiveTechnology?.some((entry) => entry.at === at && entry.required === true)) {
      failures.push(issue('UIFN_SUPPORT_MATRIX_CELL_MISSING', { cell: at }));
    }
  }
  const jaws = matrix?.assistiveTechnology?.find((entry) => entry.at === 'jaws');
  if (!jaws || jaws.required !== false || jaws.status !== 'not-tested-user-deferred') {
    failures.push(issue('UIFN_SUPPORT_MATRIX_JAWS_DISCLOSURE_INVALID'));
  }
  if (matrix?.missingCellPolicy !== 'release-blocking') failures.push(issue('UIFN_SUPPORT_MATRIX_FAIL_OPEN'));
  return failures;
}

function topLevelUifnPackages() {
  return readdirSync(path.join(repoRoot, 'uifn'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(path.join(repoRoot, 'uifn', entry.name, 'package.json')))
    .map((entry) => readJson(path.join('uifn', entry.name, 'package.json')))
    .filter((manifest) => manifest.name?.startsWith('@uifn/'));
}

function rootUifnGateIds() {
  const rootPackage = readJson('package.json');
  return Object.keys(rootPackage.scripts ?? {}).filter((name) => name.startsWith('verify:uifn-')).sort();
}

function validateOwnedCollection(name, entries, expected, principalIds) {
  const failures = [];
  const entryIds = ids(entries);
  for (const duplicate of duplicates(entryIds)) failures.push(issue('UIFN_OWNER_DUPLICATE', { collection: name, surface: duplicate }));
  for (const surface of missing(expected, entryIds)) failures.push(issue('UIFN_OWNER_MISSING', { collection: name, surface }));
  for (const entry of entries) {
    if (!principalIds.has(entry.owner)) failures.push(issue('UIFN_OWNER_PRINCIPAL_UNKNOWN', { collection: name, surface: entry.id, owner: entry.owner }));
    if (!Number.isInteger(entry.reviewCadenceDays) || entry.reviewCadenceDays < 1 || entry.reviewCadenceDays > 90) {
      failures.push(issue('UIFN_OWNER_REVIEW_CADENCE_INVALID', { collection: name, surface: entry.id }));
    }
  }
  return failures;
}

export function validateOwnership(ownership, decisions, options = {}) {
  const failures = [];
  if (ownership?.schemaVersion !== 1 || ownership?.ledgerId !== 'uifn-ownership-v1' || ownership?.status !== 'active') {
    failures.push(issue('UIFN_OWNERSHIP_LEDGER_MALFORMED'));
    return failures;
  }
  const principalIds = new Set(ids(ownership.principals));
  if (principalIds.size === 0) failures.push(issue('UIFN_OWNER_PRINCIPAL_MISSING'));
  for (const principal of ownership.principals ?? []) {
    if (!/^@[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)?$/.test(principal.handle ?? '') || !principal.acceptanceEvidence) {
      failures.push(issue('UIFN_OWNER_ACCEPTANCE_UNPROVEN', { owner: principal.id }));
    }
  }

  const currentPackages = topLevelUifnPackages();
  const currentOwned = currentPackages
    .filter((manifest) => ['ga-candidate', 'beta'].includes(manifest.uifn?.status))
    .map((manifest) => manifest.name);
  const decisionPackages = [
    ...(decisions?.targetPackageClasses?.stable ?? []),
    ...(decisions?.targetPackageClasses?.experimental ?? []),
    ...(decisions?.targetPackageClasses?.removed ?? []),
  ];
  failures.push(...validateOwnedCollection('packages', ownership.packages ?? [], unique([...currentOwned, ...decisionPackages]), principalIds));
  failures.push(...validateOwnedCollection('domServices', ownership.domServices ?? [], expectedDomServices, principalIds));
  failures.push(...validateOwnedCollection('primitiveFamilies', ownership.primitiveFamilies ?? [], expectedPrimitiveFamilies, principalIds));
  failures.push(...validateOwnedCollection('releaseGates', ownership.releaseGates ?? [], unique(['verify:uifn-governance', ...rootUifnGateIds()]), principalIds));
  failures.push(...validateOwnedCollection('accessibility', ownership.accessibility ?? [], expectedAccessibilitySurfaces, principalIds));
  failures.push(...validateOwnedCollection('securityAndPerformance', ownership.securityAndPerformance ?? [], expectedSecurityPerformanceSurfaces, principalIds));

  const independent = ownership.accessibility?.find((entry) => entry.id === 'independent-accessibility-review');
  if (independent?.implementationOwnerCannotSelfApprove !== true) failures.push(issue('UIFN_INDEPENDENT_REVIEW_OWNER_RULE_MISSING'));

  if (!options.skipCodeowners) {
    const codeownersPath = '.github/CODEOWNERS';
    if (!existsSync(path.join(repoRoot, codeownersPath))) {
      failures.push(issue('UIFN_CODEOWNERS_MISSING'));
    } else {
      const source = readFileSync(path.join(repoRoot, codeownersPath), 'utf8');
      const handle = ownership.principals?.[0]?.handle;
      for (const pattern of ['/uifn/', '/scripts/verify-uifn-', '/.github/CODEOWNERS']) {
        if (!source.split('\n').some((line) => line.startsWith(pattern) && line.includes(handle))) {
          failures.push(issue('UIFN_CODEOWNERS_SCOPE_MISSING', { pattern, owner: handle }));
        }
      }
    }
  }
  return failures;
}

export function calculateDefectSla(defect, policy) {
  const severity = policy.severityLevels.find((entry) => entry.id === defect.severity);
  if (!severity) return undefined;
  const created = new Date(defect.createdAt).getTime();
  const at = (hours) => new Date(created + hours * 60 * 60 * 1000).toISOString();
  return {
    acknowledgeDueAt: at(severity.acknowledgeWithinHours),
    triageDueAt: at(severity.triageWithinHours),
    mitigateDueAt: at(severity.mitigateWithinHours),
    remediateDueAt: at(severity.remediateWithinHours),
    releaseBlocking: severity.releaseBlocking,
    exceptionAllowed: severity.exceptionAllowed,
  };
}

export function evaluateDefect(defect, policy, evaluateAt = new Date()) {
  const failures = [];
  const sla = calculateDefectSla(defect, policy);
  if (!sla) return [issue('UIFN_DEFECT_SEVERITY_INVALID', { defect: defect.id })];
  const evaluationTime = new Date(evaluateAt).getTime();
  const triageExpired = evaluationTime > new Date(sla.triageDueAt).getTime();
  if ((defect.status === 'new' && (triageExpired || defect.accessibility === true)) || (defect.lastTriagedAt == null && triageExpired)) {
    failures.push(issue('UIFN_DEFECT_UNTRIAGED_OR_EXPIRED', { defect: defect.id, triageDueAt: sla.triageDueAt }));
  }
  const releaseClosed = ['verified', 'closed'].includes(defect.status);
  if (!releaseClosed && ['P0', 'P1'].includes(defect.severity)) {
    failures.push(issue('UIFN_DEFECT_RELEASE_BLOCKING_OPEN', { defect: defect.id, severity: defect.severity }));
  }
  if (!releaseClosed && defect.severity === 'P2') {
    const exception = defect.exception;
    const approvedAt = new Date(exception?.approvedAt ?? Number.NaN).getTime();
    const expiresAt = new Date(exception?.expiresAt ?? Number.NaN).getTime();
    const maxExpiry = approvedAt + 720 * 60 * 60 * 1000;
    const validException = Boolean(
      exception?.id &&
        exception?.defectId === defect.id &&
        exception?.reason &&
        exception?.mitigation &&
        exception?.owner &&
        exception?.approvedBy &&
        Number.isFinite(approvedAt) &&
        Number.isFinite(expiresAt) &&
        expiresAt > evaluationTime &&
        expiresAt <= maxExpiry &&
        Array.isArray(exception?.affectedRequirements) &&
        (!defect.accessibility || exception?.accessibilityReviewerApproval === true),
    );
    if (!validException) failures.push(issue('UIFN_DEFECT_P2_EXCEPTION_INVALID_OR_MISSING', { defect: defect.id }));
  }
  return failures;
}

export function validateDefectPolicy(policy) {
  const failures = [];
  if (policy?.schemaVersion !== 1 || policy?.policyId !== 'uifn-defect-and-evidence-policy') failures.push(issue('UIFN_DEFECT_POLICY_MALFORMED'));
  const levels = new Map((policy?.severityLevels ?? []).map((entry) => [entry.id, entry]));
  for (const id of ['P0', 'P1', 'P2', 'P3']) {
    if (!levels.has(id)) failures.push(issue('UIFN_DEFECT_SEVERITY_MISSING', { severity: id }));
  }
  for (const id of ['P0', 'P1']) {
    const level = levels.get(id);
    if (level && (level.releaseBlocking !== true || level.exceptionAllowed !== false)) failures.push(issue('UIFN_DEFECT_FAIL_OPEN', { severity: id }));
  }
  const p2 = levels.get('P2');
  if (p2 && (p2.releaseBlocking !== true || p2.exceptionAllowed !== true || p2.exceptionMaxHours > 720 || p2.accessibilityReviewerApprovalRequired !== true)) {
    failures.push(issue('UIFN_DEFECT_P2_EXCEPTION_INVALID'));
  }
  for (const level of levels.values()) {
    for (const key of ['acknowledgeWithinHours', 'triageWithinHours', 'mitigateWithinHours', 'remediateWithinHours']) {
      if (!Number.isFinite(level[key]) || level[key] <= 0) failures.push(issue('UIFN_DEFECT_SLA_INVALID', { severity: level.id, field: key }));
    }
  }
  for (const evidenceClass of ['governance', 'automatedUnitAndContract', 'browserCompatibility', 'securityDependencyLicense', 'performanceAndLeak', 'manualAssistiveTechnology', 'independentAccessibilityReview', 'releaseManifest']) {
    if (!Number.isFinite(policy?.evidenceExpiryHours?.[evidenceClass])) failures.push(issue('UIFN_EVIDENCE_EXPIRY_POLICY_MISSING', { evidenceClass }));
  }
  return failures;
}

const requiredEvidenceFields = [
  'schemaVersion',
  'evidenceId',
  'evidenceClass',
  'requirementIds',
  'vectorIds',
  'status',
  'source',
  'environment',
  'timing',
  'counts',
  'artifacts',
  'defects',
  'signatures',
  'expiresAt',
];

export function validateEvidence(evidence, options = {}) {
  const failures = [];
  for (const field of requiredEvidenceFields) {
    if (!Object.hasOwn(evidence ?? {}, field)) failures.push(issue('UIFN_EVIDENCE_MISSING_FIELD', { field }));
  }
  if (failures.length > 0) return failures;
  if (evidence.schemaVersion !== 1 || typeof evidence.evidenceId !== 'string' || !Array.isArray(evidence.requirementIds) || !Array.isArray(evidence.vectorIds)) {
    failures.push(issue('UIFN_EVIDENCE_MALFORMED'));
  }
  if (!evidence.requirementIds.every((id) => requirementPattern.test(id)) || !evidence.vectorIds.every((id) => vectorPattern.test(id))) {
    failures.push(issue('UIFN_EVIDENCE_MALFORMED'));
  }
  if (!commitPattern.test(evidence.source?.commit ?? '') || !sha256Pattern.test(evidence.source?.lockfileSha256 ?? '') || !sha256Pattern.test(evidence.source?.definitionSha256 ?? '')) {
    failures.push(issue('UIFN_EVIDENCE_MALFORMED'));
  }
  if (!Array.isArray(evidence.source?.artifactHashes) || evidence.source.artifactHashes.length === 0 || evidence.source.artifactHashes.some((entry) => path.isAbsolute(entry.path ?? '') || entry.path?.includes('..') || !sha256Pattern.test(entry.sha256 ?? ''))) {
    failures.push(issue('UIFN_EVIDENCE_MALFORMED'));
  }
  if (!Array.isArray(evidence.artifacts) || evidence.artifacts.length === 0 || evidence.artifacts.some((entry) => path.isAbsolute(entry) || entry.includes('..'))) {
    failures.push(issue('UIFN_EVIDENCE_MALFORMED'));
  }
  const counts = evidence.counts ?? {};
  const countFields = ['total', 'executed', 'passed', 'failed', 'blocked', 'skipped', 'notApplicable'];
  if (countFields.some((field) => !Number.isInteger(counts[field]) || counts[field] < 0) || counts.total !== counts.passed + counts.failed + counts.blocked + counts.skipped + counts.notApplicable) {
    failures.push(issue('UIFN_EVIDENCE_MALFORMED'));
  }
  if (!Array.isArray(evidence.signatures) || evidence.signatures.length === 0) failures.push(issue('UIFN_EVIDENCE_UNSIGNED'));
  const expiresAt = new Date(evidence.expiresAt).getTime();
  const completedAt = new Date(evidence.timing?.completedAt).getTime();
  const now = new Date(options.now ?? Date.now()).getTime();
  const policy = options.policy ?? readJson(contractPath('defect-policy.json'));
  const expiryHours = policy.evidenceExpiryHours?.[evidence.evidenceClass];
  const maximumExpiry = completedAt + expiryHours * 60 * 60 * 1000;
  if (!Number.isFinite(expiresAt) || !Number.isFinite(completedAt) || !Number.isFinite(expiryHours)) failures.push(issue('UIFN_EVIDENCE_MALFORMED'));
  else if (expiresAt <= now) failures.push(issue('UIFN_EVIDENCE_STALE', { expiresAt: evidence.expiresAt }));
  else if (expiresAt > maximumExpiry) failures.push(issue('UIFN_EVIDENCE_STALE', {
    expiresAt: evidence.expiresAt,
    maximumExpiresAt: new Date(maximumExpiry).toISOString(),
    reason: 'evidence-class-expiry-policy',
  }));
  if (evidence.source?.dirty === true) failures.push(issue('UIFN_EVIDENCE_DIRTY'));
  if (evidence.status === 'blocked') failures.push(issue('UIFN_EVIDENCE_BLOCKED'));
  if (evidence.status === 'skipped') failures.push(issue('UIFN_EVIDENCE_SKIPPED'));
  if (evidence.status === 'not-applicable') failures.push(issue('UIFN_EVIDENCE_NOT_APPLICABLE'));
  if (evidence.status === 'failed') failures.push(issue('UIFN_EVIDENCE_FAILED'));
  if (evidence.status === 'passed' && (counts.failed > 0 || counts.blocked > 0 || counts.skipped > 0 || counts.notApplicable > 0 || counts.passed !== counts.total)) {
    failures.push(issue('UIFN_EVIDENCE_STATUS_COUNT_MISMATCH'));
  }
  return unique(failures.map((entry) => entry.code)).map((code) => failures.find((entry) => entry.code === code));
}

function clone(value) {
  return structuredClone(value);
}

function deleteAt(target, dottedPath) {
  const parts = dottedPath.split('.');
  const key = parts.pop();
  let cursor = target;
  for (const part of parts) cursor = cursor?.[part];
  if (cursor && key) delete cursor[key];
}

function setAt(target, dottedPath, value) {
  const parts = dottedPath.split('.');
  const key = parts.pop();
  let cursor = target;
  for (const part of parts) {
    if (!cursor[part] || typeof cursor[part] !== 'object') cursor[part] = {};
    cursor = cursor[part];
  }
  cursor[key] = value;
}

export function materializeEvidenceFixture(fixtureName) {
  const fixture = readJson(contractPath(`fixtures/evidence/${fixtureName}`));
  if (!fixture.base) return fixture;
  const base = clone(readJson(contractPath(`fixtures/evidence/${fixture.base}`)));
  for (const dottedPath of fixture.remove ?? []) deleteAt(base, dottedPath);
  for (const [dottedPath, value] of Object.entries(fixture.set ?? {})) setAt(base, dottedPath, value);
  return { evidence: base, expectedErrorCodes: fixture.expectedErrorCodes, fixtureId: fixture.fixtureId };
}

export function applyOwnershipFixture(ownership, fixture) {
  const mutated = clone(ownership);
  const collection = fixture.removeSurface.collection;
  mutated[collection] = mutated[collection].filter((entry) => entry.id !== fixture.removeSurface.id);
  return mutated;
}

export function validateBaseline(baseline) {
  const failures = [];
  if (baseline?.schemaVersion !== 1 || baseline?.readiness?.verdict !== 'FAIL' || baseline?.readiness?.certification !== false) failures.push(issue('UIFN_BASELINE_READINESS_MISREPRESENTED'));
  if (baseline?.repository?.dirty !== true || !commitPattern.test(baseline?.repository?.headCommit ?? '')) failures.push(issue('UIFN_BASELINE_REPOSITORY_INVALID'));
  for (const field of ['trackedDiffSha256', 'untrackedPathListSha256', 'packageJsonSha256', 'lockfileSha256', 'auditSha256', 'specSha256']) {
    if (!sha256Pattern.test(baseline?.repository?.[field] ?? '')) failures.push(issue('UIFN_BASELINE_HASH_MISSING', { field }));
  }
  if (baseline?.packages?.length !== baseline?.packageSummary?.topLevelPackageCount || duplicates(baseline?.packages?.map((entry) => entry.name) ?? []).length > 0) failures.push(issue('UIFN_BASELINE_PACKAGE_INVENTORY_INVALID'));
  if (baseline?.tarballs?.length !== 16 || baseline.tarballs.some((entry) => !Number.isInteger(entry.fileCount) || !Number.isInteger(entry.unpackedSize))) failures.push(issue('UIFN_BASELINE_TARBALL_INVENTORY_INVALID'));
  const findingIds = baseline?.auditFindings?.map((entry) => entry.id) ?? [];
  for (let index = 1; index <= 18; index += 1) {
    const id = `F-${String(index).padStart(2, '0')}`;
    if (!findingIds.includes(id)) failures.push(issue('UIFN_BASELINE_FINDING_MISSING', { finding: id }));
  }
  const browser = baseline?.verificationBaselines?.find((entry) => entry.command.includes('verify-uifn-browser'));
  if (browser?.status !== 'failed' || browser?.counts?.failed !== 6) failures.push(issue('UIFN_BASELINE_BROWSER_FAILURE_MISSING'));
  if (!baseline?.additionalOpenIssues?.some((entry) => entry.id === 'UIFN-MANUAL-A11Y-001' && entry.status === 'open')) failures.push(issue('UIFN_BASELINE_MANUAL_A11Y_BLOCKER_MISSING'));
  return failures;
}

function validateSchemaDocuments() {
  const failures = [];
  for (const file of ['program-decisions.schema.json', 'ownership.schema.json', 'defect.schema.json', 'evidence.schema.json']) {
    const schema = readJson(contractPath(file));
    if (schema.$schema !== 'https://json-schema.org/draft/2020-12/schema' || !schema.$id || schema.type !== 'object' || !Array.isArray(schema.required)) {
      failures.push(issue('UIFN_GOVERNANCE_SCHEMA_MALFORMED', { file: contractPath(file) }));
    }
  }
  return failures;
}

function validateEvidenceFixtures() {
  const failures = [];
  const results = [];
  const positive = readJson(contractPath('fixtures/evidence/complete.json'));
  const positiveFailures = validateEvidence(positive, { now: '2026-07-17T13:00:00Z' });
  if (positiveFailures.length > 0) failures.push(issue('UIFN_EVIDENCE_POSITIVE_FIXTURE_FAILED', { failures: positiveFailures }));
  results.push({ fixture: 'complete.json', expected: 'pass', actual: positiveFailures.length === 0 ? 'pass' : 'fail', codes: positiveFailures.map((entry) => entry.code) });

  const negativeNames = ['missing.json', 'stale.json', 'blocked.json', 'malformed.json', 'unsigned.json', 'dirty.json', 'skipped.json', 'not-applicable.json'];
  for (const name of negativeNames) {
    const materialized = materializeEvidenceFixture(name);
    const actualCodes = validateEvidence(materialized.evidence, { now: '2026-07-17T13:00:00Z' }).map((entry) => entry.code);
    const missingCodes = missing(materialized.expectedErrorCodes, actualCodes);
    if (missingCodes.length > 0) failures.push(issue('UIFN_EVIDENCE_NEGATIVE_FIXTURE_NOT_CAUGHT', { fixture: name, missingCodes, actualCodes }));
    results.push({ fixture: name, expected: materialized.expectedErrorCodes, actual: actualCodes, caught: missingCodes.length === 0 });
  }
  return { failures, results };
}

function validateDefectFixtures(policy) {
  const failures = [];
  const p1 = readJson(contractPath('fixtures/defects/p1-intake.json'));
  const calculated = calculateDefectSla(p1, policy);
  if (stableStringify(calculated) !== stableStringify(p1.expected)) failures.push(issue('UIFN_DEFECT_SLA_FIXTURE_MISMATCH', { expected: p1.expected, actual: calculated }));

  const matrix = readJson(contractPath('fixtures/defects/severity-matrix.json'));
  for (const expected of matrix.cases) {
    const actual = policy.severityLevels.find((entry) => entry.id === expected.severity);
    for (const field of ['releaseBlocking', 'exceptionAllowed', 'acknowledgeWithinHours', 'triageWithinHours', 'remediateWithinHours']) {
      if (actual?.[field] !== expected[field]) failures.push(issue('UIFN_DEFECT_SEVERITY_FIXTURE_MISMATCH', { severity: expected.severity, field, expected: expected[field], actual: actual?.[field] ?? null }));
    }
  }

  const expired = readJson(contractPath('fixtures/defects/expired-untriaged-a11y-p1.json'));
  const actualCodes = evaluateDefect(expired, policy, expired.evaluateAt).map((entry) => entry.code);
  if (missing(expired.expectedErrorCodes, actualCodes).length > 0) failures.push(issue('UIFN_DEFECT_NEGATIVE_FIXTURE_NOT_CAUGHT', { expected: expired.expectedErrorCodes, actual: actualCodes }));
  return { failures, p1Sla: calculated, expiredCodes: actualCodes };
}

export function runGovernanceVerification() {
  const decisions = readJson(contractPath('program-decisions.json'));
  const matrix = readJson(contractPath('supported-matrix.json'));
  const ownership = readJson(contractPath('ownership.json'));
  const policy = readJson(contractPath('defect-policy.json'));
  const baseline = readJson(contractPath('baseline.json'));

  const checks = [];
  const runCheck = (id, fn) => {
    const failures = fn();
    checks.push({ id, status: failures.length === 0 ? 'passed' : 'failed', failures });
    return failures;
  };

  const allFailures = [
    ...runCheck('governance-schemas', validateSchemaDocuments),
    ...runCheck('program-decisions-signature', () => validateProgramDecisions(decisions)),
    ...runCheck('supported-matrix-contract', () => validateSupportedMatrix(matrix)),
    ...runCheck('ownership-ledger-and-codeowners', () => validateOwnership(ownership, decisions)),
    ...runCheck('defect-and-expiry-policy', () => validateDefectPolicy(policy)),
    ...runCheck('baseline-inventory-and-fail-verdict', () => validateBaseline(baseline)),
  ];

  const evidenceFixtures = validateEvidenceFixtures();
  checks.push({ id: 'evidence-positive-negative-fixtures', status: evidenceFixtures.failures.length === 0 ? 'passed' : 'failed', failures: evidenceFixtures.failures, fixtures: evidenceFixtures.results });
  allFailures.push(...evidenceFixtures.failures);

  const defectFixtures = validateDefectFixtures(policy);
  checks.push({ id: 'defect-sla-and-expired-triage-fixtures', status: defectFixtures.failures.length === 0 ? 'passed' : 'failed', failures: defectFixtures.failures, p1Sla: defectFixtures.p1Sla, expiredCodes: defectFixtures.expiredCodes });
  allFailures.push(...defectFixtures.failures);

  const ownershipFixture = readJson(contractPath('fixtures/ownership/missing-dom-owner.json'));
  const mutatedOwnership = applyOwnershipFixture(ownership, ownershipFixture);
  const ownerCodes = validateOwnership(mutatedOwnership, decisions, { skipCodeowners: true }).map((entry) => entry.code);
  const ownerMissing = missing(ownershipFixture.expectedErrorCodes, ownerCodes);
  const opsNegativeFailures = [];
  if (ownerMissing.length > 0) opsNegativeFailures.push(issue('UIFN_OWNERSHIP_NEGATIVE_FIXTURE_NOT_CAUGHT', { expected: ownershipFixture.expectedErrorCodes, actual: ownerCodes }));
  if (!defectFixtures.expiredCodes.includes('UIFN_DEFECT_UNTRIAGED_OR_EXPIRED')) opsNegativeFailures.push(issue('UIFN_DEFECT_NEGATIVE_FIXTURE_NOT_CAUGHT'));
  checks.push({ id: 'TV-OPS-001-N', status: opsNegativeFailures.length === 0 ? 'passed' : 'failed', failures: opsNegativeFailures, observedCodes: unique([...ownerCodes, ...defectFixtures.expiredCodes]) });
  allFailures.push(...opsNegativeFailures);

  const opsPositiveFailures = checks.filter((entry) => ['ownership-ledger-and-codeowners', 'defect-sla-and-expired-triage-fixtures'].includes(entry.id) && entry.status === 'failed').flatMap((entry) => entry.failures);
  checks.push({ id: 'TV-OPS-001-P', status: opsPositiveFailures.length === 0 ? 'passed' : 'failed', failures: opsPositiveFailures, coverage: { packages: ownership.packages.length, domServices: ownership.domServices.length, primitiveFamilies: ownership.primitiveFamilies.length, releaseGates: ownership.releaseGates.length, accessibility: ownership.accessibility.length, securityAndPerformance: ownership.securityAndPerformance.length } });
  allFailures.push(...opsPositiveFailures);

  return {
    ok: allFailures.length === 0,
    command: 'verify:uifn-governance',
    schemaVersion: 1,
    phase: 'PHASE_00',
    requirement: 'OPS-001',
    vectors: ['TV-OPS-001-P', 'TV-OPS-001-N'],
    checks,
    failures: allFailures,
    summary: {
      total: checks.length,
      passed: checks.filter((entry) => entry.status === 'passed').length,
      failed: checks.filter((entry) => entry.status === 'failed').length,
      ownedSurfaceCount: ownership.packages.length + ownership.domServices.length + ownership.primitiveFamilies.length + ownership.releaseGates.length + ownership.accessibility.length + ownership.securityAndPerformance.length,
      baselineVerdict: baseline.readiness.verdict,
    },
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const result = runGovernanceVerification();
  const output = JSON.stringify(result, null, 2);
  if (result.ok) {
    console.log(output);
    process.exit(0);
  }
  console.error(output);
  process.exit(1);
}
