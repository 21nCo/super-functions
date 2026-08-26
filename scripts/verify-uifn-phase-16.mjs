#!/usr/bin/env node

import { createHash, createPublicKey, verify } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DELIVERY_GENERATOR_VERSION } from './uifn-delivery-generator.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const npm = process.env.UIFN_NPM_PATH ?? (process.platform === 'win32' ? 'npm.cmd' : 'npm');
const node = process.env.UIFN_NODE_PATH ?? process.execPath;
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const read = (relative) => readFileSync(path.join(root, relative), 'utf8');
const json = (relative) => JSON.parse(read(relative));

export function inspectGeneratedOutput(expected, actual, path = 'generated-output') {
  return expected === actual ? [] : [{ code: 'UIFN_GENERATED_SOURCE_DRIFT', path, expectedSha256: sha256(expected), actualSha256: sha256(actual) }];
}

export function inspectSourceTemplate(file) {
  const failures = [];
  if (!/^(?:components\/uifn\/(?:react|solid)\/[a-z0-9-]+\.ts|components\/uifn\/svelte\/[a-z0-9-]+\/[A-Za-z0-9.-]+)$/.test(file.destination)) failures.push({ code: 'UIFN_REGISTRY_PATH_ESCAPE', path: file.destination });
  if (file.contents.includes('/Users/') || file.contents.includes('uifn/registry/generated/templates') || /from\s+['"]\.\.\/\.\.\//.test(file.contents)) failures.push({ code: 'UIFN_REGISTRY_REPOSITORY_LEAK', path: file.destination });
  if (sha256(file.contents) !== file.outputSha256 || Buffer.byteLength(file.contents) !== file.bytes) failures.push({ code: 'UIFN_REGISTRY_CHECKSUM_MISMATCH', path: file.destination });
  return failures;
}

export function classifyPhase16Requirements(failures) {
  const generatorCommandPattern = /generate-uifn-phase-16|verify-uifn-phase-15|verify-uifn-phase-14-parity|verify-uifn-phase-16-consumers/;
  const registryCommandPattern = /@uifn\/registry|verify-uifn-phase-16-consumers/;
  const generatedFailure = failures.some((failure) =>
    failure.code.includes('GENERATED')
    || failure.code.includes('TEMPLATE')
    || failure.code.includes('PROVENANCE')
    || failure.code.includes('PHASE14')
    || (failure.code === 'UIFN_PHASE16_COMMAND_FAILED' && generatorCommandPattern.test(failure.command ?? '')));
  const registryFailure = failures.some((failure) =>
    failure.code.includes('REGISTRY')
    || (failure.code === 'UIFN_PHASE16_COMMAND_FAILED' && registryCommandPattern.test(failure.command ?? '')));
  return {
    'GEN-001': generatedFailure ? 'failed' : 'passed',
    'REG-001': registryFailure ? 'failed' : 'passed',
  };
}

function run(command, args, env = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    env: { ...process.env, ...env },
    encoding: 'utf8',
    maxBuffer: 128 * 1024 * 1024,
  });
  return {
    command: [command, ...args].join(' '),
    passed: result.status === 0,
    status: result.status,
    stdoutTail: (result.stdout ?? '').split('\n').slice(-24).join('\n'),
    stderrTail: (result.stderr ?? '').split('\n').slice(-24).join('\n'),
  };
}

function latestParityTraceRoot() {
  const evidenceRoot = path.join(root, 'uifn/.conduct/evidence/phase-14');
  const candidates = existsSync(evidenceRoot) ? readdirSync(evidenceRoot).sort().reverse() : [];
  return candidates.map((name) => path.join(evidenceRoot, name, 'traces')).find((candidate) => existsSync(path.join(candidate, 'package-react.json')) && existsSync(path.join(candidate, 'source-solid.json')));
}

