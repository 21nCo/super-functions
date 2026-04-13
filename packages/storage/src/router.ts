import type {
  StorageAdapter,
  StorageAdapterCapabilities,
  StorageAdapterName,
  StorageTargetName,
} from './types.js';

export const STORAGE_TARGET_NOT_CONFIGURED = 'FILEFN_STORAGE_TARGET_NOT_CONFIGURED';

export class StorageRoutingError extends Error {
  readonly code = STORAGE_TARGET_NOT_CONFIGURED;
  readonly target: string;

  constructor(target: string) {
    super(`Storage target '${target}' is not configured`);
    this.name = 'StorageRoutingError';
    this.target = target;
  }
}

export interface RoutedStorageAdapter extends StorageAdapter {
  readonly defaultTarget: StorageTargetName;
  readonly targets: StorageTargetName[];
}

export interface RoutedStorageAdapterConfig {
  adapters: Record<StorageTargetName, StorageAdapter>;
  defaultTarget?: StorageTargetName;
  name?: StorageAdapterName;
}

function withoutDelegatedTarget<T extends { target?: StorageTargetName }>(
  input: T,
): Omit<T, 'target'> {
  const { target: _target, ...delegatedInput } = input;
  return delegatedInput;
}

function mergeCapabilities(adapters: StorageAdapter[]): StorageAdapterCapabilities {
  return {
    signedUploadUrls: adapters.every((adapter) => adapter.capabilities.signedUploadUrls),
    signedDownloadUrls: adapters.every((adapter) => adapter.capabilities.signedDownloadUrls),
    multipart: adapters.every((adapter) => adapter.capabilities.multipart),
    proxyStreamingUpload: adapters.every((adapter) => adapter.capabilities.proxyStreamingUpload),
    proxyStreamingDownload: adapters.every((adapter) => adapter.capabilities.proxyStreamingDownload),
  };
}

function pickAdapter(
  adapters: Map<StorageTargetName, StorageAdapter>,
  defaultTarget: StorageTargetName,
  target?: StorageTargetName,
): { adapter: StorageAdapter; target: StorageTargetName } {
  const resolvedTarget = target ?? defaultTarget;
  const adapter = adapters.get(resolvedTarget);
  if (!adapter) {
    throw new StorageRoutingError(resolvedTarget);
  }
  return { adapter, target: resolvedTarget };
}

export function getStorageCapabilities(
  adapter: StorageAdapter,
  target?: StorageTargetName,
): StorageAdapterCapabilities {
  if (target && typeof adapter.capabilitiesForTarget === 'function') {
    return adapter.capabilitiesForTarget(target);
  }
  return adapter.capabilities;
}

export function createRoutedStorageAdapter(config: RoutedStorageAdapterConfig): RoutedStorageAdapter {
  const targets = Object.keys(config.adapters);
  if (targets.length === 0) {
    throw new Error('createRoutedStorageAdapter requires at least one target adapter');
  }

  const defaultTarget = config.defaultTarget ?? targets[0];
  const adapterEntries = new Map<StorageTargetName, StorageAdapter>(Object.entries(config.adapters));
  if (!adapterEntries.has(defaultTarget)) {
    throw new StorageRoutingError(defaultTarget);
  }

  const capabilities = mergeCapabilities(Array.from(adapterEntries.values()));

  return {
    name: config.name ?? 'routed',
    capabilities,
    defaultTarget,
    targets,
    capabilitiesForTarget(target) {
      return pickAdapter(adapterEntries, defaultTarget, target).adapter.capabilities;
    },
    async statObject(input) {
      const { adapter } = pickAdapter(adapterEntries, defaultTarget, input.target);
      return adapter.statObject(withoutDelegatedTarget(input));
    },
    async deleteObject(input) {
      const { adapter } = pickAdapter(adapterEntries, defaultTarget, input.target);
      return adapter.deleteObject(withoutDelegatedTarget(input));
    },
    async signUploadUrl(input) {
      const { adapter, target } = pickAdapter(adapterEntries, defaultTarget, input.target);
      if (!adapter.signUploadUrl) {
        throw new Error(`Storage target '${target}' does not support signed upload URLs`);
      }
      return adapter.signUploadUrl(withoutDelegatedTarget(input));
    },
    async signDownloadUrl(input) {
      const { adapter, target } = pickAdapter(adapterEntries, defaultTarget, input.target);
      if (!adapter.signDownloadUrl) {
        throw new Error(`Storage target '${target}' does not support signed download URLs`);
      }
      return adapter.signDownloadUrl(withoutDelegatedTarget(input));
    },
    async createMultipartUpload(input) {
      const { adapter, target } = pickAdapter(adapterEntries, defaultTarget, input.target);
      if (!adapter.createMultipartUpload) {
        throw new Error(`Storage target '${target}' does not support multipart uploads`);
      }
      return adapter.createMultipartUpload(withoutDelegatedTarget(input));
    },
    async signMultipartUploadPartUrl(input) {
      const { adapter, target } = pickAdapter(adapterEntries, defaultTarget, input.target);
      if (!adapter.signMultipartUploadPartUrl) {
        throw new Error(`Storage target '${target}' does not support multipart uploads`);
      }
      return adapter.signMultipartUploadPartUrl(withoutDelegatedTarget(input));
    },
    async completeMultipartUpload(input) {
      const { adapter, target } = pickAdapter(adapterEntries, defaultTarget, input.target);
      if (!adapter.completeMultipartUpload) {
        throw new Error(`Storage target '${target}' does not support multipart uploads`);
      }
      return adapter.completeMultipartUpload(withoutDelegatedTarget(input));
    },
    async abortMultipartUpload(input) {
      const { adapter, target } = pickAdapter(adapterEntries, defaultTarget, input.target);
      if (!adapter.abortMultipartUpload) {
        throw new Error(`Storage target '${target}' does not support multipart uploads`);
      }
      return adapter.abortMultipartUpload(withoutDelegatedTarget(input));
    },
    async openUploadStream(input) {
      const { adapter, target } = pickAdapter(adapterEntries, defaultTarget, input.target);
      if (!adapter.openUploadStream) {
        throw new Error(`Storage target '${target}' does not support proxy streaming uploads`);
      }
      return adapter.openUploadStream(withoutDelegatedTarget(input));
    },
    async openDownloadStream(input) {
      const { adapter, target } = pickAdapter(adapterEntries, defaultTarget, input.target);
      if (!adapter.openDownloadStream) {
        throw new Error(`Storage target '${target}' does not support proxy streaming downloads`);
      }
      return adapter.openDownloadStream(withoutDelegatedTarget(input));
    },
  };
}
