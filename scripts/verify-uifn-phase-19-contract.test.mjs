import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import Ajv from 'ajv';
import {
  createPhase19Signature,
  phase19BlockingDefectIssues,
  phase19DefectSetSha256,
  phase19ManualEvidenceSetSha256,
  phase19PublicKeyId,
  phase19Sha256,
  validatePhase19IndependentReview,
  validatePhase19ManualEvidence,
  validatePhase19ManualMatrix,
  validatePhase19ParticipantRegistry,
  PHASE_19_DELIVERY_MODES,
  PHASE_19_FRAMEWORKS,
  PHASE_19_REVIEW_SCOPE,
} from './uifn-phase-19-contract.mjs';

const matrix = JSON.parse(readFileSync(new URL('../uifn/.conduct/accessibility/phase-19/matrix.json', import.meta.url), 'utf8'));
const defectPolicy = JSON.parse(readFileSync(new URL('../uifn/evidence/contracts/defect-policy.json', import.meta.url), 'utf8'));
const now = new Date('2026-07-26T12:00:00.000Z');
const timing = {
  startedAt: '2026-07-25T08:00:00.000Z',
  completedAt: '2026-07-25T12:00:00.000Z',
  expiresAt: '2026-09-01T12:00:00.000Z',
};

function keys() {
  const pair = generateKeyPairSync('ed25519');
  return {
    privateKey: pair.privateKey,
    publicKey: pair.publicKey,
    publicKeyPem: pair.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  };
}

const trustRoot = keys();
const testerKey = keys();
const reviewerKey = keys();
const automationKey = keys();

function participant(id, key, fields) {
  return {
    id,
    displayName: fields.displayName,
    kind: 'human',
    automation: false,
    roles: fields.roles,
    qualifiedAtProfiles: fields.qualifiedAtProfiles ?? [],
    independentOfImplementation: fields.independentOfImplementation ?? false,
    implementationPrincipalIds: fields.implementationPrincipalIds ?? [],
    identityEvidence: {
      type: 'externally-verified-human-identity',
      reference: `identity:${id}`,
      verifiedBy: 'uifn-accessibility-program-authority',
      verifiedAt: '2026-07-24T00:00:00.000Z',
    },
    keyId: phase19PublicKeyId(key.publicKey),
    publicKeyPem: key.publicKeyPem,
    qualifications: [{
      issuer: 'Qualified accessibility testing organization',
      subject: fields.displayName,
      evidence: 'Credential and practical assessment verified outside the repository.',
      validUntil: '2026-09-30T00:00:00.000Z',
    }],
  };
}

function registry() {
  const value = {
    schemaVersion: 1,
    registryId: 'uifn-phase-19-human-trust-v1',
    status: 'active',
    issuedBy: 'uifn-accessibility-program-authority',
    issuedAt: '2026-07-25T00:00:00.000Z',
    expiresAt: '2026-09-30T00:00:00.000Z',
    participants: [
      participant('tester-1', testerKey, {
        displayName: 'Qualified AT tester',
        roles: ['manual-at-tester'],
        qualifiedAtProfiles: ['voiceover-macos', 'voiceover-ios', 'nvda-windows', 'talkback-android'],
      }),
      participant('reviewer-1', reviewerKey, {
        displayName: 'Independent accessibility reviewer',
        roles: ['independent-accessibility-reviewer'],
        independentOfImplementation: true,
      }),
    ],
  };
  value.signature = createPhase19Signature(value, {
    privateKey: trustRoot.privateKey,
    publicKey: trustRoot.publicKey,
    signedBy: 'uifn-accessibility-program-authority',
    signedAt: value.issuedAt,
  });
  return value;
}

const trusted = validatePhase19ParticipantRegistry(registry(), {
  trustRootPublicKey: trustRoot.publicKey,
  now,
});

