import { buildRegistry } from './build-registry';
import { REQUIRED_FRAMEWORKS } from './schema';

export const EXPECTED_COMPONENTS = 69;
export const EXPECTED_HOOKS = 0;

export interface CatalogValidationResult {
  ok: boolean;
  componentCount: number;
  hookCount: number;
  frameworks: string[];
  dependencyGraph: Record<string, string[]>;
  errors: string[];
}

export function validateCatalog(): CatalogValidationResult {
  const registry = buildRegistry();
  return { ok: registry.ok && registry.artifacts.length === EXPECTED_COMPONENTS, componentCount: registry.artifacts.length, hookCount: 0, frameworks: [...REQUIRED_FRAMEWORKS], dependencyGraph: registry.dependencyGraph, errors: registry.errors.map((error) => `${error.code}: ${error.message}`) };
}
