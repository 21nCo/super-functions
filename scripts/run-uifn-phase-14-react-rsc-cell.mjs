#!/usr/bin/env node

import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function requiredArgument(name) {
  const value = argument(name);
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

export async function runPhase14ReactRscCell({ cellId, consumerRoot, vectors }) {
  if (!['react-18.3-rsc-import', 'react-19-rsc-import'].includes(cellId)) {
    throw new Error(`Unsupported React RSC cell ${cellId}.`);
  }
  if (
    !Array.isArray(vectors)
    || vectors.length === 0
    || new Set(vectors.map((vector) => vector.primitiveId)).size !== vectors.length
  ) {
    throw new Error('React RSC cell requires the complete unique public-vector manifest.');
  }
  const requireFromConsumer = createRequire(path.join(consumerRoot, 'package.json'));
  const reactVersion = requireFromConsumer('react/package.json').version;
  const expectedMajor = cellId === 'react-18.3-rsc-import' ? '18.' : '19.';
  if (!reactVersion.startsWith(expectedMajor)) {
    throw new Error(`${cellId} resolved React ${reactVersion}; expected ${expectedMajor}x.`);
  }
  const entries = [
    { primitive: null, specifier: '@uifn/react' },
    ...vectors.map((vector) => ({ primitive: vector.primitive, specifier: `@uifn/react/${vector.primitiveId}` })),
  ];
  const resolved = entries.map((entry) => ({ ...entry, file: requireFromConsumer.resolve(entry.specifier) }));
  for (const entry of resolved) {
    const source = readFileSync(entry.file, 'utf8');
    if (!/^(?:'use client'|"use client");/.test(source)) {
      throw new Error(`${entry.specifier} is not an explicit React client boundary.`);
    }
  }
  delete globalThis.document;
  delete globalThis.window;
  for (const entry of resolved) {
    const imported = await import(`${pathToFileURL(entry.file).href}?uifn-phase14=${encodeURIComponent(cellId)}-${encodeURIComponent(entry.specifier)}`);
    if (Object.keys(imported).length === 0) throw new Error(`${entry.specifier} imported with no public exports.`);
  }
  return vectors.map((vector) => ({
    primitive: vector.primitive,
    primitiveId: vector.primitiveId,
    framework: 'react',
    frameworkVersion: reactVersion,
    installMode: 'package',
    mode: 'rsc-import',
    clientBoundary: true,
    domGlobalsPresent: false,
    result: 'passed',
  }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const cellId = requiredArgument('--cell');
  const consumerRoot = path.resolve(requiredArgument('--consumer'));
  const vectors = JSON.parse(readFileSync(path.resolve(requiredArgument('--vectors')), 'utf8')).vectors;
  const traces = await runPhase14ReactRscCell({ cellId, consumerRoot, vectors });
  const output = path.resolve(requiredArgument('--output'));
  writeFileSync(output, `${JSON.stringify(traces, null, 2)}\n`);
  console.log(JSON.stringify({
    ok: true,
    cellId,
    framework: 'react',
    frameworkVersion: traces[0].frameworkVersion,
    mode: 'rsc-import',
    publicTreeCount: traces.length,
    clientBoundaryEntrypoints: traces.length + 1,
  }));
}
