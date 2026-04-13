import { describe, expect, it } from 'vitest';
import { createRoutedStorageAdapter, getStorageCapabilities, STORAGE_TARGET_NOT_CONFIGURED } from './router.js';
import type { StorageAdapter, StorageAdapterCapabilities } from './types.js';

function makeAdapter(
  name: string,
  capabilities: StorageAdapterCapabilities,
  calls: string[],
): StorageAdapter {
  return {
    name,
    capabilities,
    async statObject({ key }) {
      calls.push(`${name}:stat:${key}`);
      return { key, size: 1 };
    },
    async deleteObject({ key }) {
      calls.push(`${name}:delete:${key}`);
    },
    async signDownloadUrl({ key }) {
      calls.push(`${name}:download:${key}`);
      return { url: `https://${name}.example/${key}` };
    },
    async createMultipartUpload({ key }) {
      calls.push(`${name}:multipart:${key}`);
      return { uploadId: `${name}-upload` };
    },
    async signMultipartUploadPartUrl({ key, partNumber }) {
      calls.push(`${name}:part:${key}:${partNumber}`);
      return { url: `https://${name}.example/${key}/parts/${partNumber}` };
    },
    async completeMultipartUpload({ key }) {
      calls.push(`${name}:complete:${key}`);
    },
    async abortMultipartUpload({ key }) {
      calls.push(`${name}:abort:${key}`);
    },
    async openUploadStream({ key }) {
      calls.push(`${name}:upload-stream:${key}`);
      return new WritableStream();
    },
    async openDownloadStream({ key }) {
      calls.push(`${name}:download-stream:${key}`);
      return new ReadableStream();
    },
  };
}

describe('createRoutedStorageAdapter', () => {
  it('routes durable and temporary targets to different physical adapters', async () => {
    const calls: string[] = [];
    const capabilities = {
      signedUploadUrls: true,
      signedDownloadUrls: true,
      multipart: true,
      proxyStreamingUpload: true,
      proxyStreamingDownload: true,
    } satisfies StorageAdapterCapabilities;

    const storage = createRoutedStorageAdapter({
      adapters: {
        durable: makeAdapter('durable-bucket', capabilities, calls),
        temporary: makeAdapter('temporary-bucket', capabilities, calls),
      },
      defaultTarget: 'durable',
    });

    await storage.createMultipartUpload?.({ key: 'files/a', target: 'durable' });
    await storage.createMultipartUpload?.({ key: 'files/b', target: 'temporary' });
    const descriptor = await storage.signDownloadUrl?.({ key: 'files/b', target: 'temporary', expiresInSeconds: 60 });

    expect(calls).toEqual([
      'durable-bucket:multipart:files/a',
      'temporary-bucket:multipart:files/b',
      'temporary-bucket:download:files/b',
    ]);
    expect(descriptor?.url).toBe('https://temporary-bucket.example/files/b');
  });

  it('computes target-specific capabilities while keeping adapter calls bucket-agnostic', () => {
    const durableCaps = {
      signedUploadUrls: true,
      signedDownloadUrls: true,
      multipart: true,
      proxyStreamingUpload: false,
      proxyStreamingDownload: true,
    } satisfies StorageAdapterCapabilities;
    const temporaryCaps = {
      signedUploadUrls: false,
      signedDownloadUrls: true,
      multipart: false,
      proxyStreamingUpload: true,
      proxyStreamingDownload: true,
    } satisfies StorageAdapterCapabilities;

    const storage = createRoutedStorageAdapter({
      adapters: {
        durable: makeAdapter('durable', durableCaps, []),
        temporary: makeAdapter('temporary', temporaryCaps, []),
      },
    });

    expect(storage.capabilities).toEqual({
      signedUploadUrls: false,
      signedDownloadUrls: true,
      multipart: false,
      proxyStreamingUpload: false,
      proxyStreamingDownload: true,
    });
    expect(getStorageCapabilities(storage, 'durable')).toEqual(durableCaps);
    expect(getStorageCapabilities(storage, 'temporary')).toEqual(temporaryCaps);
  });

  it('fails with a stable configuration error when a logical target is missing', async () => {
    const storage = createRoutedStorageAdapter({
      adapters: {
        durable: makeAdapter('durable', {
          signedUploadUrls: true,
          signedDownloadUrls: true,
          multipart: true,
          proxyStreamingUpload: true,
          proxyStreamingDownload: true,
        }, []),
      },
    });

    await expect(
      storage.signDownloadUrl?.({ key: 'files/missing', target: 'temporary', expiresInSeconds: 60 }),
    ).rejects.toMatchObject({
      code: STORAGE_TARGET_NOT_CONFIGURED,
      target: 'temporary',
    });
  });

  it('does not forward the outer target into a delegated routed adapter', async () => {
    const calls: string[] = [];
    const capabilities = {
      signedUploadUrls: true,
      signedDownloadUrls: true,
      multipart: true,
      proxyStreamingUpload: true,
      proxyStreamingDownload: true,
    } satisfies StorageAdapterCapabilities;

    const nested = createRoutedStorageAdapter({
      adapters: {
        archive: makeAdapter('archive', capabilities, calls),
      },
      defaultTarget: 'archive',
    });

    const storage = createRoutedStorageAdapter({
      adapters: {
        durable: nested,
      },
      defaultTarget: 'durable',
    });

    const descriptor = await storage.signDownloadUrl?.({
      key: 'files/nested',
      target: 'durable',
      expiresInSeconds: 60,
    });

    expect(descriptor?.url).toBe('https://archive.example/files/nested');
    expect(calls).toEqual(['archive:download:files/nested']);
  });
});
