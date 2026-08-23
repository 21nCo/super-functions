import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { CATALOG_SOURCE, EXPECTED_PRIMITIVE_NAMES } from './catalog-source.mjs';
import {
  BEHAVIOR_FAMILIES,
  CATALOG_SCHEMA_VERSION,
  CATALOG_VERSION,
  DOC_SECTIONS,
  DOM_SERVICES,
  FRAMEWORK_TARGETS,
  GENERATOR_VERSION,
  IMPLEMENTATION_KINDS,
  STABLE_FRAMEWORKS,
  STORY_PROFILES,
} from './profiles.mjs';

export const GENERATED_OUTPUT_NAMES = [
  'adapter-coverage.json',
  'anatomy-types.json',
  'catalog.json',
  'core-exports.json',
  'docs-manifest.json',
  'implementation-ownership.json',
  'package-exports.json',
  'primitive-contracts.d.ts',
  'registry-metadata.json',
  'release-matrix.json',
  'story-manifest.json',
  'test-manifest.json',
];

const PRIMITIVE_REQUIRED_FIELDS = [
  'id', 'name', 'canonicalOrder', 'behaviorFamily', 'implementationKind',
  'requirementIds', 'anatomy', 'inputs', 'events', 'states', 'controlledModel', 'formSemantics',
  'domServices', 'accessibility', 'frameworks', 'vectors', 'docs', 'stories', 'outputs', 'release', 'exceptions',
];
const ALLOWED_CONTROLLED_MODES = ['none', 'native', 'single', 'multiple', 'single-or-multiple', 'compound'];
const DOM_SERVICE_IDS = Object.values(DOM_SERVICES);
const PRIMITIVE_REQUIREMENTS = new Set(['PRIM-001', 'PRIM-002', 'PRIM-003', 'PRIM-004', 'PRIM-005', 'PRIM-006', 'PRIM-007', 'PRIM-008']);

export class CatalogError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'CatalogError';
    this.code = code;
    this.details = details;
  }
}

export function stableStringify(value, indentation = 2) {
  function sort(input) {
    if (Array.isArray(input)) return input.map(sort);
    if (input && typeof input === 'object') {
      return Object.fromEntries(Object.keys(input).sort().map((key) => [key, sort(input[key])]));
    }
    return input;
  }
  return `${JSON.stringify(sort(value), null, indentation)}\n`;
}

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function fail(code, message, details = {}) {
  throw new CatalogError(code, message, details);
}

function assert(condition, code, message, details = {}) {
  if (!condition) fail(code, message, details);
}

function assertUnique(values, label, primitive) {
  const seen = new Set();
  for (const value of values) {
    if (seen.has(value)) fail('UIFN_CATALOG_DUPLICATE', `Duplicate ${label}: ${value}`, { primitive, label, value });
    seen.add(value);
  }
}

function assertExactArray(actual, expected, label, primitive) {
  assert(Array.isArray(actual), 'UIFN_CATALOG_FIELD_MISSING', `${label} must be an array.`, { primitive, label });
  assert(actual.length === expected.length && actual.every((value, index) => value === expected[index]),
    'UIFN_CATALOG_UNSUPPORTED_VALUE', `${label} does not match the canonical contract.`, { primitive, label, actual, expected });
}

