#!/usr/bin/env node

import { createHash } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { phase14ArtifactSetHash } from './verify-uifn-phase-14-compat.mjs';
import { validateEvidence } from './verify-uifn-governance.mjs';
import {
  phase19Sha256,
  validatePhase19IndependentReview,
  validatePhase19ManualMatrix,
  validatePhase19ParticipantRegistry,
} from './uifn-phase-19-contract.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const node = process.env.UIFN_NODE_PATH ?? '/opt/homebrew/bin/node';
const startedAt = new Date();
const evidenceRoot = process.env.UIFN_PHASE19_EVIDENCE_DIR
  ? path.resolve(process.env.UIFN_PHASE19_EVIDENCE_DIR)
  : null;
const matrixPath = path.join(root, 'uifn/.conduct/accessibility/phase-19/matrix.json');
const defectPolicyPath = path.join(root, 'uifn/.conduct/contracts/defect-policy.json');
const ownershipPath = path.join(root, 'uifn/.conduct/contracts/ownership.json');
const defaultTrustPolicyPath = path.join(root, 'uifn/.conduct/contracts/phase-19-trust-policy.json');
const packageLockPath = path.join(root, 'package-lock.json');
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const fileHash = (absolute) => sha256(readFileSync(absolute));
const readJson = (absolute) => JSON.parse(readFileSync(absolute, 'utf8'));
const relative = (absolute) => path.relative(root, absolute).replaceAll(path.sep, '/');
const failures = [];
const checks = [];
const commandFailures = [];

function sanitize(value) {
  return String(value)
    .replaceAll(root, '[repo-root]')
    .replace(/\/private\/var\/folders\/[^/\s]+\/[^/\s]+\/T\/[^/\s]+/g, '[temporary-workspace]')
    .replace(/\/(?:Users|home|Volumes)\/[^/\s]+\/[^\s"']+/g, '[local-path]');
}

function run(command, args, env = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    env: { ...process.env, ...env, PATH: '/opt/homebrew/bin:/usr/bin:/bin' },
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
  const check = {
    command: [path.basename(command), ...args].join(' '),
    passed: result.status === 0,
    status: result.status,
    stdoutTail: sanitize((result.stdout ?? '').split('\n').slice(-30).join('\n')),
    stderrTail: sanitize((result.stderr ?? '').split('\n').slice(-30).join('\n')),
  };
  checks.push(check);
  return check;
}

function readOptionalJson(absolute, code) {
  if (!absolute || !existsSync(absolute)) {
    failures.push({ code, reason: 'missing' });
    return null;
  }
  try {
    return readJson(absolute);
  } catch (error) {
    failures.push({ code, reason: 'invalid-json', detail: error instanceof Error ? error.message : String(error) });
    return null;
  }
}

function jsonFiles(directory) {
  if (!directory || !existsSync(directory) || !statSync(directory).isDirectory()) return [];
  return readdirSync(directory)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => path.join(directory, name));
}

function under(parent, child) {
  if (!existsSync(parent) || !existsSync(child)) return false;
  const value = path.relative(realpathSync(parent), realpathSync(child));
  return value !== '' && !value.startsWith('..') && !path.isAbsolute(value);
}

function walkFiles(directory) {
  if (!directory || !existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      failures.push({ code: 'UIFN_PHASE19_EVIDENCE_SYMLINK_REJECTED', artifact: relative(absolute) });
      return [];
    }
    if (entry.isDirectory()) return walkFiles(absolute);
    return entry.isFile() ? [absolute] : [];
  });
}

function validateHashedArtifacts(entries, code) {
  const issues = [];
  for (const entry of entries ?? []) {
    const absolute = typeof entry?.path === 'string' ? path.join(root, entry.path) : null;
    if (!absolute
      || !existsSync(absolute)
      || lstatSync(absolute).isSymbolicLink()
      || !under(root, absolute)
      || !/^[a-f0-9]{64}$/.test(entry.sha256 ?? '')
      || fileHash(absolute) !== entry.sha256) {
      issues.push({
        code,
        artifact: entry?.path,
        reason: 'missing-symlinked-outside-or-hash-mismatch',
      });
    }
  }
  return issues;
}

