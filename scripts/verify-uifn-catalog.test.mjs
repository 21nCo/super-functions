import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { CATALOG_SOURCE, EXPECTED_PRIMITIVE_NAMES } from '../uifn/catalog/src/catalog-source.mjs';
import { compareGeneratedOutputs, createGeneratedOutputs, validateCatalogSource, verifyGeneratedDirectory, writeGeneratedOutputs } from '../uifn/catalog/src/compiler.mjs';
import { migrateCatalogDocument } from '../uifn/catalog/src/migrations.mjs';

const repoRoot = path.resolve(import.meta.dirname, '..');
const fixtureRoot = path.join(repoRoot, 'uifn/catalog/fixtures/negative');
const generatedRoot = path.join(repoRoot, 'uifn/catalog/generated');

async function fixture(name) {
  return JSON.parse(await readFile(path.join(fixtureRoot, name), 'utf8'));
}

function expectCatalogCode(action, expected) {
  assert.throws(action, (error) => error.code === expected, `expected ${expected}`);
}

test('TV-CAT-001-P: canonical catalog is exact, complete, deterministic, and checked in cleanly', async () => {
  const first = createGeneratedOutputs();
  const second = createGeneratedOutputs();
  assert.equal(first.catalog.primitiveCount, 69);
  assert.deepEqual(first.catalog.primitives.map((primitive) => primitive.name), EXPECTED_PRIMITIVE_NAMES);
  assert.equal(new Set(first.catalog.primitives.map((primitive) => primitive.id)).size, 69);
  assert.ok(first.catalog.primitives.every((primitive) => primitive.requirementIds.length >= 2));
  assert.ok(first.catalog.primitives.every((primitive) => primitive.domServices.every(Boolean)));
  assert.ok(first.catalog.primitives.every((primitive) => Object.keys(primitive.frameworks).join(',') === 'react,svelte,solid'));
  assert.ok(first.catalog.primitives.every((primitive) => primitive.release.implementationStatus === 'implemented'));
  assert.ok(first.catalog.primitives.every((primitive) => !Object.hasOwn(primitive.accessibility.rules, 'review')));
  compareGeneratedOutputs(first.outputs, second.outputs);
  await verifyGeneratedDirectory(generatedRoot, first.outputs);
});

test('TV-CAT-001-N: missing required accessibility metadata fails closed', async () => {
  const descriptor = await fixture('missing-tooltip-accessibility.json');
  const source = structuredClone(CATALOG_SOURCE);
  const target = source.primitives.find((primitive) => primitive.name === descriptor.mutation.primitive);
  const [parent, field] = descriptor.mutation.deletePath;
  delete target[parent][field];
  expectCatalogCode(() => validateCatalogSource(source), descriptor.expectedErrorCodes[0]);
});

test('duplicate primitive identifiers fail closed', async () => {
  const descriptor = await fixture('duplicate-primitive-id.json');
  const source = structuredClone(CATALOG_SOURCE);
  source.primitives.find((primitive) => primitive.name === descriptor.mutation.primitive)[descriptor.mutation.setField] = descriptor.mutation.value;
  expectCatalogCode(() => validateCatalogSource(source), descriptor.expectedErrorCodes[0]);
});

test('unsupported catalog enum values fail closed', async () => {
  const descriptor = await fixture('unsupported-family.json');
  const source = structuredClone(CATALOG_SOURCE);
  source.primitives.find((primitive) => primitive.name === descriptor.mutation.primitive)[descriptor.mutation.setField] = descriptor.mutation.value;
  expectCatalogCode(() => validateCatalogSource(source), descriptor.expectedErrorCodes[0]);
});

test('undocumented generated exports receive a stable export-drift code', async () => {
  const descriptor = await fixture('undocumented-export.json');
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'uifn-catalog-export-test-'));
  try {
    const expected = createGeneratedOutputs().outputs;
    const actual = structuredClone(expected);
    const core = JSON.parse(actual[descriptor.mutation.generatedFile]);
    core.exports.push({ primitiveId: 'not-canonical', primitiveName: 'NotCanonical', symbol: 'NotCanonicalContract' });
    actual[descriptor.mutation.generatedFile] = `${JSON.stringify(core, null, 2)}\n`;
    await writeGeneratedOutputs(temporary, actual);
    await assert.rejects(verifyGeneratedDirectory(temporary, expected), (error) => error.code === descriptor.expectedErrorCodes[0]);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test('hand-edited generated output receives a stable generated-drift code', async () => {
  const descriptor = await fixture('hand-edited-output.json');
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'uifn-catalog-hand-edit-test-'));
  try {
    const expected = createGeneratedOutputs().outputs;
    const actual = structuredClone(expected);
    actual[descriptor.mutation.generatedFile] += ' ';
    await writeGeneratedOutputs(temporary, actual);
    await assert.rejects(verifyGeneratedDirectory(temporary, expected), (error) => error.code === descriptor.expectedErrorCodes[0]);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test('catalog v0 migrates losslessly to schema v1 and unsupported versions fail closed', () => {
  const component = { id: 'example', nested: { value: true } };
  const migrated = migrateCatalogDocument({ schemaVersion: 0, catalogId: 'test', components: [component] });
  assert.equal(migrated.ok, true);
  assert.deepEqual(migrated.document.primitives, [component]);
  assert.deepEqual(migrated.applied, ['catalog-v0-to-v1']);
  const unsupported = migrateCatalogDocument({ schemaVersion: 2, primitives: [] });
  assert.equal(unsupported.ok, false);
  assert.equal(unsupported.failures[0].code, 'UIFN_CATALOG_SCHEMA_VERSION_UNSUPPORTED');
});
