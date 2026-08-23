#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  attachPhase14GitHubAttestation,
  phase14ArtifactSetHash,
  requiredPhase14CompatibilityCells,
} from './verify-uifn-phase-14-compat.mjs';

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function requiredArgument(name) {
  const value = argument(name);
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function readJson(file, label) {
  const absolute = path.resolve(file);
  if (!existsSync(absolute)) throw new Error(`${label} does not exist: ${absolute}`);
  return JSON.parse(readFileSync(absolute, 'utf8'));
}

function iso(value, label) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error(`${label} MUST be an ISO timestamp.`);
  return date;
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}

function sha256(value) {
  return createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}

export function createPhase14CompatibilityEvidence({
  cellId,
  traceRun,
  result,
  repository,
  runId,
  runAttempt,
  jobId,
  generatedAt = new Date(),
}) {
  const required = requiredPhase14CompatibilityCells().find((candidate) => candidate.id === cellId);
  if (!required) throw new Error(`Unknown Phase 14 compatibility cell: ${cellId}`);
  if (result.cellId !== cellId) throw new Error(`Result cell ${result.cellId ?? '<missing>'} does not match ${cellId}.`);
  if (traceRun?.source?.dirty !== false || !/^[a-f0-9]{40}$/.test(traceRun?.source?.commit ?? '') || !/^[a-f0-9]{64}$/.test(traceRun?.source?.snapshotSha256 ?? '')) {
    throw new Error('External compatibility evidence requires a clean frozen source commit and snapshot hash.');
  }
  if (!Array.isArray(traceRun.packages) || traceRun.packages.length !== 6 || phase14ArtifactSetHash(traceRun.packages) !== traceRun.artifactSetSha256) {
    throw new Error('Frozen trace run artifact inventory is missing or inconsistent.');
  }
  if (
    traceRun.consumerKit?.version !== 2
    || !Array.isArray(traceRun.consumerKit?.files)
    || !/^[a-f0-9]{64}$/.test(traceRun.consumerKit?.sha256 ?? '')
    || sha256([...traceRun.consumerKit.files].sort((left, right) => left.file < right.file ? -1 : left.file > right.file ? 1 : 0)) !== traceRun.consumerKit.sha256
  ) {
    throw new Error('Frozen browser consumer-kit inventory is missing or inconsistent.');
  }
  if (result.status !== 'passed' || !result.environment || !result.observed || !result.command) {
    throw new Error('Only a structured passing result with environment, observation, and command can produce evidence.');
  }
  if (['browser', 'device', 'rendering'].includes(required.kind) && (!result.raw || result.observed.resultSha256 !== sha256(result.raw))) {
    throw new Error('Browser, device, and rendering evidence requires an embedded raw observation whose canonical hash matches observed.resultSha256.');
  }
  if (!/^\d+$/.test(String(runId)) || !/^\d+$/.test(String(runAttempt))) throw new Error('GitHub run ID and attempt MUST be numeric.');
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) throw new Error('GitHub repository MUST use owner/name form.');
  if (!jobId) throw new Error('GitHub job ID is required.');

  const generated = iso(generatedAt, 'generatedAt');
  const executed = iso(result.executedAt ?? generated, 'executedAt');
  const expires = new Date(executed.getTime() + 14 * 24 * 60 * 60 * 1000);
  const provenanceUri = `https://github.com/${repository}/actions/runs/${runId}/attempts/${runAttempt}`;
  const artifactSetSha256 = traceRun.artifactSetSha256;
  const consumerKitSha256 = traceRun.consumerKit.sha256;
  const rawResultSubject = {
    filename: `${cellId}.result.json`,
    sha256: sha256(result),
  };
  const cell = {
    id: cellId,
    kind: required.kind,
    status: 'passed',
    executedAt: executed.toISOString(),
    expiresAt: expires.toISOString(),
    sourceCommit: traceRun.source.commit,
    sourceDirty: false,
    sourceSnapshotSha256: traceRun.source.snapshotSha256,
    artifactSetSha256,
    consumerKitSha256,
    environment: result.environment,
    command: result.command,
    observed: result.observed,
    rawResultSubject,
    job: {
      provider: 'github-actions',
      id: `${runId}:${runAttempt}:${jobId}`,
      url: provenanceUri,
      immutable: true,
    },
    ...(result.lab ? { lab: result.lab } : {}),
  };
  return attachPhase14GitHubAttestation({
    schemaVersion: 3,
    phase: 'PHASE_14',
    generatedAt: generated.toISOString(),
    sourceCommit: traceRun.source.commit,
    sourceDirty: false,
    sourceSnapshotSha256: traceRun.source.snapshotSha256,
    artifactSet: traceRun.packages,
    artifactSetSha256,
    consumerKitSha256,
    cells: [cell],
  }, {
    repository,
    signerWorkflow: `${repository}/.github/workflows/uifn-phase-14-compat.yml`,
    provenanceUri,
    bundle: `${cellId}.compat.sigstore.json`,
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const cellId = requiredArgument('--cell');
  const traceRun = readJson(requiredArgument('--trace-run'), 'Trace run');
  const result = readJson(requiredArgument('--result'), 'Cell result');
  const output = path.resolve(requiredArgument('--output'));
  const evidence = createPhase14CompatibilityEvidence({
    cellId,
    traceRun,
    result,
    repository: process.env.GITHUB_REPOSITORY ?? requiredArgument('--repository'),
    runId: process.env.GITHUB_RUN_ID ?? requiredArgument('--run-id'),
    runAttempt: process.env.GITHUB_RUN_ATTEMPT ?? argument('--run-attempt') ?? '1',
    jobId: process.env.GITHUB_JOB ?? requiredArgument('--job-id'),
  });
  mkdirSync(path.dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(JSON.stringify({ ok: true, cell: cellId, output, bundle: evidence.signature.bundle }, null, 2));
}
