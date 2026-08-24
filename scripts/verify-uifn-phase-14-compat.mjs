#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultTrustPolicyPath = path.join(repoRoot, 'uifn/evidence/compatibility/phase-14-trust-policy.json');
const catalogPrimitiveCount = JSON.parse(
  readFileSync(path.join(repoRoot, 'uifn/catalog/generated/catalog.json'), 'utf8'),
).primitives.length;
const sha256Pattern = /^[a-f0-9]{64}$/;

const requiredCells = [
  ...[20, 22, 24].map((major) => ({ id: `node-${major}`, kind: 'node', major })),
  ...['client', 'strictmode', 'ssr-hydration', 'rsc-import'].flatMap((mode) => ([
    { id: `react-18.3-${mode}`, kind: 'framework', framework: 'react', major: 18, minor: 3, mode },
    { id: `react-19-${mode}`, kind: 'framework', framework: 'react', major: 19, mode },
  ])),
  { id: 'svelte-5-csr', kind: 'framework', framework: 'svelte', major: 5, mode: 'csr' },
  { id: 'svelte-5-ssr-hydration', kind: 'framework', framework: 'svelte', major: 5, mode: 'ssr-hydration' },
  { id: 'solid-1-csr', kind: 'framework', framework: 'solid', major: 1, mode: 'csr' },
  { id: 'solid-1-ssr-hydration', kind: 'framework', framework: 'solid', major: 1, mode: 'ssr-hydration' },
  { id: 'chrome-latest', kind: 'browser', browser: 'chrome', channel: 'latest' },
  { id: 'chrome-previous', kind: 'browser', browser: 'chrome', channel: 'previous' },
  { id: 'firefox-latest', kind: 'browser', browser: 'firefox', channel: 'latest' },
  { id: 'firefox-previous', kind: 'browser', browser: 'firefox', channel: 'previous' },
  { id: 'edge-latest', kind: 'browser', browser: 'edge', channel: 'latest' },
  { id: 'edge-previous', kind: 'browser', browser: 'edge', channel: 'previous' },
  { id: 'safari-current', kind: 'browser', browser: 'safari', channel: 'current' },
  { id: 'safari-previous', kind: 'browser', browser: 'safari', channel: 'previous' },
  { id: 'ios-safari-current', kind: 'device', browser: 'ios-safari', channel: 'current', physical: true },
  { id: 'ios-safari-previous', kind: 'device', browser: 'ios-safari', channel: 'previous', physical: true },
  { id: 'android-chrome-current', kind: 'device', browser: 'android-chrome', channel: 'current', physical: true },
  ...[
    'ltr', 'rtl', 'forced-colors', 'reduced-motion', 'zoom-200', 'zoom-400',
    'theme-light', 'theme-dark', 'high-contrast',
  ].map((profile) => ({ id: `render-${profile}`, kind: 'rendering', profile })),
];

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}

function sha256(value) {
  return createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(stable(value))).digest('hex');
}

function versionParts(version) {
  const match = /^(?:v)?(\d+)(?:\.(\d+))?(?:\.(\d+))?/.exec(String(version ?? ''));
  return match ? match.slice(1).map((entry) => Number(entry ?? 0)) : null;
}