function validateAccessibility(primitive) {
  const accessibility = primitive.accessibility;
  assert(accessibility && typeof accessibility === 'object', 'UIFN_CATALOG_FIELD_MISSING', `${primitive.name} is missing accessibility.`, { primitive: primitive.name, field: 'accessibility' });
  assert(BEHAVIOR_FAMILIES.includes(accessibility.profile), 'UIFN_CATALOG_UNSUPPORTED_VALUE', `${primitive.name} has an unsupported accessibility profile.`, { primitive: primitive.name, value: accessibility.profile });
  const rules = accessibility.rules;
  const requiredRules = ['normativeBasis', 'nativeSemantics', 'accessibleName', 'description', 'keyboard', 'pointerTouch', 'focus', 'announcements', 'wcag', 'preferences'];
  assert(rules && typeof rules === 'object', 'UIFN_CATALOG_FIELD_MISSING', `${primitive.name} is missing accessibility rules.`, { primitive: primitive.name });
  for (const field of requiredRules) {
    assert(Object.hasOwn(rules, field), 'UIFN_CATALOG_FIELD_MISSING', `${primitive.name} is missing accessibility.rules.${field}.`, { primitive: primitive.name, field });
  }
  for (const field of ['normativeBasis', 'pointerTouch', 'focus', 'announcements', 'wcag']) {
    assert(Array.isArray(rules[field]) && rules[field].length > 0, 'UIFN_CATALOG_FIELD_MISSING', `${primitive.name} requires non-empty accessibility.rules.${field}.`, { primitive: primitive.name, field });
    assertUnique(rules[field], `accessibility.rules.${field}`, primitive.name);
  }
  assert(typeof rules.nativeSemantics === 'string' && rules.nativeSemantics.length > 0, 'UIFN_CATALOG_FIELD_MISSING', `${primitive.name} needs native semantics.`, { primitive: primitive.name });
  assert(typeof rules.accessibleName?.required === 'boolean' && rules.accessibleName.sources?.length > 0, 'UIFN_CATALOG_FIELD_MISSING', `${primitive.name} needs an accessible-name contract.`, { primitive: primitive.name });
  assert(typeof rules.description?.supported === 'boolean' && Array.isArray(rules.description.relationships), 'UIFN_CATALOG_FIELD_MISSING', `${primitive.name} needs a description contract.`, { primitive: primitive.name });
  assert(typeof rules.keyboard?.model === 'string' && rules.keyboard.keys?.length > 0, 'UIFN_CATALOG_FIELD_MISSING', `${primitive.name} needs a keyboard contract.`, { primitive: primitive.name });
  assert(['forcedColors', 'reflow', 'reducedMotion', 'rtl'].every((field) => typeof rules.preferences?.[field] === 'string' && rules.preferences[field].length > 0), 'UIFN_CATALOG_FIELD_MISSING', `${primitive.name} needs all accessibility preference contracts.`, { primitive: primitive.name });
  assert(Array.isArray(accessibility.primitiveNotes) && accessibility.primitiveNotes.length > 0, 'UIFN_CATALOG_FIELD_MISSING', `${primitive.name} needs primitive-specific accessibility notes.`, { primitive: primitive.name });
}