const releaseArtifacts = ['core', 'dom', 'adapter-kit', 'react', 'svelte', 'solid'].map((name, index) => ({
  package: `@uifn/${name}`,
  filename: `${name}.tgz`,
  sha256: String(index + 1).repeat(64),
}));
const releaseCandidate = {
  commit: 'a'.repeat(40),
  dirty: false,
  definitionSha256: 'b'.repeat(64),
  artifactSetSha256: phase19Sha256([...releaseArtifacts]
    .sort((left, right) => left.package.localeCompare(right.package))
    .map(({ package: packageName, filename, sha256 }) => ({ package: packageName, filename, sha256 }))),
  phase18EvidenceSha256: 'd'.repeat(64),
  matrixDefinitionSha256: matrix.definitionSha256,
  artifacts: releaseArtifacts,
};

function sessionsFor(row) {
  return row.atProfile.requiredBrowsers.map((browser, index) => {
    const name = browser.name ?? browser.names[0];
    return {
      id: `${row.atProfileId}-session-${index + 1}`,
      platform: row.atProfile.platform,
      osVersion: '26.0.1',
      deviceName: 'Physical test system',
      deviceModel: 'Exact model recorded',
      physical: true,
      emulated: false,
      browser: { name, channel: browser.channel, version: '150.0.1' },
      assistiveTechnology: {
        name: row.atProfile.assistiveTechnology,
        version: '26.0.1',
        settings: 'Default verbosity with punctuation and control announcements recorded.',
      },
      locale: 'en-US',
    };
  });
}

function manualDocument(row, {
  testerId = 'tester-1',
  key = testerKey,
  sign = true,
} = {}) {
  const sessions = sessionsFor(row);
  const value = {
    schemaVersion: 1,
    evidenceId: row.evidenceId,
    evidenceClass: 'manualAssistiveTechnology',
    status: 'passed',
    result: 'passed',
    rowId: row.rowId,
    matrixRevision: matrix.revision,
    scriptSha256: row.scriptSha256,
    source: structuredClone(releaseCandidate),
    tester: { participantId: testerId, humanObserved: true, automationGenerated: false },
    sessions,
    executions: sessions.flatMap((session) => PHASE_19_FRAMEWORKS.flatMap((framework) => (
      PHASE_19_DELIVERY_MODES.map((deliveryMode) => ({
        sessionId: session.id,
        framework,
        deliveryMode,
        startedAt: timing.startedAt,
        completedAt: timing.completedAt,
        result: 'passed',
        steps: row.script.steps.map((instruction, index) => ({
          stepIndex: index + 1,
          instruction,
          expected: row.script.expectedOutcomes[index],
          observedSpeech: 'Human tester recorded the exact spoken output; no output was inferred from DOM state.',
          observedNavigation: 'Human tester recorded the resulting navigation and control state.',
          focusPath: ['document', row.primitive, `step-${index + 1}`],
          result: 'passed',
          humanObserved: true,
          automationInferred: false,
        })),
        modeObservations: row.requiredModes.map((modeId) => ({
          modeId,
          observedSpeech: `Human-observed speech for mode ${modeId}.`,
          observedNavigation: `Human-observed navigation for mode ${modeId}.`,
          focusPath: ['document', row.primitive, modeId],
          result: 'passed',
          humanObserved: true,
          automationInferred: false,
        })),
        stateObservations: row.requiredStates.map(({ name: stateName }) => ({
          stateName,
          observedSpeech: `Human-observed speech for state ${stateName}.`,
          observedNavigation: `Human-observed navigation for state ${stateName}.`,
          focusPath: ['document', row.primitive, stateName],
          result: 'passed',
          humanObserved: true,
          automationInferred: false,
        })),
        eventObservations: row.requiredEvents.map(({ type: eventType }) => ({
          eventType,
          observedSpeech: `Human-observed speech for event ${eventType}.`,
          observedNavigation: `Human-observed navigation for event ${eventType}.`,
          focusPath: ['document', row.primitive, eventType],
          result: 'passed',
          humanObserved: true,
          automationInferred: false,
        })),
      }))
    ))),
    defects: [],
    retests: [],
    timing,
  };
  if (sign) value.signature = createPhase19Signature(value, {
    privateKey: key.privateKey,
    publicKey: key.publicKey,
    signedBy: testerId,
    signedAt: timing.completedAt,
  });
  return value;
}

