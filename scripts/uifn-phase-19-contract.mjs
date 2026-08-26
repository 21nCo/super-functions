import {
  createHash,
  createPublicKey,
  sign as cryptoSign,
  verify as cryptoVerify,
} from 'node:crypto';
import { evaluateDefect } from './verify-uifn-governance.mjs';

export const PHASE_19_SCHEMA_VERSION = 1;
export const PHASE_19_MATRIX_REVISION = 'uifn-manual-at-matrix-v1';
export const PHASE_19_EVIDENCE_EXPIRY_HOURS = 2160;
export const PHASE_19_FRAMEWORKS = Object.freeze(['react', 'svelte', 'solid']);
export const PHASE_19_DELIVERY_MODES = Object.freeze(['package', 'source']);
export const PHASE_19_PACKAGES = Object.freeze([
  '@uifn/core',
  '@uifn/dom',
  '@uifn/adapter-kit',
  '@uifn/react',
  '@uifn/svelte',
  '@uifn/solid',
]);
export const PHASE_19_REVIEW_SCOPE = Object.freeze([
  'normative-ledger',
  'representative-code-every-family',
  'automation-and-negative-mutations',
  'manual-scripts-and-signed-evidence',
  'matrix-completeness',
  'defect-disposition-and-retests',
  'support-claims',
  'jaws-deferment',
]);

export const PHASE_19_AT_PROFILES = Object.freeze({
  'voiceover-macos': {
    platform: 'macOS',
    assistiveTechnology: 'VoiceOver',
    requiredBrowsers: [
      { name: 'Safari', channel: 'current' },
      { name: 'Safari', channel: 'previous' },
    ],
    physicalDevice: true,
  },
  'voiceover-ios': {
    platform: 'iOS',
    assistiveTechnology: 'VoiceOver',
    requiredBrowsers: [{ name: 'Safari', channel: 'current' }],
    physicalDevice: true,
  },
  'nvda-windows': {
    platform: 'Windows',
    assistiveTechnology: 'NVDA',
    requiredBrowsers: [
      { name: 'Firefox', channel: 'current' },
      { names: ['Chrome', 'Edge'], channel: 'current' },
    ],
    physicalDevice: true,
  },
  'talkback-android': {
    platform: 'Android',
    assistiveTechnology: 'TalkBack',
    requiredBrowsers: [{ name: 'Chrome', channel: 'current' }],
    physicalDevice: true,
  },
});

const SHA256 = /^[a-f0-9]{64}$/;
const COMMIT = /^[a-f0-9]{40}$/;

function issue(code, detail = {}) {
  return { code, ...detail };
}

export function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
}

export function canonicalJson(value) {
  return JSON.stringify(stableValue(value));
}

export function phase19Sha256(value) {
  return createHash('sha256')
    .update(typeof value === 'string' || Buffer.isBuffer(value) ? value : canonicalJson(value))
    .digest('hex');
}

export function phase19PublicKeyId(publicKey) {
  const key = publicKey?.type === 'public' ? publicKey : createPublicKey(publicKey);
  return `ed25519:${phase19Sha256(key.export({ type: 'spki', format: 'der' }))}`;
}

export function unsignedPhase19Document(document) {
  const unsigned = structuredClone(document);
  delete unsigned.signature;
  return unsigned;
}

export function createPhase19Signature(document, {
  privateKey,
  publicKey,
  signedBy,
  signedAt,
}) {
  const payload = canonicalJson(unsignedPhase19Document(document));
  return {
    scheme: 'ed25519',
    keyId: phase19PublicKeyId(publicKey),
    signedBy,
    signedAt,
    payloadSha256: phase19Sha256(payload),
    value: cryptoSign(null, Buffer.from(payload), privateKey).toString('base64'),
  };
}

export function verifyPhase19Signature(document, {
  publicKey,
  expectedSigner,
  expectedSignedAt,
  failureCode,
}) {
  const signature = document?.signature;
  try {
    const payload = canonicalJson(unsignedPhase19Document(document));
    const expectedKeyId = phase19PublicKeyId(publicKey);
    const valid = signature?.scheme === 'ed25519'
      && signature?.keyId === expectedKeyId
      && signature?.signedBy === expectedSigner
      && (!expectedSignedAt || signature?.signedAt === expectedSignedAt)
      && signature?.payloadSha256 === phase19Sha256(payload)
      && typeof signature?.value === 'string'
      && cryptoVerify(null, Buffer.from(payload), publicKey, Buffer.from(signature.value, 'base64'));
    return valid ? [] : [issue(failureCode, { reason: 'detached-signature-invalid' })];
  } catch (error) {
    return [issue(failureCode, {
      reason: 'detached-signature-invalid',
      detail: error instanceof Error ? error.message : String(error),
    })];
  }
}

function exactSet(actual, expected) {
  return Array.isArray(actual)
    && actual.length === expected.length
    && [...actual].sort().every((value, index) => value === [...expected].sort()[index]);
}

