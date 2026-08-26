#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DELIVERY_GENERATOR_VERSION,
  createStyledDelivery,
  materializeOutputs,
} from './uifn-delivery-generator.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mode = process.argv.includes('--write') ? 'write' : 'check';
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const stable = (value) => `${JSON.stringify(value, null, 2)}\n`;

function frameworkFiles(delivery, primitive, framework) {
  if (framework === 'react' || framework === 'solid') {
    const packagePath = `uifn/components-${framework}/src/generated/${primitive.id}.ts`;
    const destination = `components/uifn/${framework}/${primitive.id}.ts`;
    return [{
      destination,
      templatePath: `uifn/registry/generated/templates/${framework}/${primitive.id}.ts`,
      packageSourcePath: packagePath,
      contents: delivery.outputs[packagePath],
    }];
  }

  const prefix = `uifn/components-svelte/src/generated/${primitive.id}/`;
  return Object.entries(delivery.outputs)
    .filter(([relative]) => relative.startsWith(prefix))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([packageSourcePath, contents]) => {
      const basename = packageSourcePath.slice(prefix.length);
      return {
        destination: `components/uifn/svelte/${primitive.id}/${basename}`,
        templatePath: `uifn/registry/generated/templates/svelte/${primitive.id}/${basename}`,
        packageSourcePath,
        contents,
      };
    });
}

function dependencies(framework) {
  const adapterVersion = JSON.parse(readFileSync(path.join(root, `uifn/${framework}/package.json`), 'utf8')).version;
  const values = [
    { name: '@uifn/components', version: '0.0.1', relationship: 'runtime' },
    { name: '@uifn/recipes', version: '0.0.1', relationship: 'runtime' },
    { name: `@uifn/${framework}`, version: adapterVersion, relationship: 'runtime' },
  ];
  if (framework === 'react') values.push(
    { name: 'react', version: '>=18.2.0 <20', relationship: 'peer' },
    { name: 'react-dom', version: '>=18.2.0 <20', relationship: 'peer' },
  );
  if (framework === 'svelte') values.push({ name: 'svelte', version: '>=5.0.0 <6', relationship: 'peer' });
  if (framework === 'solid') values.push({ name: 'solid-js', version: '>=1.8.0 <2', relationship: 'peer' });
  return values;
}

const delivery = createStyledDelivery(root);
const definitionSource = readFileSync(path.join(root, 'uifn/catalog/generated/anatomy-types.json'), 'utf8');
const generatorSources = [
  readFileSync(path.join(root, 'scripts/uifn-delivery-generator.mjs'), 'utf8'),
  readFileSync(fileURLToPath(import.meta.url), 'utf8'),
].join('\n');
const definitionSha256 = sha256(definitionSource);
const generatorSha256 = sha256(generatorSources);
const frameworks = ['react', 'svelte', 'solid'];
const outputs = { ...delivery.outputs };

const artifacts = delivery.primitives.map((primitive) => {
  const frameworkEntries = {};
  for (const framework of frameworks) {
    const files = frameworkFiles(delivery, primitive, framework).map((file) => {
      const outputSha256 = sha256(file.contents);
      outputs[file.templatePath] = file.contents;
      return {
        destination: file.destination,
        templatePath: file.templatePath,
        packageSourcePath: file.packageSourcePath,
        sourceSha256: outputSha256,
        outputSha256,
        bytes: Buffer.byteLength(file.contents),
        contents: file.contents,
      };
    });
    const templateSha256 = sha256(files.map((file) => `${file.destination}\0${file.outputSha256}`).join('\n'));
    frameworkEntries[framework] = {
      supported: true,
      packageName: `@uifn/components-${framework}`,
      packageSubpath: primitive.id,
      packageImport: `@uifn/components-${framework}/${primitive.id}`,
      files,
      dependencies: dependencies(framework),
      templateSha256,
    };
  }

  return {
    schemaVersion: 2,
    version: '0.0.1',
    canonicalVersion: delivery.anatomy.catalogVersion ?? '1.0.0',
    generatorVersion: DELIVERY_GENERATOR_VERSION,
    name: primitive.name,
    slug: primitive.id,
    kind: 'component',
    status: 'ga-candidate',
    license: 'MIT',
    owners: ['uifn-maintainers'],
    sourcePolicy: 'clean-room',
    lockKey: `component:${primitive.id}`,
    artifactDependencies: [],
    definitionSha256,
    generatorSha256,
    frameworks: frameworkEntries,
    provenance: {
      source: 'uifn/catalog/generated/anatomy-types.json',
      sourcePolicy: 'clean-room',
      generatedBy: `uifn-delivery-generator@${DELIVERY_GENERATOR_VERSION}`,
      definitionSha256,
      generatorSha256,
    },
  };
});

const payloadBase = {
  schemaVersion: 2,
  registryVersion: '0.0.1',
  generatorVersion: DELIVERY_GENERATOR_VERSION,
  canonicalVersion: delivery.anatomy.catalogVersion ?? '1.0.0',
  frameworks,
  artifactCount: artifacts.length,
  definitionSha256,
  generatorSha256,
  sourcePolicy: 'clean-room',
  licensePolicy: ['MIT'],
  artifacts,
};
const catalogSha256 = sha256(stable(payloadBase));
const payload = { ...payloadBase, catalogSha256 };
const payloadJson = stable(payload);
outputs['uifn/registry/generated/catalog.json'] = payloadJson;
outputs['uifn/registry/src/generated/catalog.ts'] = `/* Generated by uifn delivery generator ${DELIVERY_GENERATOR_VERSION}. Do not edit. */\nimport type { RegistryCatalogPayload } from '../schema';\nexport const REGISTRY_CATALOG_PAYLOAD: RegistryCatalogPayload = ${JSON.stringify(payload, null, 2)};\nexport const REGISTRY_CATALOG_PAYLOAD_JSON: string = ${JSON.stringify(payloadJson)};\n`;

const deliveryRecords = Object.entries(outputs)
  .filter(([relative]) => relative.startsWith('uifn/components') || relative.includes('/generated/templates/'))
  .sort(([left], [right]) => left.localeCompare(right))
  .map(([relative, contents]) => ({ path: relative, sha256: sha256(contents), bytes: Buffer.byteLength(contents) }));
outputs['uifn/registry/generated/delivery-manifest.json'] = stable({
  schemaVersion: 1,
  generatorVersion: DELIVERY_GENERATOR_VERSION,
  definitionSha256,
  generatorSha256,
  catalogSha256,
  componentCount: delivery.componentCount,
  partCount: delivery.partCount,
  outputCount: deliveryRecords.length,
  outputs: deliveryRecords,
});

const failures = materializeOutputs(root, outputs, {
  mode,
  errorCode: 'UIFN_GENERATED_SOURCE_DRIFT',
  managedRoots: [
    'uifn/components-react/src/generated',
    'uifn/components-solid/src/generated',
    'uifn/components-svelte/src/generated',
    'uifn/registry/generated/templates',
  ],
});

if (failures.length) {
  console.error(JSON.stringify({ ok: false, command: 'generate:uifn-phase-16:check', definitionSha256, generatorSha256, catalogSha256, failures }, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({ ok: true, command: mode === 'write' ? 'generate:uifn-phase-16' : 'generate:uifn-phase-16:check', componentCount: delivery.componentCount, partCount: delivery.partCount, templateCount: artifacts.reduce((count, artifact) => count + frameworks.reduce((total, framework) => total + artifact.frameworks[framework].files.length, 0), 0), definitionSha256, generatorSha256, catalogSha256 }, null, 2));
}
