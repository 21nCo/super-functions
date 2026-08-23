#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDocument } from 'yaml';
import { requiredPhase14CompatibilityCells } from './verify-uifn-phase-14-compat.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workflowPath = path.join(repoRoot, '.github/workflows/uifn-phase-14-compat.yml');
const trustPolicyPath = path.join(repoRoot, 'uifn/.conduct/compatibility/phase-14-trust-policy.json');
const consumerJobs = ['node', 'framework-client', 'desktop-product', 'safari-product', 'rendering', 'physical-device'];

function setDifference(left, right) {
  return [...left].filter((value) => !right.has(value));
}

function cellSet(job, mode) {
  const matrix = job?.strategy?.matrix;
  if (mode === 'include') return new Set((matrix?.include ?? []).map((entry) => entry?.cell).filter(Boolean));
  return new Set(Array.isArray(matrix?.cell) ? matrix.cell : []);
}

function exactCells(issues, actual, expected, kind) {
  const missing = setDifference(expected, actual);
  const unexpected = setDifference(actual, expected);
  if (missing.length || unexpected.length) {
    issues.push({
      code: kind === 'node' ? 'UIFN_COMPAT_NODE_MATRIX_MISSING'
        : kind === 'framework' ? 'UIFN_COMPAT_FRAMEWORK_MATRIX_MISSING'
          : 'UIFN_COMPAT_EXTERNAL_MATRIX_MISSING',
      message: `${kind} matrix differs from the exact contract.`,
      missing,
      unexpected,
    });
  }
}

function actionStep(job, prefix) {
  return (job?.steps ?? []).find((step) => typeof step?.uses === 'string' && step.uses.startsWith(prefix));
}

function runText(job) {
  return (job?.steps ?? []).map((step) => typeof step?.run === 'string' ? step.run : '').join('\n');
}

