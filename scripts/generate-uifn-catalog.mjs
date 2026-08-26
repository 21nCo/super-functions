#!/usr/bin/env node

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createGeneratedOutputs, verifyGeneratedDirectory, writeGeneratedOutputs } from '../uifn/catalog/src/compiler.mjs';

const args = process.argv.slice(2);
if (args.includes('--write') && args.includes('--check')) {
  console.error('Choose exactly one of --write or --check.');
  process.exit(2);
}
const mode = args.includes('--write') ? 'write' : args.includes('--check') ? 'check' : null;
const outputIndex = args.indexOf('--output-dir');
const outputDirectory = outputIndex >= 0
  ? path.resolve(args[outputIndex + 1] ?? '')
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../uifn/catalog/generated');

if (!mode || (outputIndex >= 0 && !args[outputIndex + 1])) {
  console.error('Usage: node scripts/generate-uifn-catalog.mjs (--write|--check) [--output-dir <directory>]');
  process.exit(2);
}

try {
  const { catalog, outputs, manifest } = createGeneratedOutputs();
  if (mode === 'write') await writeGeneratedOutputs(outputDirectory, outputs);
  else await verifyGeneratedDirectory(outputDirectory, outputs);
  console.log(JSON.stringify({
    ok: true,
    command: `generate:uifn-catalog:${mode}`,
    schemaVersion: catalog.schemaVersion,
    catalogVersion: catalog.catalogVersion,
    generatorVersion: catalog.generatorVersion,
    primitiveCount: catalog.primitiveCount,
    sourceSha256: catalog.sourceSha256,
    catalogSha256: catalog.catalogSha256,
    generatedOutputCount: Object.keys(outputs).length,
    manifestOutputCount: manifest.outputCount,
    deterministic: manifest.deterministic,
    implementationEvidence: manifest.implementationEvidence,
  }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ ok: false, command: `generate:uifn-catalog:${mode}`, code: error.code ?? 'UIFN_CATALOG_GENERATION_FAILED', message: error.message, details: error.details ?? {} }, null, 2));
  process.exit(1);
}