function validArtifactSet(artifacts, expectedHash) {
  if (!Array.isArray(artifacts)
    || artifacts.length !== PHASE_19_PACKAGES.length
    || !SHA256.test(expectedHash ?? '')) return false;
  const sorted = [...artifacts].sort((left, right) => left.package.localeCompare(right.package));
  if (!sorted.every((artifact, index) => (
    artifact?.package === [...PHASE_19_PACKAGES].sort()[index]
    && typeof artifact?.filename === 'string'
    && artifact.filename.length > 4
    && !artifact.filename.includes('/')
    && artifact.filename.endsWith('.tgz')
    && SHA256.test(artifact?.sha256 ?? '')
  ))) return false;
  return phase19Sha256(sorted.map(({ package: packageName, filename, sha256 }) => ({
    package: packageName,
    filename,
    sha256,
  }))) === expectedHash;
}

function exactSource(actual, expected) {
  return COMMIT.test(actual?.commit ?? '')
    && COMMIT.test(expected?.commit ?? '')
    && SHA256.test(actual?.definitionSha256 ?? '')
    && SHA256.test(actual?.artifactSetSha256 ?? '')
    && SHA256.test(actual?.phase18EvidenceSha256 ?? '')
    && SHA256.test(actual?.matrixDefinitionSha256 ?? '')
    && validArtifactSet(actual?.artifacts, actual?.artifactSetSha256)
    && validArtifactSet(expected?.artifacts, expected?.artifactSetSha256)
    && actual?.commit === expected?.commit
    && actual?.dirty === false
    && expected?.dirty === false
    && actual?.definitionSha256 === expected?.definitionSha256
    && actual?.artifactSetSha256 === expected?.artifactSetSha256
    && actual?.phase18EvidenceSha256 === expected?.phase18EvidenceSha256
    && actual?.matrixDefinitionSha256 === expected?.matrixDefinitionSha256
    && phase19Sha256(actual?.artifacts ?? []) === phase19Sha256(expected?.artifacts ?? []);
}

function validTiming(timing, now, maximumHours = PHASE_19_EVIDENCE_EXPIRY_HOURS) {
  const started = Date.parse(timing?.startedAt ?? '');
  const completed = Date.parse(timing?.completedAt ?? '');
  const expires = Date.parse(timing?.expiresAt ?? '');
  const evaluated = new Date(now).getTime();
  return Number.isFinite(started)
    && Number.isFinite(completed)
    && Number.isFinite(expires)
    && started <= completed
    && completed <= evaluated
    && expires > evaluated
    && expires - completed <= maximumHours * 60 * 60 * 1000;
}