export function verifyPhase14WorkflowContract({ workflow, trustPolicy }) {
  const issues = [];
  const parsed = parseDocument(workflow, { prettyErrors: true, strict: true, uniqueKeys: true });
  if (parsed.errors.length > 0) {
    return {
      ok: false,
      command: 'verify:uifn-phase-14-workflow',
      nodeCellCount: 0,
      frameworkCellCount: 0,
      browserCellCount: 0,
      deviceCellCount: 0,
      renderingCellCount: 0,
      signedCellCount: 0,
      issues: parsed.errors.map((error) => ({ code: 'UIFN_COMPAT_WORKFLOW_YAML_INVALID', message: error.message })),
    };
  }
  const document = parsed.toJS();
  const jobs = document?.jobs ?? {};
  const triggers = document?.on;
  if (!triggers || typeof triggers !== 'object' || !Object.hasOwn(triggers, 'workflow_dispatch') || Object.keys(triggers).length !== 1) {
    issues.push({ code: 'UIFN_COMPAT_WORKFLOW_TRIGGER_UNBOUNDED', message: 'Compatibility evidence MUST have workflow_dispatch as its only trigger.' });
  }
  const expectedJobs = new Set(['freeze', ...consumerJobs]);
  const actualJobs = new Set(Object.keys(jobs));
  if (setDifference(expectedJobs, actualJobs).length || setDifference(actualJobs, expectedJobs).length) {
    issues.push({ code: 'UIFN_COMPAT_WORKFLOW_JOBS_INVALID', message: 'Workflow jobs MUST be exactly freeze plus the six signed consumer job groups.', missing: setDifference(expectedJobs, actualJobs), unexpected: setDifference(actualJobs, expectedJobs) });
  }

  const required = requiredPhase14CompatibilityCells();
  const nodeExpected = new Set(required.filter((cell) => cell.kind === 'node').map((cell) => cell.id));
  const frameworkExpected = new Set(required.filter((cell) => cell.kind === 'framework').map((cell) => cell.id));
  const browserExpected = new Set(required.filter((cell) => cell.kind === 'browser').map((cell) => cell.id));
  const deviceExpected = new Set(required.filter((cell) => cell.kind === 'device').map((cell) => cell.id));
  const renderingExpected = new Set(required.filter((cell) => cell.kind === 'rendering').map((cell) => cell.id));
  const nodeCells = cellSet(jobs.node, 'include');
  const frameworkCells = cellSet(jobs['framework-client'], 'list');
  const desktopCells = cellSet(jobs['desktop-product'], 'include');
  const safariCells = cellSet(jobs['safari-product'], 'include');
  const browserCells = new Set([...desktopCells, ...safariCells]);
  const deviceCells = cellSet(jobs['physical-device'], 'include');
  const renderingCells = cellSet(jobs.rendering, 'list');
  exactCells(issues, nodeCells, nodeExpected, 'node');
  exactCells(issues, frameworkCells, frameworkExpected, 'framework');
  exactCells(issues, browserCells, browserExpected, 'browser');
  exactCells(issues, deviceCells, deviceExpected, 'device');
  exactCells(issues, renderingCells, renderingExpected, 'rendering');

  const freeze = jobs.freeze;
  if (!freeze || !actionStep(freeze, 'actions/attest@') || !runText(freeze).includes('run-uifn-phase-14-traces.mjs')) {
    issues.push({ code: 'UIFN_COMPAT_FREEZE_INVALID', message: 'Freeze job MUST build the frozen trace bundle and attest it.' });
  }
  for (const jobName of consumerJobs) {
    const job = jobs[jobName];
    const jobRuns = runText(job);
    if (!job || job.needs !== 'freeze') issues.push({ code: 'UIFN_COMPAT_WORKFLOW_JOB_UNBOUND', message: `${jobName} MUST depend directly on freeze.` });
    if (job?.permissions?.['id-token'] !== 'write' || job?.permissions?.attestations !== 'write' || job?.permissions?.['artifact-metadata'] !== 'write') {
      issues.push({ code: 'UIFN_COMPAT_ATTEST_PERMISSION_MISSING', message: `${jobName} lacks exact attestation permissions.` });
    }
    if (!jobRuns.includes('gh attestation verify')) issues.push({ code: 'UIFN_COMPAT_FROZEN_PROVENANCE_UNVERIFIED', message: `${jobName} MUST verify frozen subjects before execution.` });
    if (!jobRuns.includes('create-uifn-phase-14-compat-evidence.mjs')) issues.push({ code: 'UIFN_COMPAT_EVIDENCE_PRODUCER_MISSING', message: `${jobName} MUST create one-cell evidence.` });
    const expectedRunner = jobName === 'node' ? 'run-uifn-phase-14-node-cell.mjs'
      : jobName === 'framework-client' ? 'extract-uifn-phase-14-framework-cell.mjs'
        : 'run-uifn-phase-14-browser-cell.mjs';
    if (!jobRuns.includes(expectedRunner)) issues.push({ code: 'UIFN_COMPAT_CELL_RUNNER_MISSING', message: `${jobName} MUST execute ${expectedRunner}.` });

    const attestation = (job?.steps ?? []).find((step) => step?.id === 'attest-cell');
    const subjectPath = attestation?.with?.['subject-path'];
    if (!attestation || !String(attestation.uses ?? '').startsWith('actions/attest@') || !String(subjectPath ?? '').includes('${{ runner.temp }}/${{ matrix.cell }}.compat.json') || !String(subjectPath ?? '').includes('${{ runner.temp }}/${{ matrix.cell }}.result.json')) {
      issues.push({ code: 'UIFN_COMPAT_RAW_RESULT_ATTESTATION_MISSING', message: `${jobName} MUST attest its compatibility document and raw result in one action invocation.` });
    }
    const upload = actionStep(job, 'actions/upload-artifact@');
    const uploadPath = String(upload?.with?.path ?? '');
    for (const suffix of ['.compat.json', '.compat.sigstore.json', '.result.json']) {
      if (!uploadPath.includes(`\${{ runner.temp }}/\${{ matrix.cell }}${suffix}`)) issues.push({ code: 'UIFN_COMPAT_EVIDENCE_UPLOAD_INCOMPLETE', message: `${jobName} upload is missing ${suffix}.` });
    }
  }

  const exactRunnerLabels = {
    'desktop-product': ['chrome-latest', 'chrome-previous', 'firefox-latest', 'firefox-previous', 'edge-latest', 'edge-previous'],
    'safari-product': ['safari-current', 'safari-previous'],
    'physical-device': ['device-lab', 'ios-current', 'ios-previous', 'android-current'],
  };
  for (const [jobName, labels] of Object.entries(exactRunnerLabels)) {
    const serialized = JSON.stringify(jobs[jobName]?.strategy?.matrix ?? {});
    for (const label of labels) if (!serialized.includes(label)) issues.push({ code: 'UIFN_COMPAT_EXACT_RUNNER_LABEL_MISSING', message: `${jobName} is missing exact runner label ${label}.` });
  }
  const renderingRunner = JSON.stringify(jobs.rendering?.strategy?.matrix?.runner ?? []);
  if (!renderingRunner.includes('chrome-latest')) issues.push({ code: 'UIFN_COMPAT_EXACT_RUNNER_LABEL_MISSING', message: 'Rendering cells MUST use the exact chrome-latest runner.' });

  for (const [jobName, job] of Object.entries(jobs)) {
    for (const step of job?.steps ?? []) {
      const action = step?.uses;
      if (typeof action === 'string' && !action.startsWith('./') && !/@[a-f0-9]{40}$/.test(action)) {
        issues.push({ code: 'UIFN_COMPAT_ACTION_UNPINNED', message: `${jobName} action is not pinned to an immutable commit: ${action}` });
      }
      if (step?.['continue-on-error'] === true) issues.push({ code: 'UIFN_COMPAT_WORKFLOW_FAIL_OPEN', message: `${jobName} contains continue-on-error: true.` });
    }
  }
  if (/\bcontinue-on-error\s*:\s*true\b/.test(workflow) || /\|\|\s*true/.test(workflow)) issues.push({ code: 'UIFN_COMPAT_WORKFLOW_FAIL_OPEN', message: 'Compatibility evidence workflow MUST not suppress command or step failures.' });

  const trusted = trustPolicy?.github?.signerWorkflows ?? [];
  if (trustPolicy?.github?.repository !== '21nCo/super-functions' || !trusted.includes('21nCo/super-functions/.github/workflows/uifn-phase-14-compat.yml')) {
    issues.push({ code: 'UIFN_COMPAT_TRUST_POLICY_MISMATCH', message: 'Trust policy MUST pin the exact repository and compatibility workflow.' });
  }
  const signedCellCount = nodeCells.size + frameworkCells.size + browserCells.size + deviceCells.size + renderingCells.size;
  return {
    ok: issues.length === 0,
    command: 'verify:uifn-phase-14-workflow',
    nodeCellCount: nodeCells.size,
    frameworkCellCount: frameworkCells.size,
    browserCellCount: browserCells.size,
    deviceCellCount: deviceCells.size,
    renderingCellCount: renderingCells.size,
    signedCellCount,
    issues,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = verifyPhase14WorkflowContract({
    workflow: readFileSync(workflowPath, 'utf8'),
    trustPolicy: JSON.parse(readFileSync(trustPolicyPath, 'utf8')),
  });
  console[result.ok ? 'log' : 'error'](JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}
