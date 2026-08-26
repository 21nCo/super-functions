#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { arch, platform, release } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function requiredArgument(name) {
  const value = argument(name);
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function sha256(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

export function extractPhase14FrameworkCell({ cellId, bundleRoot, traceRun, os = { name: platform(), version: release(), architecture: arch() } }) {
  const allowed = new Set([
    'react-18.3-client', 'react-19-client',
    'react-18.3-strictmode', 'react-19-strictmode',
    'react-18.3-ssr-hydration', 'react-19-ssr-hydration',
    'react-18.3-rsc-import', 'react-19-rsc-import',
    'svelte-5-csr', 'svelte-5-ssr-hydration',
    'solid-1-csr', 'solid-1-ssr-hydration',
  ]);
  if (!allowed.has(cellId)) throw new Error(`Frozen trace extractor cannot claim unexecuted cell ${cellId}.`);
  const expectedCount = traceRun?.counts?.primitives;
  const run = traceRun?.compatibility?.frameworkRuns?.find((candidate) => candidate.cellId === cellId);
  if (
    !Number.isInteger(expectedCount)
    || expectedCount <= 0
    || !run
    || run.publicTreeCount !== expectedCount
    || !run.version
    || !run.command
    || !/^[a-f0-9]{64}$/.test(run.traceSha256 ?? '')
  ) {
    throw new Error(`Frozen trace run is missing complete ${cellId} metadata.`);
  }
  const traceFile = path.join(bundleRoot, run.traceFile);
  if (!existsSync(traceFile) || sha256(traceFile) !== run.traceSha256) throw new Error(`Frozen trace bytes do not match ${cellId}.`);
  const traces = JSON.parse(readFileSync(traceFile, 'utf8'));
  if (
    !Array.isArray(traces)
    || traces.length !== expectedCount
    || traces.some((trace) => trace.framework !== run.framework || trace.installMode !== 'package' || trace.result !== 'passed')
  ) {
    throw new Error(`Frozen ${cellId} traces are incomplete or inconsistent.`);
  }
  return {
    cellId,
    status: 'passed',
    executedAt: traceRun.generatedAt ?? new Date().toISOString(),
    command: run.command,
    environment: {
      os,
      framework: { name: run.framework, version: run.version, mode: run.mode },
    },
    observed: {
      passed: true,
      failures: 0,
      publicTreeCount: traces.length,
      frameworkCount: 1,
      resultSha256: run.traceSha256,
    },
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const cellId = requiredArgument('--cell');
  const bundleRoot = path.resolve(requiredArgument('--bundle'));
  const traceRun = JSON.parse(readFileSync(path.join(bundleRoot, 'trace-run.json'), 'utf8'));
  const result = extractPhase14FrameworkCell({ cellId, bundleRoot, traceRun });
  const output = path.resolve(requiredArgument('--output'));
  mkdirSync(path.dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result, null, 2));
}
