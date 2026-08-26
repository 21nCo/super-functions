import { createHash } from 'node:crypto';
import path from 'node:path';

export const REQUIRED_FRAMEWORKS = ['react', 'svelte', 'solid'] as const;
export const REMOVED_FRAMEWORKS = ['vue', 'angular'] as const;
export type RegistryFramework = (typeof REQUIRED_FRAMEWORKS)[number];

export interface RegistryDependency {
  name: string;
  version: string;
  relationship: 'runtime' | 'peer';
}

export interface RegistryTemplateFile {
  destination: string;
  templatePath: string;
  packageSourcePath: string;
  sourceSha256: string;
  outputSha256: string;
  bytes: number;
  contents: string;
}

export interface RegistryFrameworkMetadata {
  supported: true;
  packageName: string;
  packageSubpath: string;
  packageImport: string;
  files: RegistryTemplateFile[];
  dependencies: RegistryDependency[];
  templateSha256: string;
}

export interface RegistryManifest {
  schemaVersion: 2;
  version: string;
  canonicalVersion: string;
  generatorVersion: string;
  name: string;
  slug: string;
  kind: 'component';
  status: 'ga-candidate';
  license: 'MIT';
  owners: string[];
  sourcePolicy: 'clean-room';
  lockKey: string;
  artifactDependencies: string[];
  definitionSha256: string;
  generatorSha256: string;
  frameworks: Record<RegistryFramework, RegistryFrameworkMetadata>;
  provenance: {
    source: string;
    sourcePolicy: 'clean-room';
    generatedBy: string;
    definitionSha256: string;
    generatorSha256: string;
  };
}

export interface RegistryCatalogPayload {
  schemaVersion: 2;
  registryVersion: string;
  generatorVersion: string;
  canonicalVersion: string;
  frameworks: readonly RegistryFramework[];
  artifactCount: number;
  definitionSha256: string;
  generatorSha256: string;
  sourcePolicy: 'clean-room';
  licensePolicy: readonly ['MIT'];
  artifacts: readonly RegistryManifest[];
  catalogSha256: string;
}

export interface RegistryValidationIssue {
  code: string;
  manifest?: string;
  field?: string;
  message: string;
}

export interface RegistryValidationResult {
  ok: boolean;
  errors: RegistryValidationIssue[];
}