export function buildPhase19Matrix(handoff, catalog, ledger) {
  const primitiveById = new Map((catalog?.primitives ?? []).map((primitive) => [primitive.id, primitive]));
  const ledgerById = new Map((ledger?.primitives ?? []).map((primitive) => [primitive.primitive, primitive]));
  const rows = (handoff?.scripts ?? []).map((script) => {
    const primitive = primitiveById.get(script.primitive);
    const ledgerEntry = ledgerById.get(script.primitive);
    const atProfile = PHASE_19_AT_PROFILES[script.id];
    if (!primitive || !ledgerEntry || !atProfile) throw new Error(`UIFN_PHASE19_HANDOFF_UNKNOWN: ${script.primitive}/${script.id}`);
    const rowId = `P19-${script.primitive}-${script.id}`;
    const exactScript = {
      atProfileId: script.id,
      primitive: script.primitive,
      preconditions: script.preconditions,
      steps: script.steps,
      expectedOutcomes: script.expectedOutcomes,
      evidenceId: script.evidenceId,
    };
    return {
      rowId,
      evidenceId: `EVID-${rowId}`,
      primitive: primitive.id,
      primitiveName: primitive.name,
      behaviorFamily: primitive.behaviorFamily,
      requiredModes: ledgerEntry.modes.map((mode) => mode.id),
      requiredStates: primitive.states.map((state) => ({ name: state.name, kind: state.kind })),
      requiredEvents: primitive.events.map((event) => ({ type: event.type, source: event.source })),
      riskCoverage: {
        formAndError: primitive.formSemantics.participation !== 'none'
          || primitive.states.some((state) => state.name === 'invalid'),
        dynamicUpdates: primitive.events.length > 0
          || primitive.accessibility.rules.announcements.length > 0,
        modalOrDestructive: primitive.behaviorFamily === 'modal-overlay'
          || primitive.id === 'alert-dialog',
        pointerTouchOrGesture: primitive.accessibility.rules.pointerTouch.length > 0,
      },
      atProfileId: script.id,
      atProfile,
      frameworks: [...PHASE_19_FRAMEWORKS],
      deliveryModes: [...PHASE_19_DELIVERY_MODES],
      script: exactScript,
      scriptSha256: phase19Sha256(exactScript),
      status: 'human-evidence-required',
    };
  }).sort((left, right) => left.rowId.localeCompare(right.rowId));
  const unique = new Set(rows.map((row) => row.rowId));
  const expectedRowCount = primitiveById.size * Object.keys(PHASE_19_AT_PROFILES).length;
  if (rows.length !== expectedRowCount || unique.size !== rows.length) {
    throw new Error(
      `UIFN_PHASE19_MATRIX_INVALID: expected ${expectedRowCount} unique rows, received ${rows.length}/${unique.size}`,
    );
  }
  const executionMultiplier = (row) => (
    row.atProfile.requiredBrowsers.length
      * PHASE_19_FRAMEWORKS.length
      * PHASE_19_DELIVERY_MODES.length
  );
  const body = {
    schemaVersion: PHASE_19_SCHEMA_VERSION,
    revision: PHASE_19_MATRIX_REVISION,
    sourceLedgerRevision: handoff.ledgerRevision,
    sourceDefinitionSha256: handoff.definitionSha256,
    sourceLedgerDefinitionSha256: ledger?.definitionSha256,
    jaws: {
      status: 'not-tested-user-deferred',
      required: false,
      supportClaimAllowed: false,
    },
    primitiveCount: primitiveById.size,
    rowCount: rows.length,
    primitiveModeCount: (ledger?.primitives ?? []).reduce((count, primitive) => count + primitive.modes.length, 0),
    primitiveStateCount: (catalog?.primitives ?? []).reduce((count, primitive) => count + primitive.states.length, 0),
    primitiveEventCount: (catalog?.primitives ?? []).reduce((count, primitive) => count + primitive.events.length, 0),
    observationMinimums: {
      executions: rows.reduce((count, row) => count + executionMultiplier(row), 0),
      scriptSteps: rows.reduce((count, row) => count + executionMultiplier(row) * row.script.steps.length, 0),
      modes: rows.reduce((count, row) => count + executionMultiplier(row) * row.requiredModes.length, 0),
      states: rows.reduce((count, row) => count + executionMultiplier(row) * row.requiredStates.length, 0),
      events: rows.reduce((count, row) => count + executionMultiplier(row) * row.requiredEvents.length, 0),
    },
    frameworks: [...PHASE_19_FRAMEWORKS],
    deliveryModes: [...PHASE_19_DELIVERY_MODES],
    rows,
  };
  return {
    ...body,
    definitionSha256: phase19Sha256(body),
  };
}

export function validatePhase19ParticipantRegistry(registry, {
  trustRootPublicKey,
  now = new Date(),
} = {}) {
  const issues = [];
  const participants = new Map();
  const keyIds = new Set();
  const identityReferences = new Set();
  if (!trustRootPublicKey) {
    issues.push(issue('UIFN_PARTICIPANT_TRUST_ROOT_MISSING'));
    return { issues, participants };
  }
  if (registry?.schemaVersion !== PHASE_19_SCHEMA_VERSION
    || registry?.registryId !== 'uifn-phase-19-human-trust-v1'
    || registry?.status !== 'active'
    || registry?.issuedBy !== 'uifn-accessibility-program-authority'
    || !validTiming({
      startedAt: registry?.issuedAt,
      completedAt: registry?.issuedAt,
      expiresAt: registry?.expiresAt,
    }, now)) {
    issues.push(issue('UIFN_PARTICIPANT_REGISTRY_INVALID', { reason: 'metadata' }));
  }
  issues.push(...verifyPhase19Signature(registry, {
    publicKey: trustRootPublicKey,
    expectedSigner: 'uifn-accessibility-program-authority',
    expectedSignedAt: registry?.issuedAt,
    failureCode: 'UIFN_PARTICIPANT_REGISTRY_INVALID',
  }));
  for (const participant of registry?.participants ?? []) {
    if (!participant?.id || participants.has(participant.id)) {
      issues.push(issue('UIFN_PARTICIPANT_REGISTRY_INVALID', { participant: participant?.id, reason: 'duplicate-or-missing-id' }));
      continue;
    }
    let computedKeyId;
    try {
      computedKeyId = phase19PublicKeyId(participant.publicKeyPem);
    } catch {
      computedKeyId = null;
    }
    const qualificationValid = Array.isArray(participant.qualifications)
      && participant.qualifications.length > 0
      && participant.qualifications.every((qualification) => (
        qualification.issuer
        && qualification.subject === participant.displayName
        && qualification.evidence
        && Date.parse(qualification.validUntil ?? '') > new Date(now).getTime()
      ));
    const identityValid = participant.identityEvidence?.type
      && participant.identityEvidence?.reference
      && participant.identityEvidence?.verifiedBy === registry?.issuedBy
      && Number.isFinite(Date.parse(participant.identityEvidence?.verifiedAt ?? ''))
      && Date.parse(participant.identityEvidence.verifiedAt) <= Date.parse(registry?.issuedAt ?? '');
    const rolesValid = Array.isArray(participant.roles)
      && participant.roles.length > 0
      && new Set(participant.roles).size === participant.roles.length
      && participant.roles.every((role) => ['manual-at-tester', 'independent-accessibility-reviewer'].includes(role));
    const profilesValid = Array.isArray(participant.qualifiedAtProfiles)
      && participant.qualifiedAtProfiles.every((profile) => Object.hasOwn(PHASE_19_AT_PROFILES, profile))
      && (!participant.roles.includes('manual-at-tester') || participant.qualifiedAtProfiles.length > 0);
    const implementationPrincipalsValid = Array.isArray(participant.implementationPrincipalIds)
      && participant.implementationPrincipalIds.every((id) => typeof id === 'string' && id.length > 0);
    if (participant.kind !== 'human'
      || participant.automation === true
      || !participant.displayName
      || participant.keyId !== computedKeyId
      || !rolesValid
      || !profilesValid
      || !identityValid
      || !implementationPrincipalsValid
      || keyIds.has(computedKeyId)
      || identityReferences.has(participant.identityEvidence?.reference)
      || !qualificationValid) {
      issues.push(issue('UIFN_PARTICIPANT_REGISTRY_INVALID', { participant: participant.id, reason: 'identity-role-key-or-qualification' }));
      continue;
    }
    keyIds.add(computedKeyId);
    identityReferences.add(participant.identityEvidence.reference);
    participants.set(participant.id, participant);
  }
  return { issues, participants };
}

