import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { REGISTRY_CATALOG_PAYLOAD } from '../generated/catalog';
import { inferFrameworkDependencies } from '../plan';
import { REQUIRED_FRAMEWORKS } from '../schema';

describe('source dependency inference', () => {
  it.each(REQUIRED_FRAMEWORKS)('includes direct recipe imports for %s templates', (framework) => {
    const manifest = REGISTRY_CATALOG_PAYLOAD.artifacts[0];
    const dependencies = inferFrameworkDependencies(manifest, framework);

    expect(dependencies).toContainEqual({
      name: '@uifn/recipes',
      version: '0.0.1',
      relationship: 'runtime',
    });
  });

  it.each(REQUIRED_FRAMEWORKS)('pins %s source installs and styled packages to the current adapter version', (framework) => {
    const adapterPackage = JSON.parse(readFileSync(new URL(`../../../${framework}/package.json`, import.meta.url), 'utf8'));
    const componentsPackage = JSON.parse(readFileSync(new URL(`../../../components-${framework}/package.json`, import.meta.url), 'utf8'));
    const manifest = REGISTRY_CATALOG_PAYLOAD.artifacts[0];
    const generatedDependency = manifest.frameworks[framework].dependencies.find((dependency) => dependency.name === `@uifn/${framework}`);

    expect(generatedDependency?.version).toBe(adapterPackage.version);
    expect(componentsPackage.dependencies[`@uifn/${framework}`]).toBe(adapterPackage.version);
  });
});