function validatePrimitive(primitive, index) {
  assert(primitive && typeof primitive === 'object', 'UIFN_CATALOG_FIELD_MISSING', `Primitive at index ${index} must be an object.`, { index });
  for (const field of PRIMITIVE_REQUIRED_FIELDS) {
    assert(Object.hasOwn(primitive, field), 'UIFN_CATALOG_FIELD_MISSING', `${primitive.name ?? index} is missing ${field}.`, { primitive: primitive.name, field });
  }
  assert(primitive.name === EXPECTED_PRIMITIVE_NAMES[index], 'UIFN_CATALOG_NAME_SET_INVALID', `Unexpected primitive at canonical position ${index + 1}.`, { actual: primitive.name, expected: EXPECTED_PRIMITIVE_NAMES[index] });
  assert(primitive.canonicalOrder === index + 1, 'UIFN_CATALOG_NAME_SET_INVALID', `${primitive.name} has an invalid canonical order.`, { actual: primitive.canonicalOrder, expected: index + 1 });
  assert(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(primitive.id), 'UIFN_CATALOG_UNSUPPORTED_VALUE', `${primitive.name} has an invalid id.`, { primitive: primitive.name, value: primitive.id });
  assert(BEHAVIOR_FAMILIES.includes(primitive.behaviorFamily), 'UIFN_CATALOG_UNSUPPORTED_VALUE', `${primitive.name} has an unsupported behavior family.`, { primitive: primitive.name, value: primitive.behaviorFamily });
  assert(IMPLEMENTATION_KINDS.includes(primitive.implementationKind), 'UIFN_CATALOG_UNSUPPORTED_VALUE', `${primitive.name} has an unsupported implementation kind.`, { primitive: primitive.name, value: primitive.implementationKind });
  assert(Array.isArray(primitive.requirementIds) && primitive.requirementIds.includes('CAT-001') && primitive.requirementIds.length >= 2, 'UIFN_CATALOG_REQUIREMENT_MAPPING_INVALID', `${primitive.name} must map CAT-001 and a primitive requirement.`, { primitive: primitive.name });
  assertUnique(primitive.requirementIds, 'requirement id', primitive.name);
  const primitiveRequirements = primitive.requirementIds.filter((id) => id.startsWith('PRIM-'));
  assert(primitiveRequirements.length > 0 && primitiveRequirements.every((id) => PRIMITIVE_REQUIREMENTS.has(id)), 'UIFN_CATALOG_REQUIREMENT_MAPPING_INVALID', `${primitive.name} has unsupported primitive requirements.`, { primitive: primitive.name, primitiveRequirements });

  for (const [field, key] of [['anatomy', 'id'], ['inputs', 'name'], ['events', 'type'], ['states', 'name']]) {
    assert(Array.isArray(primitive[field]), 'UIFN_CATALOG_FIELD_MISSING', `${primitive.name} is missing ${field}.`, { primitive: primitive.name, field });
    assertUnique(primitive[field].map((entry) => entry?.[key]), field, primitive.name);
  }
  assert(primitive.anatomy.length > 0 && primitive.inputs.length > 0 && primitive.states.length > 0, 'UIFN_CATALOG_FIELD_MISSING', `${primitive.name} needs anatomy, inputs, and states.`, { primitive: primitive.name });
  assert(primitive.implementationKind === 'typed-static-contract' || primitive.events.length > 0, 'UIFN_CATALOG_FIELD_MISSING', `${primitive.name} interactive controllers need events.`, { primitive: primitive.name });

  const model = primitive.controlledModel;
  assert(model && ALLOWED_CONTROLLED_MODES.includes(model.mode), 'UIFN_CATALOG_UNSUPPORTED_VALUE', `${primitive.name} has an unsupported controlled model.`, { primitive: primitive.name, value: model?.mode });
  const inputNames = new Set(primitive.inputs.map((input) => input.name));
  for (const field of ['valueInputs', 'defaultInputs']) {
    assert(Array.isArray(model[field]), 'UIFN_CATALOG_FIELD_MISSING', `${primitive.name} controlledModel.${field} must be an array.`, { primitive: primitive.name, field });
    assertUnique(model[field], `controlledModel.${field}`, primitive.name);
    for (const input of model[field]) assert(inputNames.has(input), 'UIFN_CATALOG_FIELD_MISSING', `${primitive.name} controlledModel references missing input ${input}.`, { primitive: primitive.name, field, input });
  }
  assert(Array.isArray(model.changeEvents), 'UIFN_CATALOG_FIELD_MISSING', `${primitive.name} controlledModel.changeEvents must be an array.`, { primitive: primitive.name });
  assertUnique(model.changeEvents, 'controlledModel.changeEvents', primitive.name);
  if (model.mode === 'none') assert(model.valueInputs.length === 0 && model.defaultInputs.length === 0 && model.changeEvents.length === 0, 'UIFN_CATALOG_UNSUPPORTED_VALUE', `${primitive.name} none model cannot declare bindings.`, { primitive: primitive.name });
  else assert(model.valueInputs.length > 0 && model.changeEvents.length > 0, 'UIFN_CATALOG_FIELD_MISSING', `${primitive.name} controlled model needs value inputs and change events.`, { primitive: primitive.name });

  assert(Array.isArray(primitive.domServices), 'UIFN_CATALOG_FIELD_MISSING', `${primitive.name} domServices must be an array.`, { primitive: primitive.name });
  assertUnique(primitive.domServices, 'DOM service', primitive.name);
  for (const service of primitive.domServices) assert(DOM_SERVICE_IDS.includes(service), 'UIFN_CATALOG_UNSUPPORTED_VALUE', `${primitive.name} has an unsupported DOM service.`, { primitive: primitive.name, value: service });
  validateAccessibility(primitive);

  assertExactArray(Object.keys(primitive.frameworks), STABLE_FRAMEWORKS, 'framework keys', primitive.name);
  for (const framework of STABLE_FRAMEWORKS) {
    const target = primitive.frameworks[framework];
    const expected = FRAMEWORK_TARGETS[framework];
    assert(target?.headlessPackage === expected.headlessPackage && target?.styledPackage === expected.styledPackage && target?.compoundRoot === primitive.name && target?.support === 'required', 'UIFN_CATALOG_UNSUPPORTED_VALUE', `${primitive.name} has invalid ${framework} target metadata.`, { primitive: primitive.name, framework });
    assert(target.implementationStatus === 'implemented', 'UIFN_CATALOG_IMPLEMENTATION_STATUS_INVALID', `${primitive.name} ${framework} must identify its implemented stable adapter.`, { primitive: primitive.name, framework });
  }

  const expectedVectors = primitive.requirementIds.flatMap((id) => [`TV-${id}-P`, `TV-${id}-N`]);
  assertExactArray(primitive.vectors, expectedVectors, 'vectors', primitive.name);
  assert(primitive.docs?.page === `primitives/${primitive.id}`, 'UIFN_CATALOG_UNSUPPORTED_VALUE', `${primitive.name} has an invalid docs page.`, { primitive: primitive.name });
  assertExactArray(primitive.docs?.requiredSections, DOC_SECTIONS, 'docs required sections', primitive.name);
  assert(primitive.docs?.implementationStatus === 'implemented', 'UIFN_CATALOG_IMPLEMENTATION_STATUS_INVALID', `${primitive.name} docs must identify their implemented catalog page.`, { primitive: primitive.name });
  assertExactArray(primitive.stories?.requiredScenarios, STORY_PROFILES[primitive.implementationKind], 'story scenarios', primitive.name);
  assert(primitive.stories?.implementationStatus === 'implemented', 'UIFN_CATALOG_IMPLEMENTATION_STATUS_INVALID', `${primitive.name} stories must identify their implemented scenario suite.`, { primitive: primitive.name });

  const expectedCore = primitive.implementationKind === 'interactive-controller'
    ? [`${primitive.name}Controller`, `create${primitive.name}Controller`]
    : [`${primitive.name}Contract`];
  assertExactArray(primitive.outputs?.core, expectedCore, 'core outputs', primitive.name);
  assertExactArray(primitive.outputs?.headlessPackages, STABLE_FRAMEWORKS.map((framework) => FRAMEWORK_TARGETS[framework].headlessPackage), 'headless package outputs', primitive.name);
  assertExactArray(primitive.outputs?.styledPackages, STABLE_FRAMEWORKS.map((framework) => FRAMEWORK_TARGETS[framework].styledPackage), 'styled package outputs', primitive.name);
  assert(primitive.release?.channel === 'stable-1.0' && primitive.release?.catalogStatus === 'ga-required', 'UIFN_CATALOG_RELEASE_MAPPING_INVALID', `${primitive.name} release metadata is invalid.`, { primitive: primitive.name });
  assert(primitive.release?.implementationStatus === 'implemented', 'UIFN_CATALOG_IMPLEMENTATION_STATUS_INVALID', `${primitive.name} release status must identify the implemented primitive.`, { primitive: primitive.name });
  assert(Array.isArray(primitive.exceptions), 'UIFN_CATALOG_FIELD_MISSING', `${primitive.name} exceptions must be an array.`, { primitive: primitive.name });
}