let completeManualDocumentsCache;
function completeManualDocuments() {
  completeManualDocumentsCache ??= matrix.rows.map((row) => manualDocument(row));
  return completeManualDocumentsCache;
}

function reviewDocument(manualDocuments, defects = [], {
  reviewerId = 'reviewer-1',
  key = reviewerKey,
} = {}) {
  const families = [...new Set(matrix.rows.map((row) => row.behaviorFamily))].sort();
  const value = {
    schemaVersion: 1,
    evidenceId: 'EVID-P19-INDEPENDENT-TEST',
    evidenceClass: 'independentAccessibilityReview',
    status: 'passed',
    source: structuredClone(releaseCandidate),
    reviewer: { participantId: reviewerId },
    independence: {
      implementedRelevantWave: false,
      reviewerIsImplementationOwner: false,
      conflicts: [],
      statement: 'The reviewer did not implement the relevant primitive waves and has no conflicting delivery responsibility.',
    },
    scope: [...PHASE_19_REVIEW_SCOPE],
    methods: [
      'Reviewed the normative ledger and risk-based implementation samples.',
      'Reviewed automation, negative mutations, and immutable evidence identity.',
      'Reviewed every signed manual row and matrix denominator.',
      'Reviewed defect disposition, retests, support claims, and explicit deferments.',
    ],
    familySamples: families.map((behaviorFamily) => ({
      behaviorFamily,
      primitive: matrix.rows.find((row) => row.behaviorFamily === behaviorFamily).primitive,
      codeReviewed: true,
      evidenceReviewed: true,
    })),
    manualEvidenceSetSha256: phase19ManualEvidenceSetSha256(manualDocuments),
    defectSetSha256: phase19DefectSetSha256(defects),
    matrixDefinitionSha256: matrix.definitionSha256,
    findings: [],
    retests: [],
    defectDispositions: defects.map((defect) => ({
      defectId: defect.id,
      severity: defect.severity,
      status: defect.status,
      reviewed: true,
      decision: 'Reviewed against the release-blocking accessibility defect policy.',
    })),
    assessment: {
      qualification: 'unqualified',
      score: 10,
      claim: 'accessibility-confidence-10-of-10',
      confidenceGates: Array.from({ length: 10 }, (_, index) => ({
        id: index + 1,
        status: 'passed',
        evidence: [`gate-${index + 1}-reviewed`],
      })),
    },
    supportStatement: {
      jaws: 'not-tested-user-deferred',
      claimsUntestedSupport: false,
      requiredAssistiveTechnologiesPassed: true,
    },
    timing,
  };
  value.signature = createPhase19Signature(value, {
    privateKey: key.privateKey,
    publicKey: key.publicKey,
    signedBy: reviewerId,
    signedAt: timing.completedAt,
  });
  return value;
}

test('externally trust-root-signed registry accepts qualified human tester and independent reviewer', () => {
  assert.deepEqual(trusted.issues, []);
  assert.equal(trusted.participants.size, 2);
});

test('TV-A11Y-003-P accepts exact signed human evidence across required browsers, frameworks, and delivery modes', () => {
  const row = matrix.rows.find((entry) => entry.atProfileId === 'voiceover-macos');
  const document = manualDocument(row);
  assert.deepEqual(validatePhase19ManualEvidence(document, {
    matrixRow: row,
    participants: trusted.participants,
    releaseCandidate,
    now,
  }), []);
});