const HASH = /^[a-f0-9]{64}$/;
const SEMVER = /^\d+\.\d+\.\d+$/;
const PACKAGE = /^(?:@[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*|[a-z0-9][a-z0-9._-]*)$/;

function checksumContent(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

export function isSafeRegistryPath(value: string): boolean {
  if (!value || value.includes('\0') || value.includes('\\') || path.posix.isAbsolute(value)) return false;
  const normalized = path.posix.normalize(value);
  if (normalized !== value || normalized === '..' || normalized.startsWith('../')) return false;
  const first = normalized.split('/')[0]?.toLowerCase();
  return !new Set(['.git', '.hg', '.svn', 'node_modules']).has(first);
}

export function validateManifest(manifest: RegistryManifest): RegistryValidationResult {
  const errors: RegistryValidationIssue[] = [];
  const label = `${manifest?.kind ?? 'unknown'}:${manifest?.slug ?? 'unknown'}`;
  const add = (code: string, field: string, message: string) => errors.push({ code, manifest: label, field, message });

  if (manifest?.schemaVersion !== 2) add('UIFN_REGISTRY_SCHEMA_INVALID', 'schemaVersion', `${label} schemaVersion must be 2.`);
  if (!SEMVER.test(manifest?.version ?? '')) add('UIFN_REGISTRY_VERSION_INVALID', 'version', `${label} version must be exact semver.`);
  if (!SEMVER.test(manifest?.canonicalVersion ?? '')) add('UIFN_REGISTRY_CANONICAL_VERSION_INVALID', 'canonicalVersion', `${label} canonicalVersion must be exact semver.`);
  if (!manifest?.owners?.length) add('UIFN_REGISTRY_OWNER_MISSING', 'owners', `${label} needs an owner.`);
  if (manifest?.license !== 'MIT') add('UIFN_REGISTRY_LICENSE_INVALID', 'license', `${label} license is not approved.`);
  if (manifest?.sourcePolicy !== 'clean-room' || manifest?.provenance?.sourcePolicy !== 'clean-room') add('UIFN_REGISTRY_PROVENANCE_INVALID', 'provenance', `${label} lacks clean-room provenance.`);
  if (!HASH.test(manifest?.definitionSha256 ?? '') || manifest.definitionSha256 !== manifest.provenance?.definitionSha256) add('UIFN_REGISTRY_PROVENANCE_INVALID', 'definitionSha256', `${label} definition hash is invalid.`);
  if (!HASH.test(manifest?.generatorSha256 ?? '') || manifest.generatorSha256 !== manifest.provenance?.generatorSha256) add('UIFN_REGISTRY_PROVENANCE_INVALID', 'generatorSha256', `${label} generator hash is invalid.`);
  if (manifest?.lockKey !== `component:${manifest?.slug}`) add('UIFN_REGISTRY_LOCK_KEY_INVALID', 'lockKey', `${label} lock key is invalid.`);

  for (const framework of REQUIRED_FRAMEWORKS) {
    const target = manifest?.frameworks?.[framework];
    if (!target?.supported) {
      add('UIFN_REGISTRY_FRAMEWORK_MISSING', `frameworks.${framework}`, `${label} is missing ${framework}.`);
      continue;
    }
    if (target.packageName !== `@uifn/components-${framework}` || target.packageSubpath !== manifest.slug) add('UIFN_REGISTRY_PACKAGE_TARGET_INVALID', `frameworks.${framework}.packageName`, `${label} package target is invalid.`);
    if (!Array.isArray(target.files) || target.files.length === 0) add('UIFN_REGISTRY_TEMPLATE_MISSING', `frameworks.${framework}.files`, `${label} has no source templates.`);
    const destinationCase = new Set<string>();
    for (const [index, file] of (target.files ?? []).entries()) {
      const field = `frameworks.${framework}.files.${index}`;
      if (!isSafeRegistryPath(file.destination) || !file.destination.startsWith(`components/uifn/${framework}/`)) add('UIFN_REGISTRY_PATH_ESCAPE', `${field}.destination`, `${label} has unsafe destination ${file.destination}.`);
      if (!isSafeRegistryPath(file.templatePath) || !file.templatePath.startsWith('uifn/registry/generated/templates/')) add('UIFN_REGISTRY_PATH_ESCAPE', `${field}.templatePath`, `${label} has unsafe template path.`);
      const folded = file.destination.toLocaleLowerCase('en-US');
      if (destinationCase.has(folded)) add('UIFN_REGISTRY_CASE_COLLISION', `${field}.destination`, `${label} has a case-colliding path.`);
      destinationCase.add(folded);
      const actual = checksumContent(file.contents ?? '');
      if (!HASH.test(file.sourceSha256) || file.sourceSha256 !== actual || file.outputSha256 !== actual) add('UIFN_REGISTRY_CHECKSUM_MISMATCH', field, `${label} template checksum is invalid.`);
      if (file.bytes !== Buffer.byteLength(file.contents ?? '')) add('UIFN_REGISTRY_CHECKSUM_MISMATCH', `${field}.bytes`, `${label} template size is invalid.`);
    }
    const templateSha256 = checksumContent(target.files.map((file) => `${file.destination}\0${file.outputSha256}`).join('\n'));
    if (target.templateSha256 !== templateSha256) add('UIFN_REGISTRY_CHECKSUM_MISMATCH', `frameworks.${framework}.templateSha256`, `${label} template aggregate is invalid.`);
    for (const dependency of target.dependencies ?? []) {
      if (!PACKAGE.test(dependency.name) || !dependency.version || !['runtime', 'peer'].includes(dependency.relationship)) add('UIFN_REGISTRY_DEPENDENCY_INVALID', `frameworks.${framework}.dependencies`, `${label} has an invalid dependency.`);
    }
  }

  return { ok: errors.length === 0, errors };
}

export function validateDependencyGraph(manifests: readonly RegistryManifest[]): RegistryValidationResult {
  const errors: RegistryValidationIssue[] = [];
  const bySlug = new Map(manifests.map((manifest) => [manifest.slug, manifest]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (slug: string, chain: string[]) => {
    if (visiting.has(slug)) {
      errors.push({ code: 'UIFN_REGISTRY_DEPENDENCY_CYCLE', manifest: `component:${slug}`, field: 'artifactDependencies', message: `Registry dependency cycle: ${[...chain, slug].join(' -> ')}` });
      return;
    }
    if (visited.has(slug)) return;
    visiting.add(slug);
    const manifest = bySlug.get(slug);
    for (const dependency of manifest?.artifactDependencies ?? []) {
      if (!bySlug.has(dependency)) errors.push({ code: 'UIFN_REGISTRY_DEPENDENCY_MISSING', manifest: `component:${slug}`, field: 'artifactDependencies', message: `Missing registry dependency ${dependency}.` });
      else visit(dependency, [...chain, slug]);
    }
    visiting.delete(slug);
    visited.add(slug);
  };
  manifests.forEach((manifest) => visit(manifest.slug, []));
  return { ok: errors.length === 0, errors };
}