export function validateCatalogSource(source = CATALOG_SOURCE) {
  assert(source?.schemaVersion === CATALOG_SCHEMA_VERSION, 'UIFN_CATALOG_SCHEMA_INVALID', 'Catalog schema version is unsupported.', { actual: source?.schemaVersion });
  assert(source?.catalogVersion === CATALOG_VERSION && source?.generatorVersion === GENERATOR_VERSION, 'UIFN_CATALOG_SCHEMA_INVALID', 'Catalog or generator version is unsupported.');
  assert(source?.sourcePolicy === 'clean-room-original-definition', 'UIFN_CATALOG_UNSUPPORTED_VALUE', 'Catalog source policy must be clean-room original definition.');
  assertExactArray(source?.frameworks, STABLE_FRAMEWORKS, 'catalog frameworks', 'catalog');
  assert(source?.implementationStatusPolicy?.allowedCurrentStatus === 'implemented' && source?.implementationStatusPolicy?.generatedMetadataIsImplementationEvidence === true, 'UIFN_CATALOG_IMPLEMENTATION_STATUS_INVALID', 'The current catalog must describe the implemented stable package graph.');
  assert(Array.isArray(source?.primitives), 'UIFN_CATALOG_FIELD_MISSING', 'Catalog primitives must be an array.');
  assert(source.primitives.length === EXPECTED_PRIMITIVE_NAMES.length && EXPECTED_PRIMITIVE_NAMES.length === 69, 'UIFN_CATALOG_NAME_SET_INVALID', 'Catalog must contain exactly 69 canonical primitives.', { actual: source.primitives.length });
  assertUnique(source.primitives.map((primitive) => primitive.id), 'primitive id', 'catalog');
  assertUnique(source.primitives.map((primitive) => primitive.name), 'primitive name', 'catalog');
  assertUnique(source.primitives.map((primitive) => primitive.canonicalOrder), 'canonical order', 'catalog');
  source.primitives.forEach(validatePrimitive);
  return { ok: true, primitiveCount: source.primitives.length };
}

