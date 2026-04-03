import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createViewerResolver,
  resolveViewerSource,
  type FileFnClientLike,
  type RenderDescriptor,
} from '../resolver.js';

describe('@filefn/viewer', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('TV-VIEW-001: createViewerResolver returns the underlying render descriptor', async () => {
    const descriptor: RenderDescriptor = {
      fileId: 'file_pdf_1',
      versionId: 'ver_pdf_1',
      intent: 'preview',
      state: 'ready',
      mimeType: 'image/png',
      name: 'note.pdf',
      size: 120,
      source: {
        mode: 'artifact',
        artifactId: 'art_pdf_1',
        artifactKind: 'pdf-preview-page-1-large',
        url: '/proxy/files/file_pdf_1/artifacts/art_pdf_1/download',
      },
    };
    const client: FileFnClientLike = {
      resolveRenderable: vi.fn().mockResolvedValue(descriptor),
    };

    const resolver = createViewerResolver(client);
    const resolved = await resolver.resolve({
      fileId: 'file_pdf_1',
      intent: 'preview',
    });

    expect(resolved).toEqual(descriptor);
    expect(client.resolveRenderable).toHaveBeenCalledWith({
      fileId: 'file_pdf_1',
      intent: 'preview',
    });
  });

  it('TV-VIEW-002: resolveViewerSource prefers pending-local sources when provided by the client', async () => {
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', {
      revokeObjectURL,
    });

    const client: FileFnClientLike = {
      resolveRenderable: vi.fn().mockResolvedValue({
        fileId: 'file_local_pdf_1',
        versionId: 'upl_local_1',
        intent: 'preview',
        state: 'pending-local',
        mimeType: 'application/pdf',
        name: 'draft.pdf',
        size: 99,
        source: {
          mode: 'placeholder',
          placeholderKind: 'pdf-processing',
        },
      } satisfies RenderDescriptor),
    };

    const source = await resolveViewerSource({
      client,
      fileId: 'file_local_pdf_1',
      intent: 'preview',
      preferLocal: true,
    });

    expect(source).toEqual({
      fileId: 'file_local_pdf_1',
      versionId: 'upl_local_1',
      intent: 'preview',
      state: 'pending-local',
      mimeType: 'application/pdf',
      name: 'draft.pdf',
      size: 99,
      placeholderKind: 'pdf-processing',
    });
    expect(revokeObjectURL).not.toHaveBeenCalled();
  });

  it('TV-VIEW-003: attaches revoke() for local blob URLs', async () => {
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', {
      revokeObjectURL,
    });

    const client: FileFnClientLike = {
      resolveRenderable: vi.fn().mockResolvedValue({
        fileId: 'file_local_img',
        versionId: 'upl_local_img',
        intent: 'preview',
        state: 'pending-local',
        mimeType: 'image/jpeg',
        name: 'photo.jpg',
        size: 12,
        source: {
          mode: 'original',
          url: 'blob:file_local_img',
        },
      } satisfies RenderDescriptor),
    };

    const source = await resolveViewerSource({
      client,
      fileId: 'file_local_img',
      intent: 'preview',
      preferLocal: true,
    });

    expect(source.url).toBe('blob:file_local_img');
    expect(source.versionId).toBe('upl_local_img');
    expect(source.name).toBe('photo.jpg');
    expect(source.size).toBe(12);
    expect(source.revoke).toBeTypeOf('function');
    source.revoke?.();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:file_local_img');
  });

  it('TV-VIEW-004: returns unsupported placeholders deterministically for generic preview flows', async () => {
    const client: FileFnClientLike = {
      resolveRenderable: vi.fn().mockResolvedValue({
        fileId: 'file_generic_1',
        versionId: 'ver_generic_1',
        intent: 'preview',
        state: 'unsupported',
        mimeType: 'application/zip',
        name: 'bundle.zip',
        size: 45,
        source: {
          mode: 'placeholder',
          placeholderKind: 'unsupported-preview',
        },
      } satisfies RenderDescriptor),
    };

    const source = await resolveViewerSource({
      client,
      fileId: 'file_generic_1',
      intent: 'preview',
    });

    expect(source).toEqual({
      fileId: 'file_generic_1',
      versionId: 'ver_generic_1',
      intent: 'preview',
      state: 'unsupported',
      mimeType: 'application/zip',
      name: 'bundle.zip',
      size: 45,
      placeholderKind: 'unsupported-preview',
    });
  });

  it('TV-VIEW-005: preserves source headers for protected artifact URLs', async () => {
    const client: FileFnClientLike = {
      resolveRenderable: vi.fn().mockResolvedValue({
        fileId: 'file_artifact_1',
        versionId: 'ver_artifact_1',
        intent: 'preview',
        state: 'ready',
        mimeType: 'image/png',
        name: 'preview.png',
        size: 128,
        source: {
          mode: 'artifact',
          artifactId: 'artifact_1',
          artifactKind: 'pdf-preview-page-1-large',
          url: '/proxy/files/file_artifact_1/artifacts/artifact_1/download',
          headers: {
            Authorization: 'Bearer token',
          },
        },
      } satisfies RenderDescriptor),
    };

    const source = await resolveViewerSource({
      client,
      fileId: 'file_artifact_1',
      intent: 'preview',
    });

    expect(source).toEqual({
      fileId: 'file_artifact_1',
      versionId: 'ver_artifact_1',
      intent: 'preview',
      state: 'ready',
      mimeType: 'image/png',
      name: 'preview.png',
      size: 128,
      url: '/proxy/files/file_artifact_1/artifacts/artifact_1/download',
      headers: {
        Authorization: 'Bearer token',
      },
      revoke: undefined,
    });
  });
});
