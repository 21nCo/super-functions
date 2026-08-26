import { buildRegistry, type RegistryManifest } from '../../../registry/src';
import { findRepoRoot } from '../paths';

export interface CompatibilityPanel {
  name: string;
  version: string;
  canonicalVersion: string;
  status: RegistryManifest['status'];
  kind: RegistryManifest['kind'];
  dependencies: string[];
  frameworks: string[];
  lockKey: string;
  definitionSha256: string;
  generatorSha256: string;
  sourcePolicy: string;
  certification: 'semantic-parity-complete-external-compatibility-pending';
}

export interface CompatibilityPanelOptions {
  slug: string;
  repoRoot?: string;
}

export function buildCompatibilityPanel(options: CompatibilityPanelOptions): CompatibilityPanel {
  const registry = buildRegistry(options.repoRoot ?? findRepoRoot());
  const manifest = registry.bySlug[options.slug];
  if (!manifest) throw new Error(`UIFN_STORYBOOK_METADATA_MISSING: ${options.slug}`);
  const dependencies = [...new Set(Object.values(manifest.frameworks).flatMap((framework) => framework.dependencies.map((dependency) => dependency.name)))].sort();
  return {
    name: manifest.name,
    version: manifest.version,
    canonicalVersion: manifest.canonicalVersion,
    status: manifest.status,
    kind: manifest.kind,
    dependencies,
    frameworks: Object.entries(manifest.frameworks).filter(([, value]) => value.supported).map(([framework]) => framework),
    lockKey: manifest.lockKey,
    definitionSha256: manifest.definitionSha256,
    generatorSha256: manifest.generatorSha256,
    sourcePolicy: manifest.sourcePolicy,
    certification: 'semantic-parity-complete-external-compatibility-pending',
  };
}