function addCommandFailure(check) {
  if (!check.passed) {
    const entry = {
      code: 'UIFN_PHASE19_COMMAND_FAILED',
      command: check.command,
      status: check.status,
      stdoutTail: check.stdoutTail,
      stderrTail: check.stderrTail,
    };
    failures.push(entry);
    commandFailures.push(entry);
  }
}

if (!evidenceRoot) {
  failures.push({ code: 'UIFN_PHASE19_EVIDENCE_PATH_MISSING', environment: 'UIFN_PHASE19_EVIDENCE_DIR' });
} else {
  mkdirSync(evidenceRoot, { recursive: true });
}

addCommandFailure(run(node, ['scripts/generate-uifn-phase-19.mjs']));
addCommandFailure(run(node, [
  '--test',
  'scripts/verify-uifn-phase-19-contract.test.mjs',
  'scripts/sign-uifn-phase-19-evidence.test.mjs',
]));

const gitCommitCheck = run('git', ['rev-parse', 'HEAD']);
addCommandFailure(gitCommitCheck);
const gitCommit = gitCommitCheck.stdoutTail.trim().split('\n').at(-1);
const dirtyResult = spawnSync('git', ['status', '--porcelain', '--untracked-files=all'], {
  cwd: root,
  encoding: 'utf8',
  maxBuffer: 128 * 1024 * 1024,
});
const gitDirty = dirtyResult.stdout.trim().length > 0;
if (gitDirty) failures.push({ code: 'UIFN_PHASE19_RC_NOT_FROZEN', reason: 'worktree-dirty' });

const phase18Path = process.env.UIFN_PHASE19_PHASE18_EVIDENCE
  ? path.resolve(process.env.UIFN_PHASE19_PHASE18_EVIDENCE)
  : null;
const phase18 = readOptionalJson(phase18Path, 'UIFN_PHASE19_PHASE18_RC_INVALID');
if (phase18Path && existsSync(phase18Path) && (lstatSync(phase18Path).isSymbolicLink() || !under(root, phase18Path))) {
  failures.push({ code: 'UIFN_PHASE19_PHASE18_RC_INVALID', reason: 'Phase 18 evidence must be a repository-contained regular artifact.' });
}
const phase18SchemaFailures = phase18 ? validateEvidence(phase18, { now: startedAt }) : [];
if (phase18 && (
  phase18.status !== 'passed'
  || phase18.source?.dirty !== false
  || phase18.source?.commit !== gitCommit
  || !/^[a-f0-9]{64}$/.test(phase18.source?.definitionSha256 ?? '')
  || phase18.evidenceClass !== 'browser-compatibility'
  || !['A11Y-001', 'A11Y-002'].every((id) => phase18.requirementIds?.includes(id))
  || phase18SchemaFailures.length > 0
)) {
  failures.push({
    code: 'UIFN_PHASE19_PHASE18_RC_INVALID',
    reason: 'Phase 18 must pass on the exact clean current release-candidate commit.',
  });
}
if (phase18) failures.push(...validateHashedArtifacts(
  phase18.source?.artifactHashes,
  'UIFN_PHASE19_PHASE18_RC_INVALID',
));

const traceRunPath = process.env.UIFN_PHASE19_TRACE_RUN
  ? path.resolve(process.env.UIFN_PHASE19_TRACE_RUN)
  : null;
const traceRun = readOptionalJson(traceRunPath, 'UIFN_PHASE19_TRACE_RUN_INVALID');
if (traceRunPath && existsSync(traceRunPath) && (lstatSync(traceRunPath).isSymbolicLink() || !under(root, traceRunPath))) {
  failures.push({ code: 'UIFN_PHASE19_TRACE_RUN_INVALID', reason: 'Trace-run evidence must be a repository-contained regular artifact.' });
}
if (traceRun && (
  traceRun.ok !== true
  || traceRun.source?.dirty !== false
  || traceRun.source?.commit !== gitCommit
  || !Array.isArray(traceRun.packages)
  || traceRun.packages.length !== 6
  || traceRun.artifactSetSha256 !== phase14ArtifactSetHash(traceRun.packages)
  || !/^[a-f0-9]{64}$/.test(traceRun.consumerKit?.sha256 ?? '')
)) {
  failures.push({
    code: 'UIFN_PHASE19_TRACE_RUN_INVALID',
    reason: 'Trace run must bind six frozen packages and the consumer kit to the exact clean current commit.',
  });
}

