import type { MailFnObjectStore } from '@mailfn/core';

import type { R2Bucket } from './bindings.js';

export class R2MailFnObjectStore implements MailFnObjectStore {
  public constructor(private readonly bucket: R2Bucket) {}

  public async put(key: string, data: Uint8Array, options?: { contentType?: string; metadata?: Record<string, string> }): Promise<void> {
    await this.bucket.put(key, Uint8Array.from(data), {
      httpMetadata: { contentType: options?.contentType },
      customMetadata: options?.metadata,
    });
  }

  public async get(key: string): Promise<Uint8Array | null> {
    const object = await this.bucket.get(key);
    return object ? new Uint8Array(await object.arrayBuffer()) : null;
  }

  public delete(key: string): Promise<void> {
    return this.bucket.delete(key);
  }
}
