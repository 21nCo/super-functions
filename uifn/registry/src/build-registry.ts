import { REGISTRY_CATALOG_PAYLOAD } from './generated/catalog';
import {
  validateDependencyGraph,
  validateManifest,
  type RegistryManifest,
  type RegistryValidationIssue,
} from './schema';
import { verifyRegistryCatalogSignature } from './trust';

export interface BuiltRegistry {
  ok: boolean;
  artifacts: RegistryManifest[];
  bySlug: Record<string, RegistryManifest>;
  byLockKey: Record<string, RegistryManifest>;
  dependencyGraph: Record<string, string[]>;
  errors: RegistryValidationIssue[];
  trust: ReturnType<typeof verifyRegistryCatalogSignature>;
}

export interface BuildRegistryOptions {
  catalogOverride?: readonly RegistryManifest[];
  payloadOverride?: string;
}

export function buildRegistry(_rootDir?: string, options: BuildRegistryOptions = {}): BuiltRegistry {
  const artifacts = structuredClone(options.catalogOverride ?? REGISTRY_CATALOG_PAYLOAD.artifacts) as RegistryManifest[];
  const trust = verifyRegistryCatalogSignature(options.payloadOverride);
  const errors = artifacts.flatMap((manifest) => validateManifest(manifest).errors);
  errors.push(...validateDependencyGraph(artifacts).errors);
  if (!trust.ok) errors.push({ code: 'UIFN_REGISTRY_SIGNATURE_INVALID', field: 'catalog.signature', message: 'The offline registry catalog signature is invalid.' });
  const bySlug = Object.fromEntries(artifacts.map((manifest) => [manifest.slug, manifest]));
  const byLockKey = Object.fromEntries(artifacts.map((manifest) => [manifest.lockKey, manifest]));
  const dependencyGraph = Object.fromEntries(artifacts.map((manifest) => [manifest.slug, [...manifest.artifactDependencies]]));
  return { ok: errors.length === 0, artifacts, bySlug, byLockKey, dependencyGraph, errors, trust };
}

export function buildExperimentalRegistry(): BuiltRegistry {
  const trust = verifyRegistryCatalogSignature();
  return { ok: trust.ok, artifacts: [], bySlug: {}, byLockKey: {}, dependencyGraph: {}, errors: trust.ok ? [] : [{ code: 'UIFN_REGISTRY_SIGNATURE_INVALID', message: 'The offline registry catalog signature is invalid.' }], trust };
}
