import type { StorageAdapter, StorageAdapterCapabilities } from './types.js';

export interface ConformanceResult {
  ok: boolean;
  error?: {
    code: string;
    message: string;
  };
  passed: string[];
  failed: string[];
}

export interface ConformanceTestContext {
  testKey: string;
  testData: Uint8Array;
  testContentType: string;
}

function createDefaultContext(): ConformanceTestContext {
  return {
    testKey: `conformance-test-${Date.now()}`,
    testData: new Uint8Array([1, 2, 3, 4]),
    testContentType: 'application/octet-stream',
  };
}

export async function runConformanceTests(
  adapter: StorageAdapter,
  _ctx: ConformanceTestContext = createDefaultContext()
): Promise<ConformanceResult> {
  const passed: string[] = [];
  const failed: string[] = [];

  // Check required methods exist
  if (typeof adapter.statObject !== 'function') {
    return {
      ok: false,
      error: { code: 'ADAPTER_CONFORMANCE_FAILED', message: 'statObject method is required' },
      passed,
      failed: ['statObject-exists'],
    };
  }
  passed.push('statObject-exists');

  if (typeof adapter.deleteObject !== 'function') {
    return {
      ok: false,
      error: { code: 'ADAPTER_CONFORMANCE_FAILED', message: 'deleteObject method is required' },
      passed,
      failed: ['deleteObject-exists'],
    };
  }
  passed.push('deleteObject-exists');

  // Validate capabilities match implemented methods
  const caps = adapter.capabilities;

  // Check multipart capability
  if (caps.multipart) {
    if (typeof adapter.createMultipartUpload !== 'function') {
      return {
        ok: false,
        error: { code: 'ADAPTER_CONFORMANCE_FAILED', message: 'multipart capability requires createMultipartUpload' },
        passed,
        failed: ['multipart-createMultipartUpload'],
      };
    }
    passed.push('multipart-createMultipartUpload');

    if (typeof adapter.signMultipartUploadPartUrl !== 'function') {
      return {
        ok: false,
        error: { code: 'ADAPTER_CONFORMANCE_FAILED', message: 'multipart capability requires signMultipartUploadPartUrl' },
        passed,
        failed: ['multipart-signMultipartUploadPartUrl'],
      };
    }
    passed.push('multipart-signMultipartUploadPartUrl');

    if (typeof adapter.completeMultipartUpload !== 'function') {
      return {
        ok: false,
        error: { code: 'ADAPTER_CONFORMANCE_FAILED', message: 'multipart capability requires completeMultipartUpload' },
        passed,
        failed: ['multipart-completeMultipartUpload'],
      };
    }
    passed.push('multipart-completeMultipartUpload');

    if (typeof adapter.abortMultipartUpload !== 'function') {
      return {
        ok: false,
        error: { code: 'ADAPTER_CONFORMANCE_FAILED', message: 'multipart capability requires abortMultipartUpload' },
        passed,
        failed: ['multipart-abortMultipartUpload'],
      };
    }
    passed.push('multipart-abortMultipartUpload');
  }

  // Check signedUploadUrls capability
  if (caps.signedUploadUrls) {
    if (typeof adapter.signUploadUrl !== 'function') {
      return {
        ok: false,
        error: { code: 'ADAPTER_CONFORMANCE_FAILED', message: 'signedUploadUrls capability requires signUploadUrl' },
        passed,
        failed: ['signedUploadUrls-signUploadUrl'],
      };
    }
    passed.push('signedUploadUrls-signUploadUrl');
  }

  // Check signedDownloadUrls capability
  if (caps.signedDownloadUrls) {
    if (typeof adapter.signDownloadUrl !== 'function') {
      return {
        ok: false,
        error: { code: 'ADAPTER_CONFORMANCE_FAILED', message: 'signedDownloadUrls capability requires signDownloadUrl' },
        passed,
        failed: ['signedDownloadUrls-signDownloadUrl'],
      };
    }
    passed.push('signedDownloadUrls-signDownloadUrl');
  }

  // Check proxyStreamingUpload capability
  if (caps.proxyStreamingUpload) {
    if (typeof adapter.openUploadStream !== 'function') {
      return {
        ok: false,
        error: { code: 'ADAPTER_CONFORMANCE_FAILED', message: 'proxyStreamingUpload capability requires openUploadStream' },
        passed,
        failed: ['proxyStreamingUpload-openUploadStream'],
      };
    }
    passed.push('proxyStreamingUpload-openUploadStream');
  }

  // Check proxyStreamingDownload capability
  if (caps.proxyStreamingDownload) {
    if (typeof adapter.openDownloadStream !== 'function') {
      return {
        ok: false,
        error: { code: 'ADAPTER_CONFORMANCE_FAILED', message: 'proxyStreamingDownload capability requires openDownloadStream' },
        passed,
        failed: ['proxyStreamingDownload-openDownloadStream'],
      };
    }
    passed.push('proxyStreamingDownload-openDownloadStream');
  }

  return { ok: true, passed, failed };
}

export function validateCapabilities(capabilities: StorageAdapterCapabilities): ConformanceResult {
  const passed: string[] = [];
  const failed: string[] = [];

  // At least one upload mode must be supported
  if (!capabilities.signedUploadUrls && !capabilities.proxyStreamingUpload) {
    return {
      ok: false,
      error: { code: 'ADAPTER_CONFORMANCE_FAILED', message: 'Adapter must support at least one upload mode (signedUploadUrls or proxyStreamingUpload)' },
      passed,
      failed: ['upload-mode-available'],
    };
  }
  passed.push('upload-mode-available');

  // At least one download mode must be supported
  if (!capabilities.signedDownloadUrls && !capabilities.proxyStreamingDownload) {
    return {
      ok: false,
      error: { code: 'ADAPTER_CONFORMANCE_FAILED', message: 'Adapter must support at least one download mode (signedDownloadUrls or proxyStreamingDownload)' },
      passed,
      failed: ['download-mode-available'],
    };
  }
  passed.push('download-mode-available');

  return { ok: true, passed, failed };
}

export function createFakeStorageAdapter(
  overrides: Partial<StorageAdapter> & { capabilities: StorageAdapterCapabilities }
): StorageAdapter {
  const base: StorageAdapter = {
    name: 'fake',
    capabilities: overrides.capabilities,
    async statObject(input) {
      return { key: input.key, size: 1024 };
    },
    async deleteObject(_input) {
      // no-op
    },
  };

  // Add optional methods based on capabilities
  if (overrides.capabilities.signedUploadUrls) {
    base.signUploadUrl = async (input) => ({
      url: `https://fake.storage/upload/${input.key}`,
    });
  }

  if (overrides.capabilities.signedDownloadUrls) {
    base.signDownloadUrl = async (input) => ({
      url: `https://fake.storage/download/${input.key}`,
    });
  }

  if (overrides.capabilities.multipart) {
    base.createMultipartUpload = async (_input) => ({ uploadId: 'fake-upload-id' });
    base.signMultipartUploadPartUrl = async (input) => ({
      url: `https://fake.storage/upload/${input.uploadId}/part/${input.partNumber}`,
    });
    base.completeMultipartUpload = async (_input) => {};
    base.abortMultipartUpload = async (_input) => {};
  }

  if (overrides.capabilities.proxyStreamingUpload) {
    base.openUploadStream = async (_input) => new WritableStream();
  }

  if (overrides.capabilities.proxyStreamingDownload) {
    base.openDownloadStream = async (_input) => new ReadableStream();
  }

  return { ...base, ...overrides };
}