let compatibility = null;
let compatibilityPath = evidenceRoot ? path.join(evidenceRoot, 'compatibility.json') : null;
let compatibilityEvidenceFiles = [];
const compatibilityDirectory = process.env.UIFN_PHASE19_COMPAT_EVIDENCE_DIR
  ? path.resolve(process.env.UIFN_PHASE19_COMPAT_EVIDENCE_DIR)
  : null;
if (!traceRunPath || !compatibilityDirectory || !existsSync(compatibilityDirectory)) {
  failures.push({
    code: 'UIFN_PHASE19_SIGNED_COMPATIBILITY_MISSING',
    reason: 'Exact per-cell Sigstore evidence directory and clean trace run are required.',
  });
} else if (!evidenceRoot || !under(evidenceRoot, compatibilityDirectory)) {
  failures.push({
    code: 'UIFN_PHASE19_SIGNED_COMPATIBILITY_INVALID',
    reason: 'The complete compatibility evidence directory must be immutable inside the Phase 19 evidence directory.',
  });
} else if (compatibilityPath) {
  const check = run(node, [
    'scripts/verify-uifn-phase-14-compat.mjs',
    '--trace-run', traceRunPath,
    '--evidence-dir', compatibilityDirectory,
    '--output', compatibilityPath,
  ]);
  if (!check.passed) {
    failures.push({
      code: 'UIFN_PHASE19_SIGNED_COMPATIBILITY_INVALID',
      reason: 'Phase 14 trusted compatibility verification did not pass.',
      stdoutTail: check.stdoutTail,
      stderrTail: check.stderrTail,
    });
  }
  if (existsSync(compatibilityPath)) compatibility = readJson(compatibilityPath);
  if (!compatibility
    || compatibility.ok !== true
    || compatibility.trustScheme !== 'github-sigstore-v1'
    || compatibility.expectedCommit !== gitCommit
    || compatibility.artifactSetSha256 !== traceRun?.artifactSetSha256
    || compatibility.requiredCellCount !== 35
    || compatibility.passedCellCount !== 35
    || compatibility.issues?.length) {
    failures.push({
      code: 'UIFN_PHASE19_SIGNED_COMPATIBILITY_INVALID',
      reason: 'Trusted compatibility aggregate is incomplete or bound to another release candidate.',
    });
  }
  compatibilityEvidenceFiles = walkFiles(compatibilityDirectory);
}

const matrix = readOptionalJson(matrixPath, 'UIFN_MANUAL_MATRIX_MISSING');
const defectPolicy = readOptionalJson(defectPolicyPath, 'UIFN_PHASE19_DEFECT_POLICY_INVALID');
const ownership = readOptionalJson(ownershipPath, 'UIFN_PHASE19_OWNERSHIP_INVALID');
const releaseCandidate = matrix && phase18 && traceRun ? {
  commit: gitCommit,
  dirty: false,
  definitionSha256: phase18.source?.definitionSha256,
  artifactSetSha256: traceRun.artifactSetSha256,
  phase18EvidenceSha256: fileHash(phase18Path),
  matrixDefinitionSha256: matrix.definitionSha256,
  artifacts: traceRun.packages,
} : {
  commit: gitCommit,
  dirty: false,
  definitionSha256: phase18?.source?.definitionSha256,
  artifactSetSha256: traceRun?.artifactSetSha256,
  phase18EvidenceSha256: phase18Path && existsSync(phase18Path) ? fileHash(phase18Path) : null,
  matrixDefinitionSha256: matrix?.definitionSha256,
  artifacts: traceRun?.packages ?? [],
};
if (phase18 && matrix && phase18.source?.definitionSha256 !== matrix.sourceDefinitionSha256) {
  failures.push({
    code: 'UIFN_PHASE19_PHASE18_RC_INVALID',
    reason: 'Phase 18 evidence and the generated Phase 19 matrix bind different accessibility definitions.',
  });
}

const trustRootPath = process.env.UIFN_PHASE19_TRUST_ROOT_PUBLIC_KEY
  ? path.resolve(process.env.UIFN_PHASE19_TRUST_ROOT_PUBLIC_KEY)
  : null;
const trustPolicyPath = process.env.UIFN_PHASE19_TRUST_POLICY
  ? path.resolve(process.env.UIFN_PHASE19_TRUST_POLICY)
  : defaultTrustPolicyPath;
