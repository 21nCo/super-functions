import { describe, expect, it } from 'vitest';
import {
  normalizeCatalogBasePath,
  normalizeCatalogInternalPath,
  stripCatalogBasePath,
  withCatalogBasePath,
} from '../catalog-routing.js';
import { getWorkbenchRoute } from '../routes.js';

describe('catalog route normalization', () => {
  it('normalizes base and internal paths without changing the root route', () => {
    expect(normalizeCatalogBasePath('/components/react/')).toBe('/components/react');
    expect(normalizeCatalogInternalPath('/')).toBe('/');
    expect(normalizeCatalogInternalPath('//components//dialog///')).toBe('/components/dialog');
  });

  it('treats trailing-slash and slashless public URLs as the same route', () => {
    expect(stripCatalogBasePath(
      '/components/react/components/dialog/',
      '/components/react',
    )).toBe('/components/dialog');
    expect(stripCatalogBasePath(
      '/components/react/components/dialog',
      '/components/react',
    )).toBe('/components/dialog');
    expect(getWorkbenchRoute('/components/dialog/').slug).toBe('dialog');
  });

  it('does not emit trailing slashes for non-root internal links', () => {
    expect(withCatalogBasePath(
      '/components/react/',
      '/components/dialog/',
    )).toBe('/components/react/components/dialog');
    expect(withCatalogBasePath('/components/react', '/')).toBe('/components/react');
  });
});
