import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { verifyPhase14WorkflowContract } from './verify-uifn-phase-14-workflow.mjs';

const workflow = readFileSync(new URL('../.github/workflows/uifn-phase-14-compat.yml', import.meta.url), 'utf8');
const trustPolicy = JSON.parse(readFileSync(new URL('../uifn/.conduct/compatibility/phase-14-trust-policy.json', import.meta.url), 'utf8'));

test('accepts the fail-closed attested exact 35-cell workflow', () => {
  const result = verifyPhase14WorkflowContract({ workflow, trustPolicy });
  assert.equal(result.ok, true, JSON.stringify(result.issues));
  assert.equal(result.nodeCellCount, 3);
  assert.equal(result.frameworkCellCount, 12);
  assert.equal(result.browserCellCount, 8);
  assert.equal(result.deviceCellCount, 3);
  assert.equal(result.renderingCellCount, 9);
  assert.equal(result.signedCellCount, 35);
});

test('rejects a fail-open lane and cross-workflow trust', () => {
  const result = verifyPhase14WorkflowContract({
    workflow: workflow.replace('workflow_dispatch:', 'push:').replace('node-24', 'node-22').replace('react-19-client', 'react-18.3-client').replace('chrome-previous', 'chrome-latest').replace(/actions\/checkout@[a-f0-9]{40}/, 'actions/checkout@v4').concat('\ncontinue-on-error: true\n'),
    trustPolicy: { github: { repository: 'attacker/repository', signerWorkflows: ['other.yml'] } },
  });
  assert.equal(result.ok, false);
  assert(result.issues.some((issue) => issue.code === 'UIFN_COMPAT_WORKFLOW_FAIL_OPEN'));
  assert(result.issues.some((issue) => issue.code === 'UIFN_COMPAT_WORKFLOW_TRIGGER_UNBOUNDED'));
  assert(result.issues.some((issue) => issue.code === 'UIFN_COMPAT_NODE_MATRIX_MISSING'));
  assert(result.issues.some((issue) => issue.code === 'UIFN_COMPAT_FRAMEWORK_MATRIX_MISSING'));
  assert(result.issues.some((issue) => issue.code === 'UIFN_COMPAT_EXTERNAL_MATRIX_MISSING'));
  assert(result.issues.some((issue) => issue.code === 'UIFN_COMPAT_TRUST_POLICY_MISMATCH'));
  assert(result.issues.some((issue) => issue.code === 'UIFN_COMPAT_ACTION_UNPINNED'));
});

test('rejects a cell attestation or upload that drops the raw result subject', () => {
  const withoutAttestedRawResult = workflow.replace('            ${{ runner.temp }}/${{ matrix.cell }}.result.json\n', '');
  const attestationResult = verifyPhase14WorkflowContract({ workflow: withoutAttestedRawResult, trustPolicy });
  assert(attestationResult.issues.some((issue) => issue.code === 'UIFN_COMPAT_RAW_RESULT_ATTESTATION_MISSING'));

  const uploadOccurrence = workflow.indexOf('            ${{ runner.temp }}/${{ matrix.cell }}.result.json\n', workflow.indexOf('            ${{ runner.temp }}/${{ matrix.cell }}.result.json\n') + 1);
  const withoutUploadedRawResult = `${workflow.slice(0, uploadOccurrence)}${workflow.slice(uploadOccurrence + '            ${{ runner.temp }}/${{ matrix.cell }}.result.json\n'.length)}`;
  const uploadResult = verifyPhase14WorkflowContract({ workflow: withoutUploadedRawResult, trustPolicy });
  assert(uploadResult.issues.some((issue) => issue.code === 'UIFN_COMPAT_EVIDENCE_UPLOAD_INCOMPLETE'));
});

test('rejects malformed YAML before token-level contract checks', () => {
  const result = verifyPhase14WorkflowContract({ workflow: `${workflow}\njobs: duplicate\n`, trustPolicy });
  assert.equal(result.ok, false);
  assert(result.issues.some((issue) => issue.code === 'UIFN_COMPAT_WORKFLOW_YAML_INVALID'));
});
