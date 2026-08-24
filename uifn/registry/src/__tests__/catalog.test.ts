import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildRegistry } from '../build-registry';
import { checksumContent } from '../lockfile';
import { REQUIRED_FRAMEWORKS, validateDependencyGraph, validateManifest } from '../schema';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { REGISTRY_CATALOG_PAYLOAD_JSON } from '../generated/catalog';
import { verifyRegistryCatalogSignature } from '../trust';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

describe('TV-GEN-001-P/N canonical delivery catalog', () => {
  it('loads one signed 69-component catalog for all three frameworks', () => {
    const registry = buildRegistry();
    expect(registry.ok).toBe(true);
    expect(registry.trust.ok).toBe(true);
    expect(registry.artifacts).toHaveLength(69);
    expect(new Set(registry.artifacts.map((artifact) => artifact.slug))).toHaveProperty('size', 69);
    expect(registry.artifacts.every((artifact) => artifact.license === 'MIT' && artifact.sourcePolicy === 'clean-room')).toBe(true);
    expect(registry.artifacts.every((artifact) => REQUIRED_FRAMEWORKS.every((framework) => artifact.frameworks[framework].supported))).toBe(true);
  });

  it('binds every copied-source template byte-for-byte to its package source', () => {
    const registry = buildRegistry();
    let compared = 0;
    for (const artifact of registry.artifacts) {
      for (const framework of REQUIRED_FRAMEWORKS) {
        for (const file of artifact.frameworks[framework].files) {
          const packageSource = readFileSync(path.join(repoRoot, file.packageSourcePath), 'utf8');
          const template = readFileSync(path.join(repoRoot, file.templatePath), 'utf8');
          expect(template, file.templatePath).toBe(packageSource);
          expect(checksumContent(template), file.templatePath).toBe(file.outputSha256);
          compared += 1;
        }
      }
    }
    expect(compared).toBe(672);
  });

  it('fails a changed template, traversal, license, dependency cycle, and signature mutation', () => {
    const registry = buildRegistry();
    const checksumMutation = structuredClone(registry.artifacts[0]);
    checksumMutation.frameworks.react.files[0].contents += '\nmanual edit';
    expect(validateManifest(checksumMutation).errors.map((error) => error.code)).toContain('UIFN_REGISTRY_CHECKSUM_MISMATCH');

    const traversal = structuredClone(registry.artifacts[0]);
    traversal.frameworks.react.files[0].destination = '../escape.ts';
    expect(validateManifest(traversal).errors.map((error) => error.code)).toContain('UIFN_REGISTRY_PATH_ESCAPE');

    const license: any = structuredClone(registry.artifacts[0]);
    license.license = 'unknown';
    expect(validateManifest(license).errors.map((error) => error.code)).toContain('UIFN_REGISTRY_LICENSE_INVALID');

    const cycle = structuredClone(registry.artifacts.slice(0, 2));
    cycle[0].artifactDependencies = [cycle[1].slug];
    cycle[1].artifactDependencies = [cycle[0].slug];
    expect(validateDependencyGraph(cycle).errors.map((error) => error.code)).toContain('UIFN_REGISTRY_DEPENDENCY_CYCLE');

    expect(verifyRegistryCatalogSignature('tampered catalog').code).toBe('UIFN_REGISTRY_SIGNATURE_INVALID');
  });

  it('rejects a self-consistent signature from an arbitrary replacement key', () => {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    const payload = REGISTRY_CATALOG_PAYLOAD_JSON;
    const keyId = createHash('sha256')
      .update(publicKey.export({ type: 'spki', format: 'der' }))
      .digest('hex')
      .slice(0, 24);
    expect(verifyRegistryCatalogSignature(payload, {
      schemaVersion: 1,
      algorithm: 'Ed25519',
      keyId,
      catalogSha256: createHash('sha256').update(payload).digest('hex'),
      signatureBase64: sign(null, Buffer.from(payload), privateKey).toString('base64'),
    })).toMatchObject({ ok: false, code: 'UIFN_REGISTRY_SIGNATURE_INVALID' });
  });
});