function compareVersions(left, right) {
  const leftParts = versionParts(left);
  const rightParts = versionParts(right);
  if (!leftParts || !rightParts) return Number.NaN;
  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

function addIssue(issues, code, pathName, message, cell) {
  issues.push({ code, path: pathName, message, ...(cell ? { cell } : {}) });
}

export function phase14ArtifactSetHash(artifacts) {
  return sha256([...artifacts].sort((left, right) => left.package.localeCompare(right.package)).map(({ package: packageName, filename, sha256: hash }) => ({ package: packageName, filename, sha256: hash })));
}

export function requiredPhase14CompatibilityCells() {
  return structuredClone(requiredCells);
}

export function attachPhase14GitHubAttestation(document, {
  repository = '21nCo/super-functions',
  signerWorkflow = '21nCo/super-functions/.github/workflows/uifn-phase-14-compat.yml',
  provenanceUri = 'https://github.com/21nCo/super-functions/actions/runs/1/attempts/1',
  bundle = 'compatibility.sigstore.json',
} = {}) {
  return {
    ...document,
    signature: {
      scheme: 'github-sigstore-v1',
      repository,
      signerWorkflow,
      provenanceUri,
      bundle,
    },
  };
}

function defaultTrustPolicy() {
  return JSON.parse(readFileSync(defaultTrustPolicyPath, 'utf8'));
}

function validAttestationMetadata(document, trustPolicy, issues, documentPath) {
  const signature = document?.signature;
  const repository = trustPolicy?.github?.repository;
  const signerWorkflows = trustPolicy?.github?.signerWorkflows ?? [];
  const expectedRunPrefix = `https://github.com/${repository}/actions/runs/`;
  let valid = true;
  if (signature?.scheme !== 'github-sigstore-v1') valid = false;
  if (signature?.repository !== repository) valid = false;
  if (!signerWorkflows.includes(signature?.signerWorkflow)) valid = false;
  if (typeof signature?.provenanceUri !== 'string' || !signature.provenanceUri.startsWith(expectedRunPrefix) || !/\/actions\/runs\/\d+(?:\/attempts\/\d+)?$/.test(signature.provenanceUri)) valid = false;
  if (typeof signature?.bundle !== 'string' || path.basename(signature.bundle) !== signature.bundle || !signature.bundle.endsWith('.sigstore.json')) valid = false;
  if (!valid) addIssue(issues, 'UIFN_COMPAT_ATTESTATION_UNTRUSTED', `${documentPath}/signature`, 'Evidence MUST identify the trusted GitHub repository, compatibility workflow, immutable run, and Sigstore bundle.');
  return valid;
}

export function verifyPhase14RawResultSubject(document, evidencePath = document?.__phase14EvidencePath) {
  if (!evidencePath || !existsSync(evidencePath)) return { ok: false, message: 'Evidence file path is unavailable.' };
  if (!Array.isArray(document?.cells) || document.cells.length !== 1) return { ok: false, message: 'Raw-result verification requires exactly one compatibility cell.' };
  const cell = document.cells[0];
  const subject = cell.rawResultSubject;
  const expectedFilename = `${cell.id}.result.json`;
  if (subject?.filename !== expectedFilename || path.basename(subject.filename ?? '') !== subject?.filename || !sha256Pattern.test(subject?.sha256 ?? '')) {
    return { ok: false, message: `Compatibility cell ${cell.id ?? '<missing>'} has invalid raw-result subject metadata.` };
  }
  const rawResultPath = path.join(path.dirname(evidencePath), subject.filename);
  if (!existsSync(rawResultPath)) return { ok: false, message: `Raw result subject is missing: ${rawResultPath}` };
  let result;
  try {
    result = JSON.parse(readFileSync(rawResultPath, 'utf8'));
  } catch (error) {
    return { ok: false, message: `Raw result subject is not valid JSON: ${error instanceof Error ? error.message : String(error)}` };
  }
  if (sha256(result) !== subject.sha256) return { ok: false, message: `Raw result subject hash does not match ${subject.filename}.` };
  if (
    result.cellId !== cell.id
    || result.status !== cell.status
    || result.executedAt !== cell.executedAt
    || result.command !== cell.command
    || sha256(result.environment) !== sha256(cell.environment)
    || sha256(result.observed) !== sha256(cell.observed)
    || (cell.lab && sha256(result.lab) !== sha256(cell.lab))
  ) {
    return { ok: false, message: `Raw result subject does not reproduce the signed compatibility fields for ${cell.id}.` };
  }
  if (['browser', 'device', 'rendering'].includes(cell.kind) && (!result.raw || sha256(result.raw) !== result.observed?.resultSha256)) {
    return { ok: false, message: `Raw browser observation does not match observed.resultSha256 for ${cell.id}.` };
  }
  return { ok: true, rawResultPath, message: 'Raw result subject is structurally and cryptographically bound.' };
}

function verifyGitHubAttestation(document) {
  const evidencePath = document.__phase14EvidencePath;
  const rawResult = verifyPhase14RawResultSubject(document, evidencePath);
  if (!rawResult.ok) return rawResult;
  const bundlePath = path.join(path.dirname(evidencePath), document.signature.bundle);
  if (!existsSync(bundlePath)) return { ok: false, message: `Sigstore bundle is missing: ${bundlePath}` };
  for (const subjectPath of [evidencePath, rawResult.rawResultPath]) {
    const result = spawnSync('gh', [
      'attestation', 'verify', subjectPath,
      '--repo', document.signature.repository,
      '--bundle', bundlePath,
      '--signer-workflow', document.signature.signerWorkflow,
    ], { encoding: 'utf8' });
    if (result.status !== 0) {
      return { ok: false, message: (result.stderr || result.stdout || `gh attestation verify failed for ${path.basename(subjectPath)}.`).trim() };
    }
  }
  return { ok: true, message: 'GitHub Sigstore attestations verified for the compatibility document and raw result subject.' };
}

function completeObserved(cell, required, issues, pathName) {
  const observed = cell.observed;
  if (!observed || observed.passed !== true || observed.failures !== 0 || !sha256Pattern.test(observed.resultSha256 ?? '')) {
    addIssue(issues, 'UIFN_COMPAT_OBSERVATION_INCOMPLETE', `${pathName}/observed`, 'A passing structured observation, zero failures, and immutable raw-result hash are required.', cell.id);
    return;
  }
  if (required.kind === 'node' && observed.packageCount !== 3) {
    addIssue(issues, 'UIFN_COMPAT_OBSERVATION_INCOMPLETE', `${pathName}/observed/packageCount`, 'Node cells MUST import core, DOM, and adapter-kit from the frozen packages.', cell.id);
  }
  if (required.kind === 'framework' && observed.publicTreeCount !== catalogPrimitiveCount) {
    addIssue(
      issues,
      'UIFN_COMPAT_OBSERVATION_INCOMPLETE',
      `${pathName}/observed/publicTreeCount`,
      `Framework cells MUST execute all ${catalogPrimitiveCount} public compounds.`,
      cell.id,
    );
  }
  if (
    ['browser', 'device', 'rendering'].includes(required.kind)
    && (
      observed.publicTreeCount !== catalogPrimitiveCount * 3
      || observed.frameworkCount !== 3
    )
  ) {
    addIssue(
      issues,
      'UIFN_COMPAT_OBSERVATION_INCOMPLETE',
      `${pathName}/observed/publicTreeCount`,
      `Browser, device, and rendering cells MUST execute ${catalogPrimitiveCount} public compounds in all three frameworks.`,
      cell.id,
    );
  }
  if (cell.rawResultSubject?.filename !== `${cell.id}.result.json` || path.basename(cell.rawResultSubject?.filename ?? '') !== cell.rawResultSubject?.filename || !sha256Pattern.test(cell.rawResultSubject?.sha256 ?? '')) {
    addIssue(issues, 'UIFN_COMPAT_RAW_RESULT_SUBJECT_INVALID', `${pathName}/rawResultSubject`, 'Each cell MUST bind its exact raw .result.json filename and canonical SHA-256.', cell.id);
  }
}

function completeJob(cell, document, issues, pathName) {
  const job = cell.job ?? {};
  if (!job.provider || !job.id || !job.url || job.immutable !== true || !job.url.startsWith(document.signature.provenanceUri.split('/attempts/')[0])) {
    addIssue(issues, 'UIFN_COMPAT_JOB_UNTRUSTED', `${pathName}/job`, 'Exact immutable provider job metadata MUST belong to the attested workflow run.', cell.id);
  }
  if (['browser', 'device'].includes(cell.kind) || cell.environment?.browser) {
    const browser = cell.environment?.browser;
    if (browser?.execution === 'device-lab') {
      const lab = cell.lab ?? {};
      if (!lab.provider || !lab.sessionId || !/^https:\/\//.test(lab.sessionUrl ?? '') || !sha256Pattern.test(lab.capabilitiesSha256 ?? '') || !sha256Pattern.test(lab.resultSha256 ?? '')) {
        addIssue(issues, 'UIFN_COMPAT_LAB_EVIDENCE_INCOMPLETE', `${pathName}/lab`, 'Device-lab evidence requires provider, immutable session URL/ID, exact capability hash, and raw result hash.', cell.id);
      }
    }
  }
}

function completeEnvironment(cell, required, issues, pathName) {
  const environment = cell.environment ?? {};
  if (!environment.os?.name || !environment.os?.version || !environment.os?.architecture) {
    addIssue(issues, 'UIFN_COMPAT_ENVIRONMENT_INCOMPLETE', `${pathName}/environment/os`, 'Exact OS name, version, and architecture are required.', cell.id);
  }
  if (required.kind === 'node') {
    const parts = versionParts(environment.node?.version);
    if (!parts || parts[0] !== required.major) addIssue(issues, 'UIFN_COMPAT_VERSION_MISMATCH', `${pathName}/environment/node/version`, `Expected Node ${required.major}.x.`, cell.id);
  }
  if (required.kind === 'framework') {
    const framework = environment.framework;
    const parts = versionParts(framework?.version);
    if (framework?.name !== required.framework || !parts || parts[0] !== required.major || (required.minor !== undefined && parts[1] !== required.minor)) {
      addIssue(issues, 'UIFN_COMPAT_VERSION_MISMATCH', `${pathName}/environment/framework`, `Expected ${required.framework} ${required.major}${required.minor === undefined ? '' : `.${required.minor}`}.x.`, cell.id);
    }
    if (framework?.mode !== required.mode) addIssue(issues, 'UIFN_COMPAT_MODE_MISMATCH', `${pathName}/environment/framework/mode`, `Expected ${required.mode}.`, cell.id);
  }
  if (required.kind === 'browser' || required.kind === 'device') {
    const browser = environment.browser;
    const products = {
      chrome: ['chrome', 'Google Chrome', 'blink'],
      firefox: ['firefox', 'Mozilla Firefox', 'gecko'],
      edge: ['edge', 'Microsoft Edge', 'blink'],
      safari: ['safari', 'Safari', 'webkit'],
      'ios-safari': ['ios-safari', 'Mobile Safari', 'webkit'],
      'android-chrome': ['android-chrome', 'Google Chrome', 'blink'],
    };
    const expected = products[required.browser];
    if (browser?.name !== expected[0] || browser?.product !== expected[1] || browser?.engine !== expected[2] || browser?.channel !== required.channel || !versionParts(browser?.version)) {
      addIssue(issues, 'UIFN_COMPAT_BROWSER_MISMATCH', `${pathName}/environment/browser`, `Expected exact ${required.browser}/${required.channel} product evidence.`, cell.id);
    }
    if (['safari', 'ios-safari'].includes(required.browser) && (/^playwright/i.test(browser?.execution ?? '') || browser?.execution === 'emulation')) {
      addIssue(issues, 'UIFN_COMPAT_EMULATION_REJECTED', `${pathName}/environment/browser/execution`, 'Playwright WebKit or emulation is not Safari evidence.', cell.id);
    }
    if (required.browser === 'edge' && browser?.product !== 'Microsoft Edge') addIssue(issues, 'UIFN_COMPAT_EMULATION_REJECTED', `${pathName}/environment/browser/product`, 'Chromium is not Microsoft Edge evidence.', cell.id);
    if (required.physical && (environment.device?.physical !== true || !environment.device?.name || !environment.device?.model || !environment.device?.osVersion || browser?.execution !== 'device-lab')) addIssue(issues, 'UIFN_COMPAT_PHYSICAL_DEVICE_REQUIRED', `${pathName}/environment/device/physical`, 'An exact physical device name, model, OS version, and device-lab session are required.', cell.id);
    if (!Array.isArray(environment.frameworks) || !['react', 'svelte', 'solid'].every((framework) => environment.frameworks.includes(framework))) {
      addIssue(issues, 'UIFN_COMPAT_FRAMEWORK_COVERAGE_INCOMPLETE', `${pathName}/environment/frameworks`, 'Browser/device cells MUST run React, Svelte, and Solid.', cell.id);
    }
  }
  if (required.kind === 'rendering') {
    if (environment.rendering?.profile !== required.profile) addIssue(issues, 'UIFN_COMPAT_MODE_MISMATCH', `${pathName}/environment/rendering/profile`, `Expected ${required.profile}.`, cell.id);
    if (!environment.browser?.product || !environment.browser?.execution || !versionParts(environment.browser?.version) || !Array.isArray(environment.frameworks) || !['react', 'svelte', 'solid'].every((framework) => environment.frameworks.includes(framework))) {
      addIssue(issues, 'UIFN_COMPAT_FRAMEWORK_COVERAGE_INCOMPLETE', `${pathName}/environment`, 'Rendering cells require an exact browser version and all frameworks.', cell.id);
    }
    const evidence = environment.rendering?.evidence;
    if (!Array.isArray(evidence) || evidence.length !== 3 || evidence.some((entry) => entry?.profile !== required.profile || entry?.passed !== true)) {
      addIssue(issues, 'UIFN_COMPAT_RENDERING_PROFILE_UNOBSERVED', `${pathName}/environment/rendering/evidence`, 'Every framework MUST record an observable passing measurement for the exact rendering profile.', cell.id);
    }
  }
}

function validateVersionPairs(cells, issues) {
  for (const [browser, currentLabel] of [['chrome', 'latest'], ['firefox', 'latest'], ['edge', 'latest'], ['safari', 'current'], ['ios-safari', 'current']]) {
    const current = cells.get(`${browser}-${currentLabel}`)?.environment?.browser?.version;
    const previous = cells.get(`${browser}-previous`)?.environment?.browser?.version;
    if (!current || !previous) continue;
    const currentParts = versionParts(current);
    const previousParts = versionParts(previous);
    const consecutiveMajorRequired = ['chrome', 'firefox', 'edge'].includes(browser);
    if (compareVersions(current, previous) <= 0 || (consecutiveMajorRequired && currentParts[0] !== previousParts[0] + 1)) {
      addIssue(issues, 'UIFN_COMPAT_ROLLING_VERSIONS_INVALID', '/', `${browser} current/latest and previous MUST be distinct ordered${consecutiveMajorRequired ? ' consecutive major' : ''} versions.`);
    }
  }
}

function validatePeerRanges(cells, issues) {
  const react = JSON.parse(readFileSync(path.join(repoRoot, 'uifn/react/package.json'), 'utf8'));
  const svelte = JSON.parse(readFileSync(path.join(repoRoot, 'uifn/svelte/package.json'), 'utf8'));
  const solid = JSON.parse(readFileSync(path.join(repoRoot, 'uifn/solid/package.json'), 'utf8'));
  if (react.peerDependencies?.react !== '>=18.3.0 <20' || !cells.has('react-18.3-client') || !cells.has('react-19-client')) addIssue(issues, 'UIFN_PEER_RANGE_UNVERIFIED', '/peerDependencies/react', 'React peer range MUST be backed by passing 18.3 and 19 cells.');
  if (svelte.peerDependencies?.svelte !== '>=5.20.0 <6' || !cells.has('svelte-5-csr')) addIssue(issues, 'UIFN_PEER_RANGE_UNVERIFIED', '/peerDependencies/svelte', 'Svelte peer range MUST be backed by a passing Svelte 5 cell.');
  if (solid.peerDependencies?.['solid-js'] !== '>=1.9.0 <2' || !cells.has('solid-1-csr')) addIssue(issues, 'UIFN_PEER_RANGE_UNVERIFIED', '/peerDependencies/solid-js', 'Solid peer range MUST be backed by a passing Solid 1.x cell.');
}

export function verifyPhase14Compatibility({ documents, artifactSet, consumerKitSha256, expectedCommit, now = new Date(), trustPolicy = defaultTrustPolicy(), attestationVerifier = verifyGitHubAttestation }) {
  const issues = [];
  const expectedArtifactHash = phase14ArtifactSetHash(artifactSet);
  if (!sha256Pattern.test(consumerKitSha256 ?? '')) addIssue(issues, 'UIFN_COMPAT_CONSUMER_KIT_INVALID', '/consumerKitSha256', 'The exact frozen browser consumer-kit inventory hash is required.');
  const expectedPackages = new Set(['@uifn/core', '@uifn/dom', '@uifn/adapter-kit', '@uifn/react', '@uifn/svelte', '@uifn/solid']);
  if (artifactSet.length !== expectedPackages.size || artifactSet.some((entry) => !expectedPackages.has(entry.package) || !entry.filename || !sha256Pattern.test(entry.sha256))) {
    addIssue(issues, 'UIFN_COMPAT_ARTIFACT_SET_INVALID', '/artifactSet', 'Exact core, DOM, adapter-kit, React, Svelte, and Solid tarball names and hashes are required.');
  }
  const passedCells = new Map();
  const requiredById = new Map(requiredCells.map((cell) => [cell.id, cell]));
  for (const [documentIndex, document] of documents.entries()) {
    const documentPath = `/documents/${documentIndex}`;
    const documentIssuesStart = issues.length;
    if (document.schemaVersion !== 3 || document.phase !== 'PHASE_14') addIssue(issues, 'UIFN_COMPAT_SCHEMA_INVALID', documentPath, 'Compatibility evidence MUST use Phase 14 schema version 3.');
    const metadataValid = validAttestationMetadata(document, trustPolicy, issues, documentPath);
    if (metadataValid) {
      const verification = attestationVerifier(document);
      if (!verification?.ok) addIssue(issues, 'UIFN_COMPAT_ATTESTATION_INVALID', `${documentPath}/signature`, verification?.message ?? 'Cryptographic attestation verification failed.');
    }
    if (!Array.isArray(document.cells) || document.cells.length !== 1) addIssue(issues, 'UIFN_COMPAT_ATTESTATION_SCOPE_INVALID', `${documentPath}/cells`, 'Every attested compatibility document MUST contain exactly one matrix cell.');
    if (document.sourceCommit !== expectedCommit || !/^[a-f0-9]{40}$/.test(document.sourceCommit ?? '') || document.sourceDirty !== false || !sha256Pattern.test(document.sourceSnapshotSha256 ?? '')) addIssue(issues, 'UIFN_COMPAT_SOURCE_MISMATCH', `${documentPath}/sourceCommit`, 'Evidence MUST match the clean verified commit and record its source snapshot hash.');
    if (document.artifactSetSha256 !== expectedArtifactHash || phase14ArtifactSetHash(document.artifactSet ?? []) !== expectedArtifactHash) addIssue(issues, 'UIFN_COMPAT_ARTIFACT_HASH_MISMATCH', `${documentPath}/artifactSetSha256`, 'Evidence did not use the exact frozen tarballs.');
    if (document.consumerKitSha256 !== consumerKitSha256) addIssue(issues, 'UIFN_COMPAT_CONSUMER_KIT_MISMATCH', `${documentPath}/consumerKitSha256`, 'Evidence did not use the exact frozen browser consumer kit.');
    const generatedAt = new Date(document.generatedAt);
    if (!Number.isFinite(generatedAt.getTime()) || generatedAt > now || now.getTime() - generatedAt.getTime() > 14 * 24 * 60 * 60 * 1000) addIssue(issues, 'UIFN_COMPAT_EVIDENCE_STALE', `${documentPath}/generatedAt`, 'Attested evidence document MUST be current and no more than 14 days old.');

    for (const [cellIndex, cell] of (document.cells ?? []).entries()) {
      const pathName = `${documentPath}/cells/${cellIndex}`;
      const required = requiredById.get(cell.id);
      if (!required) {
        addIssue(issues, 'UIFN_COMPAT_MATRIX_UNKNOWN', `${pathName}/id`, 'Unknown compatibility cell.', cell.id);
        continue;
      }
      if (passedCells.has(cell.id)) {
        addIssue(issues, 'UIFN_COMPAT_MATRIX_DUPLICATE', `${pathName}/id`, 'Duplicate compatibility cell.', cell.id);
        continue;
      }
      if (cell.kind !== required.kind) addIssue(issues, 'UIFN_COMPAT_CELL_KIND_MISMATCH', `${pathName}/kind`, `Expected ${required.kind}.`, cell.id);
      if (cell.status !== 'passed' || cell.skipped === true || cell.unexpectedPass === true) addIssue(issues, 'UIFN_COMPAT_CELL_NOT_PASSING', `${pathName}/status`, 'Cell MUST pass without skip or unexpected-pass semantics.', cell.id);
      const executed = new Date(cell.executedAt);
      const expires = new Date(cell.expiresAt);
      const age = now.getTime() - executed.getTime();
      if (!Number.isFinite(executed.getTime()) || !Number.isFinite(expires.getTime()) || age < 0 || age > 14 * 24 * 60 * 60 * 1000 || expires <= now || expires.getTime() - executed.getTime() > 14 * 24 * 60 * 60 * 1000) addIssue(issues, 'UIFN_COMPAT_EVIDENCE_STALE', `${pathName}/executedAt`, 'Cell evidence MUST be current, unexpired, and valid for at most 14 days.', cell.id);
      if (cell.sourceCommit !== document.sourceCommit || cell.sourceDirty !== false || cell.sourceSnapshotSha256 !== document.sourceSnapshotSha256) addIssue(issues, 'UIFN_COMPAT_SOURCE_MISMATCH', pathName, 'Cell source identity differs from its clean attested document.', cell.id);
      if (cell.artifactSetSha256 !== expectedArtifactHash) addIssue(issues, 'UIFN_COMPAT_ARTIFACT_HASH_MISMATCH', `${pathName}/artifactSetSha256`, 'Cell tarball set differs from the frozen set.', cell.id);
      if (cell.consumerKitSha256 !== consumerKitSha256) addIssue(issues, 'UIFN_COMPAT_CONSUMER_KIT_MISMATCH', `${pathName}/consumerKitSha256`, 'Cell browser harness differs from the frozen consumer kit.', cell.id);
      if (typeof cell.command !== 'string' || cell.command.trim().length < 3) addIssue(issues, 'UIFN_COMPAT_OBSERVATION_INCOMPLETE', `${pathName}/command`, 'Exact executed command is required.', cell.id);
      completeEnvironment(cell, required, issues, pathName);
      completeObserved(cell, required, issues, pathName);
      completeJob(cell, document, issues, pathName);
      if (issues.length === documentIssuesStart) passedCells.set(cell.id, cell);
    }
  }
  for (const required of requiredCells) if (!passedCells.has(required.id)) addIssue(issues, 'UIFN_COMPAT_MATRIX_MISSING', '/cells', `Required compatibility cell ${required.id} is missing or invalid.`, required.id);
  validateVersionPairs(passedCells, issues);
  validatePeerRanges(passedCells, issues);
  return {
    ok: issues.length === 0,
    command: 'verify:uifn-phase-14-compat',
    requirement: 'COMPAT-001',
    vectors: ['TV-COMPAT-001-P', 'TV-COMPAT-001-N'],
    trustScheme: 'github-sigstore-v1',
    expectedCommit,
    artifactSetSha256: expectedArtifactHash,
    requiredCellCount: requiredCells.length,
    passedCellCount: passedCells.size,
    missingCells: requiredCells.filter((cell) => !passedCells.has(cell.id)).map((cell) => cell.id),
    issues,
  };
}

function loadDocuments(directory) {
  if (!directory || !existsSync(directory)) return [];
  return readdirSync(directory).filter((file) => file.endsWith('.compat.json')).sort().map((file) => {
    const evidencePath = path.join(directory, file);
    const document = JSON.parse(readFileSync(evidencePath, 'utf8'));
    Object.defineProperty(document, '__phase14EvidencePath', { value: evidencePath, enumerable: false });
    return document;
  });
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const traceRunPath = path.resolve(argument('--trace-run') ?? process.env.UIFN_PHASE14_TRACE_RUN ?? '');
  if (!traceRunPath || !existsSync(traceRunPath)) throw new Error('--trace-run is required and MUST identify the packed trace artifact inventory.');
  const traceRun = JSON.parse(readFileSync(traceRunPath, 'utf8'));
  const expectedCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim();
  const evidenceDirectory = argument('--evidence-dir') ?? process.env.UIFN_PHASE14_COMPAT_EVIDENCE_DIR;
  const documents = loadDocuments(evidenceDirectory ? path.resolve(evidenceDirectory) : '');
  const trustPolicyPath = path.resolve(argument('--trust-policy') ?? process.env.UIFN_PHASE14_TRUST_POLICY ?? defaultTrustPolicyPath);
  const trustPolicy = JSON.parse(readFileSync(trustPolicyPath, 'utf8'));
  const result = verifyPhase14Compatibility({
    documents,
    artifactSet: traceRun.packages,
    consumerKitSha256: traceRun.consumerKit?.sha256,
    expectedCommit,
    trustPolicy,
  });
  const output = argument('--output') ?? process.env.UIFN_PHASE14_COMPAT_OUTPUT;
  if (output) {
    const absolute = path.resolve(output);
    mkdirSync(path.dirname(absolute), { recursive: true });
    writeFileSync(absolute, `${JSON.stringify(result, null, 2)}\n`);
  }
  console[result.ok ? 'log' : 'error'](JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}
