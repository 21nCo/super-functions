export type RenderIntent = 'thumbnail' | 'preview' | 'full' | 'download';
export type RenderState = 'ready' | 'processing' | 'pending-local' | 'unsupported';
export type RenderPlaceholderKind = 'generic-file' | 'pdf-processing' | 'unsupported-preview';

export interface RenderDescriptor {
  fileId: string;
  versionId: string;
  intent: RenderIntent;
  state: RenderState;
  mimeType: string;
  name: string;
  size: number;
  source:
    | {
        mode: 'artifact';
        artifactId: string;
        artifactKind: string;
        url: string;
        headers?: Record<string, string>;
      }
    | {
        mode: 'original';
        url: string;
        headers?: Record<string, string>;
      }
    | {
        mode: 'placeholder';
        placeholderKind: RenderPlaceholderKind;
      };
  warnings?: string[];
}

export interface FileFnClientLike {
  resolveRenderable(input: {
    fileId: string;
    intent: RenderIntent;
    versionId?: string;
    preferLocal?: boolean;
  }): Promise<RenderDescriptor>;
}

export interface ViewerResolver {
  resolve(input: {
    fileId: string;
    intent: RenderIntent;
    versionId?: string;
    preferLocal?: boolean;
  }): Promise<RenderDescriptor>;
}

export interface ViewerSource {
  fileId: string;
  versionId: string;
  intent: RenderIntent;
  state: RenderState;
  mimeType: string;
  name: string;
  size: number;
  url?: string;
  headers?: Record<string, string>;
  placeholderKind?: RenderPlaceholderKind;
  warnings?: string[];
  revoke?: () => void;
}

function createBlobRevoke(url: string): (() => void) | undefined {
  if (!url.startsWith('blob:')) {
    return undefined;
  }
  if (typeof URL === 'undefined' || typeof URL.revokeObjectURL !== 'function') {
    return undefined;
  }
  return () => {
    URL.revokeObjectURL(url);
  };
}

export function createViewerResolver(client: FileFnClientLike): ViewerResolver {
  return {
    async resolve(input) {
      return client.resolveRenderable(input);
    },
  };
}

export async function resolveViewerSource(input: {
  client: FileFnClientLike;
  fileId: string;
  intent: RenderIntent;
  versionId?: string;
  preferLocal?: boolean;
}): Promise<ViewerSource> {
  const descriptor = await input.client.resolveRenderable({
    fileId: input.fileId,
    intent: input.intent,
    versionId: input.versionId,
    preferLocal: input.preferLocal,
  });

  if (descriptor.source.mode === 'placeholder') {
    return {
      fileId: descriptor.fileId,
      versionId: descriptor.versionId,
      intent: descriptor.intent,
      state: descriptor.state,
      mimeType: descriptor.mimeType,
      name: descriptor.name,
      size: descriptor.size,
      placeholderKind: descriptor.source.placeholderKind,
      warnings: descriptor.warnings,
    };
  }

  return {
    fileId: descriptor.fileId,
    versionId: descriptor.versionId,
    intent: descriptor.intent,
    state: descriptor.state,
    mimeType: descriptor.mimeType,
    name: descriptor.name,
    size: descriptor.size,
    url: descriptor.source.url,
    headers: descriptor.source.headers,
    warnings: descriptor.warnings,
    revoke: createBlobRevoke(descriptor.source.url),
  };
}
