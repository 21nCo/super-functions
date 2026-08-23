#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  compareSemanticTraces,
  runSemanticParity,
  validateSemanticTrace,
} from '../uifn/adapter-kit/dist/index.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const goldenPath = path.join(repoRoot, 'uifn/.conduct/generated/phase-14/phase-14-semantic-traces.json');
const vectorPath = path.join(repoRoot, 'uifn/.conduct/generated/phase-14/phase-14-public-vectors.json');
const frameworks = ['react', 'svelte', 'solid'];
const installModes = ['source', 'package'];
const expectedPrimitiveCount = JSON.parse(readFileSync(vectorPath, 'utf8')).vectors.length;
const expectedGoldenTraceCount = expectedPrimitiveCount * installModes.length;

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}

function clone(value) {
  return structuredClone(value);
}

function traceFile(traceRoot, mode, framework) {
  return path.join(traceRoot, `${mode}-${framework}.json`);
}

export function loadPhase14TraceCorpus(traceRoot) {
  const traces = [];
  const issues = [];
  for (const mode of installModes) {
    for (const framework of frameworks) {
      const file = traceFile(traceRoot, mode, framework);
      if (!existsSync(file)) {
        issues.push({ code: 'UIFN_PARITY_FRAMEWORK_MISSING', path: file, message: 'Trace corpus file is missing.', framework });
        continue;
      }
      const entries = JSON.parse(readFileSync(file, 'utf8'));
      if (!Array.isArray(entries) || entries.length !== expectedPrimitiveCount) {
        issues.push({
          code: 'UIFN_TRACE_SCHEMA_INCOMPLETE',
          path: file,
          message: `Expected ${expectedPrimitiveCount} traces, received ${entries.length}.`,
          framework,
        });
        continue;
      }
      for (const trace of entries) {
        issues.push(...validateSemanticTrace(trace).map((issue) => ({ ...issue, framework, primitive: trace.primitive, vectorId: trace.vectorId })));
        if (trace.framework !== framework || trace.installMode !== mode) {
          issues.push({
            code: 'UIFN_TRACE_SCHEMA_INVALID',
            path: file,
            message: `Trace metadata MUST identify ${framework}/${mode}.`,
            framework,
            primitive: trace.primitive,
            vectorId: trace.vectorId,
          });
        }
      }
      traces.push(...entries);
    }
  }
  return { traces, issues };
}

function consensusGoldens(traces) {
  const goldens = [];
  const issues = [];
  for (const mode of installModes) {
    for (const expected of traces.filter((trace) => trace.installMode === mode && trace.framework === 'react')) {
      goldens.push(expected);
      for (const framework of ['svelte', 'solid']) {
        const actual = traces.find((trace) => (
          trace.installMode === mode
          && trace.framework === framework
          && trace.primitive === expected.primitive
          && trace.vectorId === expected.vectorId
        ));
        if (!actual) {
          issues.push({ code: 'UIFN_PARITY_FRAMEWORK_MISSING', path: '/', message: `Missing ${framework}/${mode} consensus trace.`, framework, primitive: expected.primitive, vectorId: expected.vectorId });
          continue;
        }
        const comparison = compareSemanticTraces(expected, actual);
        issues.push(...comparison.issues.map((issue) => ({ ...issue, framework, primitive: actual.primitive, vectorId: actual.vectorId })));
      }
    }
  }
  return { goldens, issues };
}

function sourcePackageIssues(traces) {
  const issues = [];
  for (const framework of frameworks) {
    for (const source of traces.filter((trace) => trace.framework === framework && trace.installMode === 'source')) {
      const packed = traces.find((trace) => (
        trace.framework === framework
        && trace.installMode === 'package'
        && trace.primitive === source.primitive
        && trace.vectorId === source.vectorId
      ));
      if (!packed) continue;
      const comparablePackage = { ...packed, installMode: 'source' };
      const comparison = compareSemanticTraces(source, comparablePackage);
      issues.push(...comparison.issues.map((issue) => ({
        ...issue,
        framework,
        primitive: source.primitive,
        vectorId: source.vectorId,
      })));
    }
  }
  return issues;
}

function issueAt(result, framework, primitive, pathName) {
  return result.issues.some((issue) => (
    issue.code === 'UIFN_SEMANTIC_TRACE_DIVERGED'
    && issue.framework === framework
    && issue.primitive === primitive
    && issue.path === pathName
  ));
}