export function compileCatalog(source = CATALOG_SOURCE) {
  validateCatalogSource(source);
  const cloned = structuredClone(source);
  const sourceSha256 = sha256(stableStringify(cloned, 0));
  const withoutCatalogHash = {
    $schema: '../schema/catalog.schema.json',
    ...cloned,
    primitiveCount: cloned.primitives.length,
    sourceSha256,
  };
  const catalogSha256 = sha256(stableStringify(withoutCatalogHash, 0));
  return { ...withoutCatalogHash, catalogSha256 };
}

function definitionHeader() {
  return [
    '// Generated by @uifn/catalog. Do not hand edit.',
    '// Current stable catalog output. Runtime evidence is owned by the package and browser verification suites.',
    '',
  ].join('\n');
}

function primitiveContractsDts(catalog) {
  const names = catalog.primitives.map((primitive) => `'${primitive.name}'`).join(' | ');
  const ids = catalog.primitives.map((primitive) => `'${primitive.id}'`).join(' | ');
  return `${definitionHeader()}export type UifnPrimitiveName = ${names};\nexport type UifnPrimitiveId = ${ids};\nexport type UifnStableFramework = 'react' | 'svelte' | 'solid';\nexport type UifnImplementationStatus = 'implemented';\n\nexport interface UifnPrimitiveDefinitionStub {\n  readonly id: UifnPrimitiveId;\n  readonly name: UifnPrimitiveName;\n  readonly implementationStatus: UifnImplementationStatus;\n}\n`;
}

