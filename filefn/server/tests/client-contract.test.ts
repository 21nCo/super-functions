import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileFnClientContract, stringifyFileFnClientContract } from '../src/client-contract.js';

const artifactPath = new URL('../contracts/filefn-client-v1.openapi.json', import.meta.url);

describe('filefn client contract artifact', () => {
  it('TV-CONTRACT-001: checked-in artifact is deterministic and complete', () => {
    const artifactText = readFileSync(artifactPath, 'utf8');
    expect(artifactText).toBe(stringifyFileFnClientContract());

    const artifact = JSON.parse(artifactText);
    expect(artifact).toEqual(fileFnClientContract);
    expect(artifact.openapi).toBe('3.1.0');

    const requiredPaths = [
      '/',
      '/{fileId}',
      '/{fileId}/download',
      '/{fileId}/render',
      '/{fileId}/versions',
      '/{fileId}/versions/{versionId}',
      '/{fileId}/versions/{versionId}/download',
      '/upload/init',
      '/upload/{uploadSessionId}/status',
      '/upload/{uploadSessionId}/parts/{partNumber}/sign',
      '/upload/{uploadSessionId}/parts/{partNumber}',
      '/upload/{uploadSessionId}/parts/{partNumber}/complete',
      '/upload/{uploadSessionId}/complete',
      '/upload/{uploadSessionId}/abort',
      '/{fileId}/artifacts',
      '/{fileId}/artifacts/{artifactId}/download',
      '/policies',
      '/quota/storage',
      '/{fileId}/permissions',
      '/{fileId}/permissions/{permissionId}',
      '/{fileId}/share-links',
      '/{fileId}/share-links/{token}',
      '/share-links/{token}/download',
      '/{fileId}/process',
    ];
    expect(Object.keys(artifact.paths)).toEqual(requiredPaths);

    const headerParameters = artifact.components.parameters;
    expect(headerParameters.XIdempotencyKey.name).toBe('x-idempotency-key');
    expect(headerParameters.XUploadSessionToken.name).toBe('x-upload-session-token');
    expect(headerParameters.XRequestID.name).toBe('x-request-id');
    expect(headerParameters.XFileFnClientVersion.name).toBe('x-filefn-client-version');

    expect(artifact.components.schemas.SuccessEnvelope).toBeDefined();
    expect(artifact.components.schemas.ErrorEnvelope).toBeDefined();

    expect(artifact.paths['/upload/init'].post.parameters).toContainEqual({ $ref: '#/components/parameters/XIdempotencyKey' });
    expect(artifact.paths['/upload/{uploadSessionId}/status'].get.parameters).toContainEqual({ $ref: '#/components/parameters/XUploadSessionToken' });
    expect(artifact.paths['/{fileId}/share-links'].post.responses['201'].content['application/json'].schema.allOf[1].properties.data.$ref)
      .toBe('#/components/schemas/ShareLink');
    expect(artifact.paths['/{fileId}/permissions'].post.responses['201'].content['application/json'].schema.allOf[1].properties.data.$ref)
      .toBe('#/components/schemas/PermissionGrant');
    expect(artifact.paths['/share-links/{token}/download'].get.responses['200'].content['application/json'].schema.allOf[1].properties.data.$ref)
      .toBe('#/components/schemas/ShareDownloadDescriptor');
  });
});