function sessionMatches(session, requirement, profile) {
  const names = requirement.names ?? [requirement.name];
  return session?.platform === profile.platform
    && session?.physical === profile.physicalDevice
    && session?.emulated !== true
    && session?.browser?.channel === requirement.channel
    && names.includes(session?.browser?.name)
    && Boolean(session?.browser?.version)
    && session?.assistiveTechnology?.name === profile.assistiveTechnology
    && Boolean(session?.assistiveTechnology?.version)
    && Boolean(session?.assistiveTechnology?.settings)
    && Boolean(session?.osVersion)
    && Boolean(session?.deviceName)
    && Boolean(session?.deviceModel)
    && Boolean(session?.locale);
}

function validateSessions(document, matrixRow) {
  const issues = [];
  const sessions = document?.sessions ?? [];
  const profile = PHASE_19_AT_PROFILES[matrixRow.atProfileId];
  const ids = new Set();
  for (const session of sessions) {
    if (!session?.id || ids.has(session.id)) issues.push(issue('UIFN_MANUAL_MATRIX_MISSING', { rowId: matrixRow.rowId, reason: 'duplicate-or-missing-session' }));
    ids.add(session?.id);
  }
  for (const requirement of profile.requiredBrowsers) {
    if (!sessions.some((session) => sessionMatches(session, requirement, profile))) {
      issues.push(issue('UIFN_MANUAL_MATRIX_MISSING', {
        rowId: matrixRow.rowId,
        reason: 'required-real-at-browser-session',
        requirement,
      }));
    }
  }
  return issues;
}

function executionKey(execution) {
  return `${execution.sessionId}:${execution.framework}:${execution.deliveryMode}`;
}