export function createGeneratedOutputs(source = CATALOG_SOURCE) {
  const catalog = compileCatalog(source);
  const metadata = { schemaVersion: catalog.schemaVersion, catalogVersion: catalog.catalogVersion, generatorVersion: catalog.generatorVersion, sourceSha256: catalog.sourceSha256, catalogSha256: catalog.catalogSha256, implementationEvidence: true };
  const coreExports = catalog.primitives.flatMap((primitive) => primitive.outputs.core.map((symbol) => ({ primitiveId: primitive.id, primitiveName: primitive.name, symbol, kind: primitive.implementationKind, implementationStatus: 'implemented' })));
  const packageNames = ['@uifn/core', ...STABLE_FRAMEWORKS.flatMap((framework) => [FRAMEWORK_TARGETS[framework].headlessPackage, FRAMEWORK_TARGETS[framework].styledPackage])];
  const packageExports = packageNames.map((packageName) => ({
    packageName,
    implementationStatus: 'implemented',
    primitives: catalog.primitives.map((primitive) => ({ primitiveId: primitive.id, primitiveName: primitive.name, target: packageName === '@uifn/core' ? primitive.outputs.core : [primitive.name] })),
  }));
  const outputs = {
    'catalog.json': stableStringify(catalog),
    'core-exports.json': stableStringify({ ...metadata, exports: coreExports }),
    'package-exports.json': stableStringify({ ...metadata, packages: packageExports }),
    'anatomy-types.json': stableStringify({ ...metadata, primitives: catalog.primitives.map((primitive) => ({ id: primitive.id, name: primitive.name, anatomy: primitive.anatomy, inputs: primitive.inputs, events: primitive.events, states: primitive.states, controlledModel: primitive.controlledModel, formSemantics: primitive.formSemantics })) }),
    'primitive-contracts.d.ts': primitiveContractsDts(catalog),
    'adapter-coverage.json': stableStringify({ ...metadata, frameworks: STABLE_FRAMEWORKS, primitives: catalog.primitives.map((primitive) => ({ id: primitive.id, name: primitive.name, frameworks: primitive.frameworks })) }),
    'registry-metadata.json': stableStringify({ ...metadata, writePolicy: 'metadata-targets-only-no-registry-write', primitives: catalog.primitives.map((primitive) => ({ id: primitive.id, name: primitive.name, outputs: primitive.outputs, implementationStatus: primitive.release.implementationStatus })) }),
    'story-manifest.json': stableStringify({ ...metadata, manifestStatus: 'implemented', primitives: catalog.primitives.map((primitive) => ({ id: primitive.id, name: primitive.name, ...primitive.stories })) }),
    'docs-manifest.json': stableStringify({ ...metadata, manifestStatus: 'implemented', primitives: catalog.primitives.map((primitive) => ({ id: primitive.id, name: primitive.name, ...primitive.docs })) }),
    'test-manifest.json': stableStringify({ ...metadata, primitiveCount: catalog.primitiveCount, vectors: ['TV-CAT-001-P', 'TV-CAT-001-N'], primitives: catalog.primitives.map((primitive) => ({ id: primitive.id, name: primitive.name, requirementIds: primitive.requirementIds, vectors: primitive.vectors })) }),
    'release-matrix.json': stableStringify({ ...metadata, releaseChannel: 'stable-1.0', allImplementationsImplemented: true, primitives: catalog.primitives.map((primitive) => ({ id: primitive.id, name: primitive.name, release: primitive.release, frameworkStatuses: Object.fromEntries(STABLE_FRAMEWORKS.map((framework) => [framework, primitive.frameworks[framework].implementationStatus])) })) }),
    'implementation-ownership.json': stableStringify({ ...metadata, domServices: DOM_SERVICE_IDS, primitives: catalog.primitives.map((primitive) => ({ id: primitive.id, name: primitive.name, requirements: primitive.requirementIds, domServices: primitive.domServices })) }),
  };
  assertExactArray(Object.keys(outputs).sort(), GENERATED_OUTPUT_NAMES, 'generated output names', 'compiler');
  const outputRecords = Object.entries(outputs).sort(([left], [right]) => left.localeCompare(right)).map(([outputPath, contents]) => ({ path: outputPath, sha256: sha256(contents), bytes: Buffer.byteLength(contents) }));
  const manifest = {
    schemaVersion: CATALOG_SCHEMA_VERSION,
    generatorVersion: GENERATOR_VERSION,
    catalogVersion: CATALOG_VERSION,
    sourceSha256: catalog.sourceSha256,
    catalogSha256: catalog.catalogSha256,
    outputCount: outputRecords.length,
    outputs: outputRecords,
    deterministic: true,
    implementationEvidence: true,
  };
  outputs['generation-manifest.json'] = stableStringify(manifest);
  return { catalog, outputs, manifest };
}

