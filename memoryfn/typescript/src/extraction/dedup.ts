import { Memory } from '../core/types';
import { StorageAdapter } from '../storage/adapter';

export class Deduplicator {
  private storage: StorageAdapter;
  private threshold: number;

  constructor(storage: StorageAdapter, threshold: number = 0.95) {
    this.storage = storage;
    this.threshold = threshold;
  }

  async findDuplicate(tenantId: string, embedding: number[], containerTags: string[]): Promise<Memory | null> {
    const results = await this.storage.searchVectors({
      tenantId,
      embedding,
      containerTags,
      threshold: this.threshold,
      topK: 1
    });

    return results.length > 0 ? results[0] : null;
  }
}