export function runPhase14ParityMutations(goldens, traces) {
  const mutations = [];

  const solid = clone(traces);
  const solidTrace = solid.find((trace) => trace.framework === 'solid' && trace.installMode === 'source' && trace.primitive === 'Autocomplete');
  const solidPart = solidTrace.parts[0].parts.find((part) => part.aria.activedescendant);
  solidPart.aria.activedescendant = solidTrace.parts[0].parts[0].id;
  const solidResult = runSemanticParity({ golden: goldens, traces: solid });
  const solidPath = `/parts/0/parts/${solidTrace.parts[0].parts.indexOf(solidPart)}/aria/activedescendant`;
  mutations.push({
    id: 'solid-aria-activedescendant',
    framework: 'solid',
    primitive: 'Autocomplete',
    expectedPath: solidPath,
    caught: !solidResult.ok && issueAt(solidResult, 'solid', 'Autocomplete', solidPath),
    issue: solidResult.issues.find((issue) => issue.framework === 'solid' && issue.primitive === 'Autocomplete'),
  });

  const svelte = clone(traces);
  const svelteTrace = svelte.find((trace) => trace.framework === 'svelte' && trace.installMode === 'source' && trace.primitive === 'Clipboard');
  [svelteTrace.callbacks[0], svelteTrace.callbacks[1]] = [svelteTrace.callbacks[1], svelteTrace.callbacks[0]];
  const svelteResult = runSemanticParity({ golden: goldens, traces: svelte });
  const sveltePath = '/callbacks/0/arguments/0';
  mutations.push({
    id: 'svelte-callback-order',
    framework: 'svelte',
    primitive: 'Clipboard',
    expectedPath: sveltePath,
    caught: !svelteResult.ok && issueAt(svelteResult, 'svelte', 'Clipboard', sveltePath),
    issue: svelteResult.issues.find((issue) => issue.framework === 'svelte' && issue.primitive === 'Clipboard'),
  });

  const react = clone(traces);
  const reactTrace = react.find((trace) => trace.framework === 'react' && trace.installMode === 'source' && trace.primitive === 'AlertDialog');
  reactTrace.focus[1].part = 'trigger';
  const reactResult = runSemanticParity({ golden: goldens, traces: react });
  const reactPath = '/focus/1/part';
  mutations.push({
    id: 'react-focus-result',
    framework: 'react',
    primitive: 'AlertDialog',
    expectedPath: reactPath,
    caught: !reactResult.ok && issueAt(reactResult, 'react', 'AlertDialog', reactPath),
    issue: reactResult.issues.find((issue) => issue.framework === 'react' && issue.primitive === 'AlertDialog'),
  });

  return mutations;
}

function acceptGolden(traceRoot, reviewer, reason) {
  if (!reviewer || reviewer.trim().length < 3) throw new Error('--reviewer is required to accept a golden.');
  if (!reason || reason.trim().length < 12) throw new Error('--reason is required to accept a golden.');
  const corpus = loadPhase14TraceCorpus(traceRoot);
  const consensus = consensusGoldens(corpus.traces);
  const crossInstallIssues = sourcePackageIssues(corpus.traces);
  const issues = [...corpus.issues, ...consensus.issues, ...crossInstallIssues];
  if (issues.length > 0 || consensus.goldens.length !== expectedGoldenTraceCount) {
    throw new Error(`Golden acceptance rejected: ${JSON.stringify(issues.slice(0, 10), null, 2)}`);
  }
  const vectors = JSON.parse(readFileSync(vectorPath, 'utf8'));
  const traces = consensus.goldens.map((trace) => stable(trace));
  const document = {
    schemaVersion: 1,
    phase: 'PHASE_14',
    requirement: 'PARITY-001',
    catalogSha256: vectors.catalogSha256,
    vectorManifestSha256: sha256(readFileSync(vectorPath)),
    reviewedBy: reviewer.trim(),
    reviewedAt: new Date().toISOString(),
    reason: reason.trim(),
    primitiveCount: expectedPrimitiveCount,
    installModes,
    frameworks,
    traceCount: traces.length,
    traceSha256: sha256(JSON.stringify(traces)),
    sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim(),
    sourceDirty: execFileSync('git', ['status', '--porcelain'], { cwd: repoRoot, encoding: 'utf8' }).trim().length > 0,
    traces,
  };
  mkdirSync(path.dirname(goldenPath), { recursive: true });
  writeFileSync(goldenPath, `${JSON.stringify(document, null, 2)}\n`);
  return document;
}