test('TV-A11Y-003-N rejects unsigned and automation-signed manual claims', () => {
  const row = matrix.rows.find((entry) => entry.atProfileId === 'voiceover-macos');
  const unsigned = manualDocument(row, { sign: false });
  const unsignedCodes = validatePhase19ManualEvidence(unsigned, {
    matrixRow: row,
    participants: trusted.participants,
    releaseCandidate,
    now,
  }).map((entry) => entry.code);
  assert(unsignedCodes.includes('UIFN_MANUAL_EVIDENCE_UNSIGNED'));

  const automation = manualDocument(row, {
    testerId: 'automation-runner',
    key: automationKey,
  });
  const automationCodes = validatePhase19ManualEvidence(automation, {
    matrixRow: row,
    participants: trusted.participants,
    releaseCandidate,
    now,
  }).map((entry) => entry.code);
  assert(automationCodes.includes('UIFN_MANUAL_EVIDENCE_UNSIGNED'));
});

test('TV-A11Y-003-N reports omitted TalkBack matrix rows with the stable code', () => {
  const documents = completeManualDocuments()
    .filter((document) => !document.rowId.endsWith('talkback-android'));
  const issues = validatePhase19ManualMatrix({
    matrix,
    documents,
    participants: trusted.participants,
    releaseCandidate,
    defects: [],
    defectPolicy,
    now,
  });
  assert(issues.some((entry) => entry.code === 'UIFN_MANUAL_MATRIX_MISSING' && entry.rowId?.includes('talkback-android')));
});

test('TV-A11Y-004-P accepts a separately signed independent ten-gate assessment', () => {
  const manualDocuments = completeManualDocuments();
  const review = reviewDocument(manualDocuments);
  assert.deepEqual(validatePhase19IndependentReview(review, {
    matrix,
    manualDocuments,
    participants: trusted.participants,
    releaseCandidate,
    defects: [],
    defectPolicy,
    implementationOwnerIds: ['uifn-maintainer'],
    now,
  }), []);
});

test('TV-A11Y-004-N rejects self-review by a manual tester', () => {
  const manualDocuments = completeManualDocuments();
  const review = reviewDocument(manualDocuments, [], {
    reviewerId: 'tester-1',
    key: testerKey,
  });
  const codes = validatePhase19IndependentReview(review, {
    matrix,
    manualDocuments,
    participants: trusted.participants,
    releaseCandidate,
    defects: [],
    defectPolicy,
    implementationOwnerIds: ['uifn-maintainer'],
    now,
  }).map((entry) => entry.code);
  assert(codes.includes('UIFN_REVIEW_NOT_INDEPENDENT'));
});

test('TV-A11Y-004-N rejects an open P1 accessibility defect', () => {
  const manualDocuments = completeManualDocuments();
  const defects = [{
    id: 'A11Y-P1-TEST',
    title: 'Required assistive-technology behavior is incorrect',
    severity: 'P1',
    status: 'triaged',
    owner: 'uifn-maintainer',
    createdAt: '2026-07-25T00:00:00.000Z',
    lastTriagedAt: '2026-07-25T01:00:00.000Z',
    affectedRequirements: ['A11Y-003'],
    affectedEvidence: [manualDocuments[0].evidenceId],
    targetRelease: '1.0.0',
    accessibility: true,
  }];
  const review = reviewDocument(manualDocuments, defects);
  const codes = validatePhase19IndependentReview(review, {
    matrix,
    manualDocuments,
    participants: trusted.participants,
    releaseCandidate,
    defects,
    defectPolicy,
    implementationOwnerIds: ['uifn-maintainer'],
    now,
  }).map((entry) => entry.code);
  assert(codes.includes('UIFN_A11Y_BLOCKING_DEFECT'));
});

test('TV-A11Y-004-N rejects a relevant defect with an unknown severity', () => {
  const issues = phase19BlockingDefectIssues([{
    id: 'A11Y-UNKNOWN-SEVERITY',
    severity: 'urgent',
    status: 'triaged',
    owner: 'uifn-maintainer',
    createdAt: '2026-07-25T00:00:00.000Z',
    lastTriagedAt: '2026-07-25T01:00:00.000Z',
    affectedRequirements: ['A11Y-003'],
    affectedEvidence: [],
    accessibility: true,
  }], defectPolicy, now);

  assert.deepEqual(issues.map((entry) => entry.code), ['UIFN_A11Y_BLOCKING_DEFECT']);
  assert.deepEqual(issues[0].reasons, ['UIFN_DEFECT_SEVERITY_INVALID']);
});