function validateExecutions(document, matrixRow) {
  const issues = [];
  const sessionIds = (document?.sessions ?? []).map((session) => session.id);
  const expectedKeys = sessionIds.flatMap((sessionId) => (
    PHASE_19_FRAMEWORKS.flatMap((framework) => (
      PHASE_19_DELIVERY_MODES.map((deliveryMode) => `${sessionId}:${framework}:${deliveryMode}`)
    ))
  ));
  const executions = document?.executions ?? [];
  const byKey = new Map();
  for (const execution of executions) {
    const key = executionKey(execution);
    if (byKey.has(key)) issues.push(issue('UIFN_MANUAL_MATRIX_MISSING', { rowId: matrixRow.rowId, reason: 'duplicate-execution', execution: key }));
    byKey.set(key, execution);
  }
  for (const key of expectedKeys) {
    const execution = byKey.get(key);
    if (!execution) {
      issues.push(issue('UIFN_MANUAL_MATRIX_MISSING', { rowId: matrixRow.rowId, reason: 'framework-delivery-execution', execution: key }));
      continue;
    }
    const steps = execution.steps ?? [];
    const exactSteps = matrixRow.script.steps;
    const exactOutcomes = matrixRow.script.expectedOutcomes;
    const executionStarted = Date.parse(execution.startedAt ?? '');
    const executionCompleted = Date.parse(execution.completedAt ?? '');
    const timingValid = Number.isFinite(executionStarted)
      && Number.isFinite(executionCompleted)
      && executionStarted <= executionCompleted
      && executionStarted >= Date.parse(document?.timing?.startedAt ?? '')
      && executionCompleted <= Date.parse(document?.timing?.completedAt ?? '');
    if (!timingValid || execution.result !== 'passed' || steps.length !== exactSteps.length) {
      issues.push(issue('UIFN_MANUAL_EVIDENCE_INCOMPLETE', { rowId: matrixRow.rowId, execution: key, reason: 'timing-result-or-step-count' }));
      continue;
    }
    for (let index = 0; index < exactSteps.length; index += 1) {
      const step = steps[index];
      if (step?.stepIndex !== index + 1
        || step?.instruction !== exactSteps[index]
        || step?.expected !== exactOutcomes[index]
        || typeof step?.observedSpeech !== 'string'
        || step.observedSpeech.trim().length < 2
        || typeof step?.observedNavigation !== 'string'
        || step.observedNavigation.trim().length < 2
        || !Array.isArray(step?.focusPath)
        || step.focusPath.length === 0
        || step?.result !== 'passed'
        || step?.humanObserved !== true
        || step?.automationInferred !== false) {
        issues.push(issue('UIFN_MANUAL_EVIDENCE_INCOMPLETE', { rowId: matrixRow.rowId, execution: key, step: index + 1 }));
      }
    }
    for (const [field, expected, identity] of [
      ['modeObservations', matrixRow.requiredModes, 'modeId'],
      ['stateObservations', matrixRow.requiredStates.map((state) => state.name), 'stateName'],
      ['eventObservations', matrixRow.requiredEvents.map((event) => event.type), 'eventType'],
    ]) {
      const observations = execution[field] ?? [];
      const actual = observations.map((observation) => observation?.[identity]);
      const exactCoverage = exactSet(actual, expected)
        && observations.every((observation) => (
          typeof observation?.observedSpeech === 'string'
          && observation.observedSpeech.trim().length >= 2
          && typeof observation?.observedNavigation === 'string'
          && observation.observedNavigation.trim().length >= 2
          && Array.isArray(observation?.focusPath)
          && observation.focusPath.length > 0
          && observation?.result === 'passed'
          && observation?.humanObserved === true
          && observation?.automationInferred === false
        ));
      if (!exactCoverage) {
        issues.push(issue('UIFN_MANUAL_EVIDENCE_INCOMPLETE', {
          rowId: matrixRow.rowId,
          execution: key,
          reason: `${field}-coverage`,
        }));
      }
    }
  }
  for (const key of byKey.keys()) if (!expectedKeys.includes(key)) {
    issues.push(issue('UIFN_MANUAL_EVIDENCE_INCOMPLETE', { rowId: matrixRow.rowId, reason: 'unexpected-execution', execution: key }));
  }
  return issues;
}

export function validatePhase19ManualEvidence(document, {
  matrixRow,
  participants,
  releaseCandidate,
  now = new Date(),
} = {}) {
  const issues = [];
  const participant = participants?.get(document?.tester?.participantId);
  if (document?.schemaVersion !== PHASE_19_SCHEMA_VERSION
    || document?.evidenceClass !== 'manualAssistiveTechnology'
    || document?.status !== 'passed'
    || document?.result !== 'passed'
    || document?.rowId !== matrixRow?.rowId
    || document?.evidenceId !== matrixRow?.evidenceId
    || document?.matrixRevision !== PHASE_19_MATRIX_REVISION
    || document?.scriptSha256 !== matrixRow?.scriptSha256) {
    issues.push(issue('UIFN_MANUAL_EVIDENCE_INCOMPLETE', { rowId: matrixRow?.rowId, reason: 'identity-status-or-script' }));
  }
  if (!participant
    || participant.kind !== 'human'
    || participant.automation === true
    || !participant.roles.includes('manual-at-tester')
    || !participant.qualifiedAtProfiles?.includes(matrixRow?.atProfileId)
    || document?.tester?.humanObserved !== true
    || document?.tester?.automationGenerated !== false) {
    issues.push(issue('UIFN_MANUAL_EVIDENCE_UNSIGNED', { rowId: matrixRow?.rowId, reason: 'untrusted-or-non-human-tester' }));
  } else {
    issues.push(...verifyPhase19Signature(document, {
      publicKey: participant.publicKeyPem,
      expectedSigner: participant.id,
      expectedSignedAt: document?.timing?.completedAt,
      failureCode: 'UIFN_MANUAL_EVIDENCE_UNSIGNED',
    }).map((entry) => ({ ...entry, rowId: matrixRow.rowId })));
  }
  if (!exactSource(document?.source, releaseCandidate)) {
    issues.push(issue('UIFN_MANUAL_EVIDENCE_STALE', { rowId: matrixRow?.rowId, reason: 'release-candidate-identity' }));
  }
  if (!validTiming(document?.timing, now)) {
    issues.push(issue('UIFN_MANUAL_EVIDENCE_STALE', { rowId: matrixRow?.rowId, reason: 'timing' }));
  }
  if (!Array.isArray(document?.defects) || !Array.isArray(document?.retests)) {
    issues.push(issue('UIFN_MANUAL_EVIDENCE_INCOMPLETE', { rowId: matrixRow?.rowId, reason: 'defects-or-retests' }));
  }
  issues.push(...validateSessions(document, matrixRow));
  issues.push(...validateExecutions(document, matrixRow));
  return issues;
}