export function verifyPhase14Parity(traceRoot, goldenDocument = JSON.parse(readFileSync(goldenPath, 'utf8'))) {
  const vectors = JSON.parse(readFileSync(vectorPath, 'utf8'));
  const corpus = loadPhase14TraceCorpus(traceRoot);
  const metadataIssues = [];
  if (goldenDocument.catalogSha256 !== vectors.catalogSha256) metadataIssues.push({ code: 'UIFN_PARITY_GOLDEN_STALE', path: '/catalogSha256', message: 'Golden catalog hash is stale.' });
  if (
    goldenDocument.traceCount !== expectedGoldenTraceCount
    || goldenDocument.traces?.length !== expectedGoldenTraceCount
  ) {
    metadataIssues.push({
      code: 'UIFN_PARITY_GOLDEN_INCOMPLETE',
      path: '/traces',
      message: `Golden MUST contain ${expectedPrimitiveCount} source and ${expectedPrimitiveCount} package outcomes.`,
    });
  }
  if (!goldenDocument.reviewedBy || !goldenDocument.reviewedAt || !goldenDocument.reason) metadataIssues.push({ code: 'UIFN_PARITY_GOLDEN_UNREVIEWED', path: '/', message: 'Golden review metadata is incomplete.' });
  if (goldenDocument.traceSha256 !== sha256(JSON.stringify(goldenDocument.traces?.map((trace) => stable(trace)) ?? []))) metadataIssues.push({ code: 'UIFN_PARITY_GOLDEN_TAMPERED', path: '/traceSha256', message: 'Golden trace hash does not match its corpus.' });
  const parity = metadataIssues.length === 0 && corpus.issues.length === 0
    ? runSemanticParity({ golden: goldenDocument.traces, traces: corpus.traces })
    : { ok: false, compared: 0, frameworksPassed: [], issues: [] };
  const crossInstall = sourcePackageIssues(corpus.traces);
  const mutations = metadataIssues.length === 0 && corpus.issues.length === 0
    ? runPhase14ParityMutations(goldenDocument.traces, corpus.traces)
    : [];
  const issues = [
    ...metadataIssues,
    ...corpus.issues,
    ...parity.issues,
    ...crossInstall,
    ...mutations.filter((mutation) => !mutation.caught).map((mutation) => ({
      code: 'UIFN_PARITY_MUTATION_SURVIVED',
      path: mutation.expectedPath,
      message: `${mutation.id} did not fail at its precise semantic path.`,
      framework: mutation.framework,
      primitive: mutation.primitive,
    })),
  ];
  return {
    ok: issues.length === 0,
    command: 'verify:uifn-phase-14-parity',
    requirements: ['PARITY-001'],
    vectors: ['TV-PARITY-001-P', 'TV-PARITY-001-N'],
    primitiveCount: expectedPrimitiveCount,
    frameworkCount: 3,
    installModes,
    traceCount: corpus.traces.length,
    compared: parity.compared,
    crossInstallCompared: expectedPrimitiveCount * frameworks.length,
    golden: {
      path: path.relative(repoRoot, goldenPath),
      reviewedBy: goldenDocument.reviewedBy,
      reviewedAt: goldenDocument.reviewedAt,
      reason: goldenDocument.reason,
      traceSha256: goldenDocument.traceSha256,
    },
    mutations,
    issues,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const traceRoot = path.resolve(argument('--trace-dir') ?? process.env.UIFN_PHASE14_TRACE_DIR ?? '');
  if (!traceRoot || traceRoot === repoRoot) throw new Error('--trace-dir is required.');
  if (process.argv.includes('--accept-golden')) {
    acceptGolden(traceRoot, argument('--reviewer'), argument('--reason'));
  }
  const result = verifyPhase14Parity(traceRoot);
  const output = argument('--output') ?? process.env.UIFN_PHASE14_PARITY_OUTPUT;
  if (output) {
    const absolute = path.resolve(output);
    mkdirSync(path.dirname(absolute), { recursive: true });
    writeFileSync(absolute, `${JSON.stringify(result, null, 2)}\n`);
  }
  console[result.ok ? 'log' : 'error'](JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}