test('independent findings and retests must bind to the exact defect set and review interval', () => {
  const manualDocuments = completeManualDocuments();
  const review = reviewDocument(manualDocuments);
  review.findings = [{ defectId: 'A11Y-NOT-IN-DEFECT-SET', status: 'closed' }];
  review.retests = [{
    defectId: 'A11Y-NOT-IN-DEFECT-SET',
    result: 'passed',
    completedAt: timing.completedAt,
    humanObserved: true,
    automationInferred: false,
  }];
  review.signature = createPhase19Signature(review, {
    privateKey: reviewerKey.privateKey,
    publicKey: reviewerKey.publicKey,
    signedBy: 'reviewer-1',
    signedAt: timing.completedAt,
  });
  const issues = validatePhase19IndependentReview(review, {
    matrix,
    manualDocuments,
    participants: trusted.participants,
    releaseCandidate,
    defects: [],
    defectPolicy,
    implementationOwnerIds: ['uifn-maintainer'],
    now,
  });
  assert(issues.some((entry) => entry.code === 'UIFN_REVIEW_INCOMPLETE' && entry.reason === 'method-findings-retests-or-ten-gates'));
});

test('signed evidence cannot be edited after attestation', () => {
  const row = matrix.rows.find((entry) => entry.atProfileId === 'nvda-windows');
  const document = manualDocument(row);
  document.executions[0].steps[0].observedSpeech = 'tampered';
  const codes = validatePhase19ManualEvidence(document, {
    matrixRow: row,
    participants: trusted.participants,
    releaseCandidate,
    now,
  }).map((entry) => entry.code);
  assert(codes.includes('UIFN_MANUAL_EVIDENCE_UNSIGNED'));
});

test('all declared modes, states, and events require separate human observations', () => {
  const row = matrix.rows.find((entry) => entry.primitive === 'dialog' && entry.atProfileId === 'voiceover-macos');
  const document = manualDocument(row);
  document.executions[0].modeObservations = document.executions[0].modeObservations.filter(({ modeId }) => modeId !== 'edge-cases');
  document.signature = createPhase19Signature(document, {
    privateKey: testerKey.privateKey,
    publicKey: testerKey.publicKey,
    signedBy: 'tester-1',
    signedAt: timing.completedAt,
  });
  const codes = validatePhase19ManualEvidence(document, {
    matrixRow: row,
    participants: trusted.participants,
    releaseCandidate,
    now,
  }).map((entry) => entry.code);
  assert(codes.includes('UIFN_MANUAL_EVIDENCE_INCOMPLETE'));
});

test('participant registry rejects tester/reviewer aliases that reuse one signing key', () => {
  const aliased = registry();
  aliased.participants[1].keyId = aliased.participants[0].keyId;
  aliased.participants[1].publicKeyPem = aliased.participants[0].publicKeyPem;
  aliased.signature = createPhase19Signature(aliased, {
    privateKey: trustRoot.privateKey,
    publicKey: trustRoot.publicKey,
    signedBy: 'uifn-accessibility-program-authority',
    signedAt: aliased.issuedAt,
  });
  const result = validatePhase19ParticipantRegistry(aliased, {
    trustRootPublicKey: trustRoot.publicKey,
    now,
  });
  assert(result.issues.some((entry) => entry.code === 'UIFN_PARTICIPANT_REGISTRY_INVALID'));
});

