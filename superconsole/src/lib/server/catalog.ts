import type {
  AdminAvailability,
  AdminCapabilityManifest,
  AdminCapabilityOwner,
  AdminDependencyDefinition,
} from '@superfunctions/admin';

export interface ConsoleModuleCatalogEntry {
  id: string;
  displayName: string;
  description: string;
  category: string;
  availability: AdminAvailability;
  owner?: AdminCapabilityOwner;
  dependencies: readonly AdminDependencyDefinition[];
}

function normalizedDependencies(
  dependencies: AdminCapabilityManifest['dependencies'],
): AdminDependencyDefinition[] {
  return (dependencies ?? []).map((dependency) =>
    typeof dependency === 'string'
      ? { moduleId: dependency, required: true }
      : { ...dependency, required: dependency.required !== false });
}

/** Build the installable product catalog exclusively from supplied manifests. */
export function createConsoleModuleCatalog(
  manifests: readonly AdminCapabilityManifest[],
): readonly ConsoleModuleCatalogEntry[] {
  const seen = new Set<string>();
  return Object.freeze(manifests.map((manifest) => {
    if (seen.has(manifest.id)) {
      throw new ModuleSelectionError('The supplied administration manifests contain duplicate module IDs.', {
        moduleId: manifest.id,
      });
    }
    seen.add(manifest.id);
    return Object.freeze({
      id: manifest.id,
      displayName: manifest.displayName,
      description: manifest.description,
      category: manifest.category,
      availability: manifest.availability,
      ...(manifest.owner ? { owner: Object.freeze({ ...manifest.owner }) } : {}),
      dependencies: Object.freeze(normalizedDependencies(manifest.dependencies)),
    });
  }));
}

export class ModuleSelectionError extends Error {
  readonly code = 'SUPERCONSOLE_INVALID_MODULE_SELECTION';

  constructor(message: string, readonly details: Record<string, unknown>) {
    super(message);
    this.name = 'ModuleSelectionError';
  }
}

export function parseModuleSelection(
  value: string | readonly string[] | undefined,
  manifests: readonly AdminCapabilityManifest[],
): string[] {
  if (value === undefined) {
    throw new ModuleSelectionError('Super Console requires an explicit module selection; use [] for a shell-only installation.', {
      received: 'undefined',
    });
  }

  const catalog = createConsoleModuleCatalog(manifests);
  const byId = new Map(catalog.map((entry) => [entry.id, entry]));
  const candidates = (typeof value === 'string' ? value.split(',') : value)
    .map((candidate) => candidate.trim().toLowerCase())
    .filter(Boolean);
  const unknown = [...new Set(candidates.filter((candidate) => !byId.has(candidate)))];
  if (unknown.length > 0) {
    throw new ModuleSelectionError('The module selection contains modules without supplied administration manifests.', {
      unknown,
      available: [...byId.keys()].sort(),
    });
  }

  const unavailable = candidates.filter((candidate) => byId.get(candidate)?.availability === 'unavailable');
  if (unavailable.length > 0) {
    throw new ModuleSelectionError('The module selection contains modules without a domain-backed administration service.', {
      unavailable: [...new Set(unavailable)],
    });
  }

  const folded = candidates.filter((candidate) => byId.get(candidate)?.availability === 'folded');
  if (folded.length > 0) {
    throw new ModuleSelectionError('Folded modules are provided by their owner and cannot be selected independently.', {
      folded: [...new Set(folded)],
      owners: folded.map((moduleId) => ({ moduleId, ownerId: byId.get(moduleId)?.owner?.moduleId })),
    });
  }

  const selected = [...new Set(candidates)];
  const selectedSet = new Set(selected);
  const missingOwners = selected.flatMap((moduleId) => {
    const ownerId = byId.get(moduleId)?.owner?.moduleId;
    return ownerId && !selectedSet.has(ownerId) ? [{ moduleId, ownerId }] : [];
  });
  if (missingOwners.length > 0) {
    throw new ModuleSelectionError('Nested modules require their owning module to be selected.', { missingOwners });
  }

  const missingDependencies = selected.flatMap((moduleId) =>
    (byId.get(moduleId)?.dependencies ?? [])
      .filter((dependency) => dependency.required !== false && !selectedSet.has(dependency.moduleId))
      .map((dependency) => ({ moduleId, dependencyId: dependency.moduleId })));
  if (missingDependencies.length > 0) {
    throw new ModuleSelectionError('Selected modules require additional enabled dependencies.', { missingDependencies });
  }

  const order = new Map(catalog.map((entry, index) => [entry.id, index]));
  return selected.sort((left, right) =>
    (order.get(left) ?? Number.MAX_SAFE_INTEGER) - (order.get(right) ?? Number.MAX_SAFE_INTEGER)
      || left.localeCompare(right));
}

export function catalogForSelection(
  catalog: readonly ConsoleModuleCatalogEntry[],
  selected: readonly string[],
): ConsoleModuleCatalogEntry[] {
  const selectedSet = new Set(selected);
  return catalog.filter(({ id }) => selectedSet.has(id));
}
