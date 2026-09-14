import { Memory, MemoryRelationship } from '../core/types';

export interface MemoryScope { tenantId: string; containerTags: string[] }
export interface MemoryUpdate extends MemoryScope {
  id: string;
  expectedRevision: number;
  changes: Pick<Memory, 'content' | 'embedding'> & Partial<Pick<Memory, 'metadata' | 'isLatest'>>;
}
export interface MemoryDelete extends MemoryScope { id: string; expectedRevision?: number }
export interface StorageAdapter {
  /** Fixed vector dimension, shared across bundled entrypoints. */
  readonly embeddingDimensions?: number;
  close?(): Promise<void>;
  /** Commit all callback writes together, or leave storage unchanged on failure. */
  transaction?<T>(operation: (storage: StorageAdapter) => Promise<T>): Promise<T>;
  insertMemories(memories: Partial<Memory>[]): Promise<Memory[]>;
  insertRelationships(relationships: Partial<MemoryRelationship>[]): Promise<MemoryRelationship[]>;
  searchVectors(params: {
    tenantId?: string;
    embedding: number[];
    containerTags: string[];
    filters?: Record<string, any>;
    topK: number;
    threshold?: number;
  }): Promise<Memory[]>;
  getMemory(scope: MemoryScope & { id: string }): Promise<Memory | null>;
  updateMemory(input: MemoryUpdate): Promise<Memory>;
  deleteMemory(input: MemoryDelete): Promise<void>;
}

export function requireScope(tenantId: string | undefined, tags: string[]): asserts tenantId is string {
  if (!tenantId?.trim() || !Array.isArray(tags) || tags.some(tag => typeof tag !== 'string' || !tag.trim())) {
    throw new Error('MEMORY_SCOPE_REQUIRED');
  }
}