test('closed manual defects require exact evidence linkage and a human retest', () => {
  const document = manualDocument(matrix.rows[0]);
  const defect = {
    id: 'A11Y-CLOSED-WITHOUT-RETEST',
    title: 'Previously observed speech mismatch',
    severity: 'P1',
    status: 'closed',
    owner: 'uifn-maintainer',
    createdAt: '2026-07-24T00:00:00.000Z',
    lastTriagedAt: '2026-07-24T01:00:00.000Z',
    affectedRequirements: ['A11Y-003'],
    affectedEvidence: [document.evidenceId],
    targetRelease: '1.0.0',
    accessibility: true,
  };
  document.defects = [defect.id];
  document.signature = createPhase19Signature(document, {
    privateKey: testerKey.privateKey,
    publicKey: testerKey.publicKey,
    signedBy: 'tester-1',
    signedAt: timing.completedAt,
  });
  const issues = validatePhase19ManualMatrix({
    matrix,
    documents: completeManualDocuments().map((entry) => entry.rowId === document.rowId ? document : entry),
    participants: trusted.participants,
    releaseCandidate,
    defects: [defect],
    defectPolicy,
    now,
  });
  assert(issues.some((entry) => entry.code === 'UIFN_MANUAL_EVIDENCE_INCOMPLETE' && entry.reason === 'closed-defect-retest-missing'));
});

test('manual defect retests must be human-observed after defect creation and inside the evidence interval', () => {
  const document = manualDocument(matrix.rows[0]);
  const defect = {
    id: 'A11Y-CLOSED-BEFORE-RETEST-INTERVAL',
    title: 'Previously observed navigation mismatch',
    severity: 'P1',
    status: 'closed',
    owner: 'uifn-maintainer',
    createdAt: '2026-07-25T10:00:00.000Z',
    lastTriagedAt: '2026-07-25T10:30:00.000Z',
    affectedRequirements: ['A11Y-003'],
    affectedEvidence: [document.evidenceId],
    targetRelease: '1.0.0',
    accessibility: true,
  };
  document.defects = [defect.id];
  document.retests = [{
    defectId: defect.id,
    result: 'passed',
    completedAt: '2026-07-25T09:00:00.000Z',
    humanObserved: true,
    automationInferred: false,
  }];
  document.signature = createPhase19Signature(document, {
    privateKey: testerKey.privateKey,
    publicKey: testerKey.publicKey,
    signedBy: 'tester-1',
    signedAt: timing.completedAt,
  });
  const issues = validatePhase19ManualMatrix({
    matrix,
    documents: completeManualDocuments().map((entry) => entry.rowId === document.rowId ? document : entry),
    participants: trusted.participants,
    releaseCandidate,
    defects: [defect],
    defectPolicy,
    now,
  });
  assert(issues.some((entry) => entry.code === 'UIFN_MANUAL_EVIDENCE_INCOMPLETE' && entry.reason === 'retest-invalid'));
});

test('published JSON Schemas accept complete evidence and reject missing observation coverage', () => {
  const ajv = new Ajv({ allErrors: true, schemaId: 'auto' });
  const participantSchema = JSON.parse(readFileSync(new URL('../uifn/.conduct/accessibility/phase-19/participants.schema.json', import.meta.url), 'utf8'));
  const manualSchema = JSON.parse(readFileSync(new URL('../uifn/.conduct/accessibility/phase-19/manual-evidence.schema.json', import.meta.url), 'utf8'));
  const reviewSchema = JSON.parse(readFileSync(new URL('../uifn/.conduct/accessibility/phase-19/independent-review.schema.json', import.meta.url), 'utf8'));
  assert.equal(ajv.validate(participantSchema, registry()), true, ajv.errorsText());
  const manual = manualDocument(matrix.rows[0]);
  assert.equal(ajv.validate(manualSchema, manual), true, ajv.errorsText());
  assert.equal(ajv.validate(reviewSchema, reviewDocument(completeManualDocuments())), true, ajv.errorsText());
  delete manual.executions[0].modeObservations;
  assert.equal(ajv.validate(manualSchema, manual), false);
});