const trustPolicy = readOptionalJson(trustPolicyPath, 'UIFN_PARTICIPANT_TRUST_ROOT_UNPROVISIONED');
let trustRootPublicKey = null;
if (trustPolicy?.schemaVersion !== 1
  || trustPolicy?.policyId !== 'uifn-phase-19-human-trust-policy'
  || trustPolicy?.status !== 'active'
  || trustPolicy?.authorityId !== 'uifn-accessibility-program-authority'
  || trustPolicy?.allowedSignatureScheme !== 'ed25519'
  || !/^[a-f0-9]{64}$/.test(trustPolicy?.rootPublicKeySha256 ?? '')) {
  failures.push({
    code: 'UIFN_PARTICIPANT_TRUST_ROOT_UNPROVISIONED',
    reason: 'The independently approved public trust-root hash is not active and pinned.',
  });
}
if (!trustRootPath || !existsSync(trustRootPath)) {
  failures.push({ code: 'UIFN_PARTICIPANT_TRUST_ROOT_MISSING' });
} else if (lstatSync(trustRootPath).isSymbolicLink() || !evidenceRoot || !under(evidenceRoot, trustRootPath)) {
  failures.push({
    code: 'UIFN_PARTICIPANT_TRUST_ROOT_MISSING',
    reason: 'The immutable public trust root must be stored inside the Phase 19 evidence directory.',
  });
} else if (trustPolicy?.rootPublicKeySha256 !== fileHash(trustRootPath)) {
  failures.push({
    code: 'UIFN_PARTICIPANT_TRUST_ROOT_UNPROVISIONED',
    reason: 'The supplied public trust root does not match the independently pinned policy hash.',
  });
} else {
  trustRootPublicKey = readFileSync(trustRootPath, 'utf8');
}

const participantsPath = process.env.UIFN_PHASE19_PARTICIPANTS
  ? path.resolve(process.env.UIFN_PHASE19_PARTICIPANTS)
  : evidenceRoot ? path.join(evidenceRoot, 'participants.json') : null;
const participantRegistry = readOptionalJson(participantsPath, 'UIFN_PARTICIPANT_REGISTRY_INVALID');
if (participantsPath && evidenceRoot && existsSync(participantsPath)
  && (lstatSync(participantsPath).isSymbolicLink() || !under(evidenceRoot, participantsPath))) {
  failures.push({
    code: 'UIFN_PARTICIPANT_REGISTRY_INVALID',
    reason: 'The signed participant registry must be immutable inside the Phase 19 evidence directory.',
  });
}
const participantValidation = validatePhase19ParticipantRegistry(participantRegistry, {
  trustRootPublicKey,
  now: startedAt,
});
failures.push(...participantValidation.issues);

const manualRoot = evidenceRoot ? path.join(evidenceRoot, 'manual') : null;
const manualPaths = jsonFiles(manualRoot);
const manualDocuments = [];
for (const absolute of manualPaths) {
  if (lstatSync(absolute).isSymbolicLink()) {
    failures.push({ code: 'UIFN_MANUAL_EVIDENCE_INCOMPLETE', artifact: relative(absolute), reason: 'symlink-rejected' });
    continue;
  }
  try {
    manualDocuments.push(readJson(absolute));
  } catch (error) {
    failures.push({
      code: 'UIFN_MANUAL_EVIDENCE_INCOMPLETE',
      artifact: relative(absolute),
      reason: error instanceof Error ? error.message : String(error),
    });
  }
}

const defectsRoot = evidenceRoot ? path.join(evidenceRoot, 'defects') : null;
const defectPaths = jsonFiles(defectsRoot);
const defects = [];
for (const absolute of defectPaths) {
  if (lstatSync(absolute).isSymbolicLink()) {
    failures.push({ code: 'UIFN_A11Y_BLOCKING_DEFECT', artifact: relative(absolute), reason: 'symlink-rejected' });
    continue;
  }
  try {
    defects.push(readJson(absolute));
  } catch (error) {
    failures.push({
      code: 'UIFN_A11Y_BLOCKING_DEFECT',
      artifact: relative(absolute),
      reason: error instanceof Error ? error.message : String(error),
    });
  }
}