export function compareGeneratedOutputs(left, right) {
  const leftNames = Object.keys(left).sort();
  const rightNames = Object.keys(right).sort();
  if (leftNames.length !== rightNames.length || leftNames.some((name, index) => name !== rightNames[index])) {
    fail('UIFN_CATALOG_GENERATED_DRIFT', 'Generated output file sets differ.', { leftNames, rightNames });
  }
  for (const name of leftNames) {
    if (left[name] !== right[name]) fail('UIFN_CATALOG_GENERATED_DRIFT', `Generated output differs: ${name}`, { path: name, leftSha256: sha256(left[name]), rightSha256: sha256(right[name]) });
  }
  return { ok: true, outputCount: leftNames.length };
}

export async function writeGeneratedOutputs(directory, outputs) {
  await rm(directory, { recursive: true, force: true });
  await mkdir(directory, { recursive: true });
  for (const [name, contents] of Object.entries(outputs).sort(([left], [right]) => left.localeCompare(right))) {
    await writeFile(path.join(directory, name), contents, 'utf8');
  }
}

async function readDirectoryOutputs(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const outputs = {};
  for (const entry of entries) {
    if (!entry.isFile()) fail('UIFN_CATALOG_GENERATED_DRIFT', `Unexpected generated directory entry: ${entry.name}`, { path: entry.name });
    outputs[entry.name] = await readFile(path.join(directory, entry.name), 'utf8');
  }
  return outputs;
}

export async function verifyGeneratedDirectory(directory, expectedOutputs) {
  let actual;
  try {
    actual = await readDirectoryOutputs(directory);
  } catch (error) {
    if (error.code === 'ENOENT') fail('UIFN_CATALOG_GENERATED_DRIFT', 'Generated catalog directory is missing.', { directory });
    throw error;
  }
  if (actual['core-exports.json']) {
    try {
      const parsed = JSON.parse(actual['core-exports.json']);
      const expected = JSON.parse(expectedOutputs['core-exports.json']);
      const expectedPrimitiveIds = new Set(expected.exports.map((entry) => entry.primitiveId));
      const expectedSymbols = new Set(expected.exports.map((entry) => `${entry.primitiveId}:${entry.symbol}`));
      const actualSymbols = new Set(parsed.exports?.map((entry) => `${entry.primitiveId}:${entry.symbol}`) ?? []);
      const undocumented = (parsed.exports ?? []).filter((entry) => !expectedPrimitiveIds.has(entry.primitiveId) || !expectedSymbols.has(`${entry.primitiveId}:${entry.symbol}`));
      const missing = [...expectedSymbols].filter((entry) => !actualSymbols.has(entry));
      if (undocumented.length || missing.length) fail('UIFN_CATALOG_EXPORT_DRIFT', 'Core exports contain undocumented or missing catalog exports.', { undocumented, missing });
    } catch (error) {
      if (error instanceof CatalogError) throw error;
      fail('UIFN_CATALOG_EXPORT_DRIFT', 'Core exports are not valid catalog JSON.', { message: error.message });
    }
  }
  return compareGeneratedOutputs(actual, expectedOutputs);
}
