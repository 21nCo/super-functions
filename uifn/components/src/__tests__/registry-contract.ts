import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect } from 'vitest';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

export function verifyRegistryBatch(batch: string): void {
  const registryRoot = path.join(repoRoot, 'uifn/components/registry/components');
  const manifests = Object.values(import.meta.glob('../../registry/components/*.json', {
    eager: true,
    import: 'default',
  })) as Array<{
    batch: string;
    slug: string;
    frameworks: Record<string, { supported: boolean; entry?: string; exportName?: string }>;
    fixtures?: string[];
    stories?: string[];
  }>;
  const selected = manifests.filter((manifest) => manifest.batch === batch);
  expect(selected.length).toBeGreaterThan(0);
  expect(existsSync(registryRoot)).toBe(true);
  for (const manifest of selected) {
    for (const framework of Object.values(manifest.frameworks)) {
      if (!framework.supported) {
        expect(framework.entry).toBeUndefined();
        expect(framework.exportName).toBeUndefined();
        continue;
      }
      expect(framework.entry).toBeTruthy();
      expect(framework.exportName).toBeTruthy();
      const entry = path.join(repoRoot, framework.entry!);
      expect(existsSync(entry), framework.entry).toBe(true);
      const source = readFileSync(entry, 'utf8');
      if (!source.includes(framework.exportName!)) {
        expect(source).toContain(`/generated/${manifest.slug}`);
        const implementation = framework.entry!.includes('components-svelte')
          ? path.join(path.dirname(entry), 'generated', manifest.slug, 'index.ts')
          : path.join(path.dirname(entry), 'generated', `${manifest.slug}.ts`);
        expect(existsSync(implementation), implementation).toBe(true);
        expect(readFileSync(implementation, 'utf8')).toContain(framework.exportName!);
      }
    }
    for (const artifact of [...(manifest.fixtures ?? []), ...(manifest.stories ?? [])]) {
      expect(existsSync(path.join(repoRoot, artifact.split('#')[0])), artifact).toBe(true);
    }
  }
}