export function inspectPhase16() {
  const failures = [];
  const catalog = json('uifn/registry/generated/catalog.json');
  const delivery = json('uifn/registry/generated/delivery-manifest.json');
  const signature = json('uifn/registry/generated/catalog-signature.json');
  const publicKey = read('uifn/registry/trust/registry-ed25519-public.pem');
  const catalogSource = read('uifn/registry/generated/catalog.json');
  const anatomy = json('uifn/catalog/generated/anatomy-types.json');
  const expectedComponentCount = anatomy.primitives.length;
  const partCount = anatomy.primitives.reduce((count, primitive) => count + primitive.anatomy.length, 0);
  const expectedTemplateCount = (expectedComponentCount * 3) + partCount;

  if (
    catalog.schemaVersion !== 2
    || catalog.artifactCount !== expectedComponentCount
    || catalog.artifacts.length !== expectedComponentCount
  ) {
    failures.push({
      code: 'UIFN_REGISTRY_CATALOG_INCOMPLETE',
      actual: catalog.artifacts.length,
      expected: expectedComponentCount,
    });
  }
  if (delivery.componentCount !== expectedComponentCount || delivery.partCount !== partCount) {
    failures.push({
      code: 'UIFN_GENERATED_PART_COVERAGE_MISMATCH',
      actual: { components: delivery.componentCount, parts: delivery.partCount },
      expected: { components: expectedComponentCount, parts: partCount },
    });
  }
  if (catalog.frameworks.join(',') !== 'react,svelte,solid') failures.push({ code: 'UIFN_REGISTRY_FRAMEWORK_SET_INVALID', actual: catalog.frameworks });
  if (delivery.generatorVersion !== DELIVERY_GENERATOR_VERSION || delivery.definitionSha256 !== catalog.definitionSha256 || delivery.generatorSha256 !== catalog.generatorSha256) failures.push({ code: 'UIFN_GENERATED_PROVENANCE_MISMATCH' });

  let templateCount = 0;
  for (const artifact of catalog.artifacts) {
    if (artifact.license !== 'MIT' || artifact.sourcePolicy !== 'clean-room' || artifact.provenance.sourcePolicy !== 'clean-room') failures.push({ code: 'UIFN_REGISTRY_PROVENANCE_INVALID', slug: artifact.slug });
    for (const framework of catalog.frameworks) {
      const target = artifact.frameworks[framework];
      for (const file of target.files) {
        templateCount += 1;
        failures.push(...inspectSourceTemplate(file));
        const packageSource = read(file.packageSourcePath);
        const templateSource = read(file.templatePath);
        failures.push(...inspectGeneratedOutput(packageSource, templateSource, file.templatePath));
        failures.push(...inspectGeneratedOutput(file.contents, templateSource, file.templatePath));
      }
    }
  }
  if (templateCount !== expectedTemplateCount) {
    failures.push({
      code: 'UIFN_GENERATED_TEMPLATE_COVERAGE_MISMATCH',
      actual: templateCount,
      expected: expectedTemplateCount,
    });
  }

  const legacyCatalogRoot = path.join(root, 'uifn/registry/catalog/components');
  const legacyCatalogCount = existsSync(legacyCatalogRoot) ? readdirSync(legacyCatalogRoot).filter((name) => name.endsWith('.json')).length : 0;
  if (legacyCatalogCount) failures.push({ code: 'UIFN_REGISTRY_DUPLICATE_CATALOG', count: legacyCatalogCount });

  const catalogSha256 = sha256(catalogSource);
  const keyId = sha256(createPublicKey(publicKey).export({ format: 'der', type: 'spki' })).slice(0, 24);
  const signatureValid = signature.catalogSha256 === catalogSha256
    && signature.keyId === keyId
    && verify(null, Buffer.from(catalogSource), publicKey, Buffer.from(signature.signatureBase64, 'base64'));
  if (!signatureValid) failures.push({ code: 'UIFN_REGISTRY_SIGNATURE_INVALID' });

  const registrySources = ['schema.ts', 'trust.ts', 'build-registry.ts', 'plan.ts', 'transaction.ts', 'add.ts', 'diff.ts', 'update.ts', 'remove.ts', 'lockfile.ts', 'cli.ts'];
  registrySources.forEach((name) => {
    const pathname = path.join(root, 'uifn/registry/src', name);
    if (!existsSync(pathname) || !statSync(pathname).isFile()) failures.push({ code: 'UIFN_REGISTRY_RUNTIME_MISSING', path: `uifn/registry/src/${name}` });
  });

  return {
    failures,
    catalog,
    delivery,
    signature: { valid: signatureValid, keyId, catalogSha256 },
    counts: { components: catalog.artifacts.length, parts: partCount, templates: templateCount, legacyCatalogs: legacyCatalogCount },
  };
}