if (matrix && defectPolicy) {
  failures.push(...validatePhase19ManualMatrix({
    matrix,
    documents: manualDocuments,
    participants: participantValidation.participants,
    releaseCandidate,
    defects,
    defectPolicy,
    now: startedAt,
  }));
}

const reviewPath = evidenceRoot ? path.join(evidenceRoot, 'independent-review.json') : null;
let review = null;
if (!reviewPath || !existsSync(reviewPath)) {
  failures.push({ code: 'UIFN_REVIEW_EVIDENCE_MISSING' });
} else {
  review = readOptionalJson(reviewPath, 'UIFN_REVIEW_EVIDENCE_MISSING');
  if (review && matrix && defectPolicy) {
    const implementationOwnerIds = (ownership?.principals ?? []).map((principal) => principal.id);
    failures.push(...validatePhase19IndependentReview(review, {
      matrix,
      manualDocuments,
      participants: participantValidation.participants,
      releaseCandidate,
      defects,
      defectPolicy,
      implementationOwnerIds,
      now: startedAt,
    }));
  }
}

const uniqueFailures = [...new Map(failures.map((entry) => [
  phase19Sha256(entry),
  entry,
])).values()];
const rowFailureIds = new Set(uniqueFailures.filter((entry) => entry.rowId).map((entry) => entry.rowId));
const validManualRows = Math.max(0, manualDocuments.length - rowFailureIds.size);
const reviewPassed = review && !uniqueFailures.some((entry) => (
  entry.code.startsWith('UIFN_REVIEW_')
  || entry.code === 'UIFN_A11Y_BLOCKING_DEFECT'
));
const completedAt = new Date();
const phaseStatus = commandFailures.length ? 'failed' : uniqueFailures.length ? 'blocked' : 'passed';