export function phase19ManualEvidenceSetSha256(documents) {
  return phase19Sha256([...documents]
    .sort((left, right) => left.rowId.localeCompare(right.rowId))
    .map((document) => ({
      rowId: document.rowId,
      evidenceId: document.evidenceId,
      payloadSha256: document.signature?.payloadSha256,
      signatureSha256: phase19Sha256(document.signature ?? null),
    })));
}

export function phase19DefectSetSha256(defects) {
  return phase19Sha256([...defects].sort((left, right) => left.id.localeCompare(right.id)));
}

export function phase19BlockingDefectIssues(defects, policy, now = new Date(), {
  requiredEvidenceIds = [],
  referencedDefectIds = [],
} = {}) {
  const issues = [];
  const requiredEvidence = new Set(requiredEvidenceIds);
  const referencedDefects = new Set(referencedDefectIds);
  for (const defect of defects) {
    const evaluated = evaluateDefect(defect, policy, now);
    const blocking = evaluated.filter((entry) => [
      'UIFN_DEFECT_SEVERITY_INVALID',
      'UIFN_DEFECT_RELEASE_BLOCKING_OPEN',
      'UIFN_DEFECT_P2_EXCEPTION_INVALID_OR_MISSING',
      'UIFN_DEFECT_UNTRIAGED_OR_EXPIRED',
    ].includes(entry.code));
    const relevant = defect.accessibility === true
      || (defect.affectedRequirements ?? []).some((id) => id.startsWith('A11Y-'))
      || (defect.affectedEvidence ?? []).some((id) => requiredEvidence.has(id))
      || referencedDefects.has(defect.id);
    if (relevant && blocking.length) {
      issues.push(issue('UIFN_A11Y_BLOCKING_DEFECT', {
        defect: defect.id,
        severity: defect.severity,
        reasons: blocking.map((entry) => entry.code),
      }));
    }
  }
  return issues;
}

function validateManualDefectLinks(document, defectsById) {
  const issues = [];
  const defectIds = document?.defects ?? [];
  const retests = document?.retests ?? [];
  if (!Array.isArray(defectIds)
    || new Set(defectIds).size !== defectIds.length
    || defectIds.some((id) => typeof id !== 'string' || !id)) {
    return [issue('UIFN_MANUAL_EVIDENCE_INCOMPLETE', { rowId: document?.rowId, reason: 'defect-identifiers' })];
  }
  const retestByDefect = new Map();
  for (const retest of retests) {
    const defect = defectsById.get(retest?.defectId);
    const completedAt = Date.parse(retest?.completedAt ?? '');
    const defectCreatedAt = Date.parse(defect?.createdAt ?? '');
    if (!retest?.defectId || retestByDefect.has(retest.defectId)
      || retest?.result !== 'passed'
      || retest?.humanObserved !== true
      || retest?.automationInferred !== false
      || !Number.isFinite(completedAt)
      || !Number.isFinite(defectCreatedAt)
      || !defect
      || completedAt < defectCreatedAt
      || completedAt < Date.parse(document?.timing?.startedAt ?? '')
      || completedAt > Date.parse(document?.timing?.completedAt ?? '')) {
      issues.push(issue('UIFN_MANUAL_EVIDENCE_INCOMPLETE', { rowId: document?.rowId, reason: 'retest-invalid', defect: retest?.defectId }));
      continue;
    }
    retestByDefect.set(retest.defectId, retest);
  }
  for (const defectId of defectIds) {
    const defect = defectsById.get(defectId);
    if (!defect
      || (!(defect.affectedEvidence ?? []).includes(document.evidenceId)
        && !(defect.affectedRequirements ?? []).some((id) => id.startsWith('A11Y-')))) {
      issues.push(issue('UIFN_MANUAL_EVIDENCE_INCOMPLETE', { rowId: document?.rowId, reason: 'defect-reference-invalid', defect: defectId }));
      continue;
    }
    if (['verified', 'closed'].includes(defect.status) && !retestByDefect.has(defectId)) {
      issues.push(issue('UIFN_MANUAL_EVIDENCE_INCOMPLETE', { rowId: document?.rowId, reason: 'closed-defect-retest-missing', defect: defectId }));
    }
  }
  for (const defectId of retestByDefect.keys()) if (!defectIds.includes(defectId)) {
    issues.push(issue('UIFN_MANUAL_EVIDENCE_INCOMPLETE', { rowId: document?.rowId, reason: 'orphan-retest', defect: defectId }));
  }
  for (const defect of defectsById.values()) {
    if ((defect.affectedEvidence ?? []).includes(document?.evidenceId) && !defectIds.includes(defect.id)) {
      issues.push(issue('UIFN_MANUAL_EVIDENCE_INCOMPLETE', { rowId: document?.rowId, reason: 'affected-defect-omitted', defect: defect.id }));
    }
  }
  return issues;
}