export function verifyPhase16(options = {}) {
  const inspection = inspectPhase16();
  const failures = [...inspection.failures];
  const checks = [];
  const evidenceRoot = options.evidenceRoot ?? (process.env.UIFN_PHASE16_EVIDENCE_DIR ? path.resolve(process.env.UIFN_PHASE16_EVIDENCE_DIR) : null);
  const consumerEvidence = evidenceRoot ? path.join(evidenceRoot, 'clean-consumers.json') : undefined;
  if (!options.staticOnly) {
    const commands = [
      [node, ['scripts/generate-uifn-phase-16.mjs', '--check']],
      [node, ['scripts/generate-uifn-phase-16.mjs', '--check']],
      [node, ['--test', 'scripts/verify-uifn-phase-16-contract.test.mjs']],
      [npm, ['--workspace', '@uifn/registry', 'run', 'typecheck']],
      [npm, ['--workspace', '@uifn/registry', 'run', 'test']],
      [npm, ['--workspace', '@uifn/registry', 'run', 'build']],
      [npm, ['--workspace', '@uifn/registry', 'pack', '--dry-run']],
      [node, ['scripts/verify-uifn-phase-15.mjs', '--static-only']],
      [node, ['scripts/verify-uifn-phase-16-consumers.mjs'], consumerEvidence ? { UIFN_PHASE16_CONSUMER_EVIDENCE: consumerEvidence } : {}],
    ];
    const traceRoot = latestParityTraceRoot();
    if (traceRoot) commands.push([node, ['scripts/verify-uifn-phase-14-parity.mjs', '--trace-dir', traceRoot]]);
    else failures.push({ code: 'UIFN_PHASE14_SEMANTIC_PARITY_EVIDENCE_MISSING' });
    for (const command of commands) {
      const [executable, args, env = {}] = command;
      const result = run(executable, args, env);
      checks.push(result);
      if (!result.passed) failures.push({ code: 'UIFN_PHASE16_COMMAND_FAILED', command: result.command, status: result.status, stdoutTail: result.stdoutTail, stderrTail: result.stderrTail });
    }
  }

  const result = {
    schemaVersion: 1,
    phase: 'PHASE_16',
    status: failures.length ? 'failed' : 'passed',
    requirements: classifyPhase16Requirements(failures),
    vectors: {
      'TV-GEN-001-P/N': { ...inspection.counts, definitionSha256: inspection.delivery.definitionSha256, generatorSha256: inspection.delivery.generatorSha256, deterministicChecks: options.staticOnly ? 0 : 2 },
      'TV-REG-001-P/N': { signature: inspection.signature, adversarialCases: ['dry-run-no-write', 'idempotence', 'traversal', 'symlink', 'checksum', 'cycle', 'unsupported-framework', 'dirty-conflict', 'interruption', 'rollback'] },
    },
    checks,
    failures,
    provisionalUntilSignedPhase14Compatibility: true,
  };
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = verifyPhase16({ staticOnly: process.argv.includes('--static-only') });
  const evidenceRoot = process.env.UIFN_PHASE16_EVIDENCE_DIR ? path.resolve(process.env.UIFN_PHASE16_EVIDENCE_DIR) : null;
  if (evidenceRoot) {
    mkdirSync(evidenceRoot, { recursive: true });
    writeFileSync(path.join(evidenceRoot, 'phase-16.json'), `${JSON.stringify(result, null, 2)}\n`);
  }
  const summary = { ok: result.status === 'passed', phase: result.phase, requirements: result.requirements, vectors: result.vectors, checkCount: result.checks.length, failureCount: result.failures.length, failures: result.failures.slice(0, 20), evidence: evidenceRoot ? path.join(evidenceRoot, 'phase-16.json') : null };
  (result.status === 'passed' ? console.log : console.error)(JSON.stringify(summary, null, 2));
  if (result.status !== 'passed') process.exitCode = 1;
}