let phaseEvidence = null;
if (evidenceRoot) {
  const artifactCandidates = [...new Set([
    matrixPath,
    phase18Path,
    traceRunPath,
    compatibilityPath && existsSync(compatibilityPath) ? compatibilityPath : null,
    trustPolicyPath,
    trustRootPath && existsSync(trustRootPath) ? trustRootPath : null,
    participantsPath && existsSync(participantsPath) ? participantsPath : null,
    ...manualPaths,
    ...defectPaths,
    reviewPath && existsSync(reviewPath) ? reviewPath : null,
    ...compatibilityEvidenceFiles,
  ].filter(Boolean))];
  const artifactPaths = artifactCandidates.filter((absolute) => {
    const value = relative(absolute);
    return !value.startsWith('..') && !path.isAbsolute(value);
  });
  const total = 245;
  const passed = phaseStatus === 'passed' ? total : validManualRows + (reviewPassed ? 1 : 0);
  const blocked = phaseStatus === 'blocked' ? total - passed : 0;
  const failed = phaseStatus === 'failed' ? total - passed : 0;
  phaseEvidence = {
    schemaVersion: 1,
    evidenceId: `phase19-human-a11y-${completedAt.toISOString().replace(/[-:.]/g, '')}`,
    evidenceClass: 'manual-assistive-technology-and-independent-review',
    requirementIds: ['A11Y-003', 'A11Y-004'],
    vectorIds: ['TV-A11Y-003-P', 'TV-A11Y-003-N', 'TV-A11Y-004-P', 'TV-A11Y-004-N'],
    status: phaseStatus,
    source: {
      commit: gitCommit,
      dirty: gitDirty,
      lockfileSha256: fileHash(packageLockPath),
      definitionSha256: matrix?.definitionSha256 ?? '0'.repeat(64),
      artifactHashes: artifactPaths.map((absolute) => ({
        path: relative(absolute),
        sha256: fileHash(absolute),
      })),
    },
    environment: {
      os: process.platform,
      arch: process.arch,
      runtime: process.version,
      verifier: 'scripts/verify-uifn-phase-19.mjs',
      requiredAssistiveTechnologies: ['VoiceOver macOS', 'VoiceOver iOS', 'NVDA Windows', 'TalkBack Android'],
      jaws: 'not-tested-user-deferred',
    },
    timing: {
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      durationMs: completedAt.getTime() - startedAt.getTime(),
    },
    counts: {
      total,
      executed: manualDocuments.length + (review ? 1 : 0),
      passed,
      failed,
      blocked,
      skipped: 0,
      notApplicable: 0,
    },
    artifacts: artifactPaths.map(relative),
    defects: defects.map((defect) => defect.id),
    signatures: [{
      kind: 'automation-verifier',
      signer: 'scripts/verify-uifn-phase-19.mjs',
      signedAt: completedAt.toISOString(),
      attestation: 'This verifier signature reports evidence validation only. It is not a human assistive-technology signature or an independent accessibility-review signature.',
    }],
    expiresAt: new Date(completedAt.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString(),
    supersedes: null,
    trust: trustRootPath && existsSync(trustRootPath) ? {
      rootPublicKeySha256: fileHash(trustRootPath),
      participantRegistrySha256: participantsPath && existsSync(participantsPath) ? fileHash(participantsPath) : null,
      policySha256: fileHash(trustPolicyPath),
    } : null,
    releaseCandidate,
    compatibility: compatibility ? {
      trustScheme: compatibility.trustScheme,
      requiredCellCount: compatibility.requiredCellCount,
      passedCellCount: compatibility.passedCellCount,
      artifactSetSha256: compatibility.artifactSetSha256,
    } : null,
    matrix: {
      revision: matrix?.revision,
      definitionSha256: matrix?.definitionSha256,
      requiredRows: matrix?.rowCount ?? 0,
      suppliedRows: manualDocuments.length,
      validRows: validManualRows,
    },
    failures: uniqueFailures,
  };
  const schemaFailures = validateEvidence(phaseEvidence).filter((entry) => ![
    'UIFN_EVIDENCE_BLOCKED',
    'UIFN_EVIDENCE_FAILED',
    'UIFN_EVIDENCE_DIRTY',
  ].includes(entry.code));
  if (schemaFailures.length) {
    phaseEvidence.status = 'failed';
    phaseEvidence.failures.push(...schemaFailures);
    phaseEvidence.counts.failed = phaseEvidence.counts.total - phaseEvidence.counts.passed;
    phaseEvidence.counts.blocked = 0;
  }
  writeFileSync(path.join(evidenceRoot, 'phase-19.json'), `${JSON.stringify(phaseEvidence, null, 2)}\n`);
  writeFileSync(path.join(evidenceRoot, 'run.json'), `${JSON.stringify({
    schemaVersion: 1,
    phase: 'PHASE_19',
    status: phaseEvidence.status,
    gateSplit: {
      phase18AutomatedGate: 'required-on-clean-release-candidate',
      phase14SignedExternalCompatibility: 'required-before-manual-certification',
      humanAssistiveTechnology: 'must-be-trust-rooted-and-signed',
      independentReview: 'must-be-separate-and-signed',
      phase20AndRelease: phaseEvidence.status === 'passed' ? 'eligible' : 'blocked',
    },
    checks,
    failureCount: phaseEvidence.failures.length,
    failures: phaseEvidence.failures,
  }, null, 2)}\n`);
}

const finalStatus = phaseEvidence?.status ?? phaseStatus;
const summary = {
  ok: finalStatus === 'passed',
  phase: 'PHASE_19',
  status: finalStatus,
  requirements: {
    'A11Y-003': finalStatus === 'passed' ? 'passed' : finalStatus,
    'A11Y-004': finalStatus === 'passed' ? 'passed' : finalStatus,
  },
  gateSplit: {
    automatedPreparation: commandFailures.length ? 'failed' : 'passed',
    signedExternalCompatibility: compatibility?.ok === true ? 'passed' : 'blocked',
    signedHumanMatrix: (
      manualDocuments.length === matrix?.rowCount
      && validManualRows === matrix?.rowCount
    ) ? 'passed' : 'blocked',
    independentReview: reviewPassed ? 'passed' : 'blocked',
  },
  matrix: {
    requiredRows: matrix?.rowCount ?? 0,
    suppliedRows: manualDocuments.length,
    validRows: validManualRows,
  },
  failureCount: phaseEvidence?.failures?.length ?? uniqueFailures.length,
  failureCodes: [...new Set((phaseEvidence?.failures ?? uniqueFailures).map((entry) => entry.code))].sort(),
  evidence: evidenceRoot ? relative(path.join(evidenceRoot, 'phase-19.json')) : null,
};
console[summary.ok ? 'log' : 'error'](JSON.stringify(summary, null, 2));
if (!summary.ok) process.exitCode = 1;