export function validatePhase19ManualMatrix({
  matrix,
  documents,
  participants,
  releaseCandidate,
  defects = [],
  defectPolicy,
  now = new Date(),
}) {
  const issues = [];
  const rows = new Map((matrix?.rows ?? []).map((row) => [row.rowId, row]));
  const evidence = new Map();
  const defectsById = new Map();
  for (const defect of defects) {
    if (!defect?.id || defectsById.has(defect.id)) {
      issues.push(issue('UIFN_A11Y_BLOCKING_DEFECT', { defect: defect?.id, reason: 'duplicate-or-missing-defect-id' }));
    } else {
      defectsById.set(defect.id, defect);
    }
  }
  if (matrix?.revision !== PHASE_19_MATRIX_REVISION
    || matrix?.definitionSha256 !== releaseCandidate?.matrixDefinitionSha256
    || matrix?.rowCount !== matrix?.primitiveCount * Object.keys(PHASE_19_AT_PROFILES).length
    || rows.size !== matrix?.rowCount) {
    issues.push(issue('UIFN_MANUAL_MATRIX_MISSING', { reason: 'matrix-definition' }));
  }
  for (const document of documents ?? []) {
    if (!rows.has(document.rowId) || evidence.has(document.rowId)) {
      issues.push(issue('UIFN_MANUAL_MATRIX_MISSING', { rowId: document.rowId, reason: rows.has(document.rowId) ? 'duplicate-row' : 'unknown-row' }));
      continue;
    }
    evidence.set(document.rowId, document);
    issues.push(...validatePhase19ManualEvidence(document, {
      matrixRow: rows.get(document.rowId),
      participants,
      releaseCandidate,
      now,
    }));
    issues.push(...validateManualDefectLinks(document, defectsById));
  }
  for (const rowId of rows.keys()) if (!evidence.has(rowId)) {
    issues.push(issue('UIFN_MANUAL_MATRIX_MISSING', { rowId, reason: 'missing-signed-row' }));
  }
  issues.push(...phase19BlockingDefectIssues(defects, defectPolicy, now, {
    requiredEvidenceIds: [...evidence.values()].map((document) => document.evidenceId),
    referencedDefectIds: [...evidence.values()].flatMap((document) => document.defects ?? []),
  }));
  return issues;
}

