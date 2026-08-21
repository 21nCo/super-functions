import { describe, expect, it } from 'vitest';
import type { AdminCapabilityManifest } from '@superfunctions/admin';
import {
  ModuleSelectionError,
  catalogForSelection,
  createConsoleModuleCatalog,
  parseModuleSelection,
} from '../../src/lib/server/catalog';

function manifest(
  id: string,
  overrides: Partial<AdminCapabilityManifest> = {},
): AdminCapabilityManifest {
  return {
    schemaVersion: '1.0',
    id,
    displayName: id === 'custom-product' ? 'Custom Product' : id,
    version: '1.0.0',
    description: `Operate ${id}.`,
    category: 'test',
    availability: 'optional-product',
    scopeLevels: ['installation'],
    operations: [],
    ...overrides,
  };
}

const manifests = [
  manifest('owner-module'),
  manifest('examplefn', {
    availability: 'nested',
    owner: { moduleId: 'owner-module', mountPath: '/modules/owner-module/example' },
    dependencies: ['owner-module'],
  }),
  manifest('custom-product', {
    dependencies: [{ moduleId: 'owner-module', required: true, reason: 'Shared runtime' }],
  }),
  manifest('folded-module', {
    availability: 'folded',
    owner: { moduleId: 'owner-module' },
    dependencies: ['owner-module'],
  }),
  manifest('future-module', {
    availability: 'unavailable',
    unavailableReason: 'No administration service.',
  }),
];

describe('Super Console manifest catalog', () => {
  it('derives all catalog metadata from arbitrary supplied manifests', () => {
    expect(createConsoleModuleCatalog(manifests)).toEqual([
      expect.objectContaining({ id: 'owner-module', displayName: 'owner-module', dependencies: [] }),
      expect.objectContaining({ id: 'examplefn', availability: 'nested', owner: { moduleId: 'owner-module', mountPath: '/modules/owner-module/example' } }),
      expect.objectContaining({ id: 'custom-product', displayName: 'Custom Product', dependencies: [{ moduleId: 'owner-module', required: true, reason: 'Shared runtime' }] }),
      expect.objectContaining({ id: 'folded-module', availability: 'folded' }),
      expect.objectContaining({ id: 'future-module', availability: 'unavailable' }),
    ]);
  });

  it('parses an explicit deterministic selection without auto-enabling modules', () => {
    expect(parseModuleSelection('custom-product,owner-module,examplefn,owner-module', manifests)).toEqual([
      'owner-module',
      'examplefn',
      'custom-product',
    ]);
    expect(() => parseModuleSelection(undefined, manifests)).toThrow(/explicit module selection/);
    expect(parseModuleSelection([], manifests)).toEqual([]);
  });

  it('rejects unknown, unavailable, folded, ownerless, and dependency-incomplete selections', () => {
    expect(() => parseModuleSelection('unknown-module', manifests)).toThrow(ModuleSelectionError);
    expect(() => parseModuleSelection('future-module', manifests)).toThrow(/domain-backed/);
    expect(() => parseModuleSelection('owner-module,folded-module', manifests)).toThrow(/cannot be selected independently/);
    expect(() => parseModuleSelection('examplefn', manifests)).toThrow(/owning module/);
    expect(() => parseModuleSelection('custom-product', manifests)).toThrow(/additional enabled dependencies/);
  });

  it('returns only selected derived catalog entries', () => {
    const catalog = createConsoleModuleCatalog(manifests);
    expect(catalogForSelection(catalog, ['owner-module', 'custom-product']).map(({ id }) => id)).toEqual([
      'owner-module',
      'custom-product',
    ]);
  });

  it('rejects duplicate supplied manifest IDs', () => {
    expect(() => createConsoleModuleCatalog([manifest('examplefn'), manifest('examplefn')])).toThrow(/duplicate module IDs/);
  });
});