export function validatePhase19IndependentReview(review, {
  matrix,
  manualDocuments,
  participants,
  releaseCandidate,
  defects = [],
  defectPolicy,
  implementationOwnerIds = [],
  now = new Date(),
} = {}) {
  const issues = [];
  const participant = participants?.get(review?.reviewer?.participantId);
  const testerIds = new Set((manualDocuments ?? []).map((document) => document.tester?.participantId));
  const manualMatrixIssues = validatePhase19ManualMatrix({
    matrix,
    documents: manualDocuments ?? [],
    participants,
    releaseCandidate,
    defects,
    defectPolicy,
    now,
  });
  if (manualMatrixIssues.length) {
    issues.push(issue('UIFN_REVIEW_INCOMPLETE', {
      reason: 'manual-matrix-not-green',
      issueCodes: [...new Set(manualMatrixIssues.map((entry) => entry.code))],
    }));
  }
  if (review?.schemaVersion !== PHASE_19_SCHEMA_VERSION
    || review?.evidenceClass !== 'independentAccessibilityReview'
    || review?.status !== 'passed'
    || review?.assessment?.qualification !== 'unqualified'
    || review?.assessment?.score !== 10
    || review?.assessment?.claim !== 'accessibility-confidence-10-of-10'
    || !exactSet(review?.scope, PHASE_19_REVIEW_SCOPE)) {
    issues.push(issue('UIFN_REVIEW_INCOMPLETE', { reason: 'identity-status-scope-or-assessment' }));
  }
  if (!participant
    || participant.kind !== 'human'
    || participant.automation === true
    || !participant.roles.includes('independent-accessibility-reviewer')
    || participant.independentOfImplementation !== true
    || participant.implementationPrincipalIds?.length !== 0
    || implementationOwnerIds.includes(participant.id)
    || participant.implementationPrincipalIds?.some((id) => implementationOwnerIds.includes(id))
    || testerIds.has(participant.id)
    || review?.independence?.implementedRelevantWave !== false
    || review?.independence?.reviewerIsImplementationOwner !== false
    || !Array.isArray(review?.independence?.conflicts)
    || review.independence.conflicts.length !== 0
    || typeof review?.independence?.statement !== 'string'
    || review.independence.statement.length < 20) {
    issues.push(issue('UIFN_REVIEW_NOT_INDEPENDENT'));
  } else {
    issues.push(...verifyPhase19Signature(review, {
      publicKey: participant.publicKeyPem,
      expectedSigner: participant.id,
      expectedSignedAt: review?.timing?.completedAt,
      failureCode: 'UIFN_REVIEW_NOT_INDEPENDENT',
    }));
  }
  if (!exactSource(review?.source, releaseCandidate) || !validTiming(review?.timing, now)) {
    issues.push(issue('UIFN_REVIEW_INCOMPLETE', { reason: 'release-candidate-or-timing' }));
  }
  if (review?.manualEvidenceSetSha256 !== phase19ManualEvidenceSetSha256(manualDocuments ?? [])
    || review?.defectSetSha256 !== phase19DefectSetSha256(defects)
    || review?.matrixDefinitionSha256 !== matrix?.definitionSha256) {
    issues.push(issue('UIFN_REVIEW_INCOMPLETE', { reason: 'reviewed-evidence-set-mismatch' }));
  }
  const familySet = new Set((matrix?.rows ?? []).map((row) => row.behaviorFamily));
  const familyRows = new Map((matrix?.rows ?? []).map((row) => [row.primitive, row.behaviorFamily]));
  const reviewedFamilies = new Set((review?.familySamples ?? [])
    .filter((sample) => (
      familyRows.get(sample.primitive) === sample.behaviorFamily
      && sample.codeReviewed === true
      && sample.evidenceReviewed === true
    ))
    .map((sample) => sample.behaviorFamily));
  if (familySet.size === 0
    || [...familySet].some((family) => !reviewedFamilies.has(family))
    || new Set((review?.familySamples ?? []).map((sample) => `${sample.behaviorFamily}:${sample.primitive}`)).size !== (review?.familySamples ?? []).length) {
    issues.push(issue('UIFN_REVIEW_INCOMPLETE', { reason: 'family-sample-coverage' }));
  }
  const dispositions = new Map((review?.defectDispositions ?? []).map((entry) => [entry.defectId, entry]));
  const defectDispositionValid = dispositions.size === defects.length
    && defects.every((defect) => {
      const disposition = dispositions.get(defect.id);
      return disposition?.severity === defect.severity
        && disposition?.status === defect.status
        && disposition?.reviewed === true
        && typeof disposition?.decision === 'string'
        && disposition.decision.length >= 10;
    });
  const defectsById = new Map(defects.map((defect) => [defect.id, defect]));
  const findings = Array.isArray(review?.findings) ? review.findings : [];
  const retests = Array.isArray(review?.retests) ? review.retests : [];
  const findingDefects = new Set(findings.map((finding) => finding.defectId));
  const retestedFindings = new Set(retests.map((retest) => retest.defectId));
  const reviewStartedAt = Date.parse(review?.timing?.startedAt ?? '');
  const reviewCompletedAt = Date.parse(review?.timing?.completedAt ?? '');
  const findingLinksValid = findingDefects.size === findings.length
    && findings.every((finding) => {
      const defect = defectsById.get(finding?.defectId);
      return defect
        && ['verified', 'closed'].includes(finding.status)
        && finding.status === defect.status;
    });
  const reviewRetestsValid = retestedFindings.size === retests.length
    && retests.every((retest) => {
      const defect = defectsById.get(retest?.defectId);
      const completedAt = Date.parse(retest?.completedAt ?? '');
      return findingDefects.has(retest?.defectId)
        && defect
        && retest.result === 'passed'
        && retest.humanObserved === true
        && retest.automationInferred === false
        && Number.isFinite(completedAt)
        && completedAt >= Date.parse(defect?.createdAt ?? '')
        && completedAt >= reviewStartedAt
        && completedAt <= reviewCompletedAt;
    })
    && [...findingDefects].every((defectId) => retestedFindings.has(defectId));
  if (!Array.isArray(review?.methods) || review.methods.length < 4
    || review.methods.some((method) => typeof method !== 'string' || method.length < 20)
    || !Array.isArray(review?.findings)
    || !Array.isArray(review?.retests)
    || !findingLinksValid
    || !reviewRetestsValid
    || !defectDispositionValid
    || !Array.isArray(review?.assessment?.confidenceGates)
    || review.assessment.confidenceGates.length !== 10
    || review.assessment.confidenceGates.some((gate, index) => (
      gate.id !== index + 1
      || gate.status !== 'passed'
      || !Array.isArray(gate.evidence)
      || gate.evidence.length === 0
    ))) {
    issues.push(issue('UIFN_REVIEW_INCOMPLETE', { reason: 'method-findings-retests-or-ten-gates' }));
  }
  if (review?.supportStatement?.jaws !== 'not-tested-user-deferred'
    || review?.supportStatement?.claimsUntestedSupport !== false
    || review?.supportStatement?.requiredAssistiveTechnologiesPassed !== true) {
    issues.push(issue('UIFN_REVIEW_INCOMPLETE', { reason: 'support-statement' }));
  }
  issues.push(...phase19BlockingDefectIssues(defects, defectPolicy, now, {
    requiredEvidenceIds: (manualDocuments ?? []).map((document) => document.evidenceId),
    referencedDefectIds: (manualDocuments ?? []).flatMap((document) => document.defects ?? []),
  }));
  return issues;
}
