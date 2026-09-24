import type { Memory, MemoryRelationship } from '../../core/types';
import { requireScope, type StorageAdapter, type MemoryScope, type MemoryUpdate, type MemoryDelete, type MemoryInsert, type MemoryRelationshipInsert } from '../adapter';

/** Reads through to the parent and stages only changed keys. */
class StagedMap<K, V> extends Map<K, V> {
  readonly writes = new Map<K, V>();
  readonly removed = new Set<K>();
  constructor(private readonly parent: Map<K, V>) { super(); }
  get(key: K): V | undefined { return this.removed.has(key) ? undefined : this.writes.has(key) ? this.writes.get(key) : this.parent.get(key); }
  has(key: K): boolean { return !this.removed.has(key) && (this.writes.has(key) || this.parent.has(key)); }
  set(key: K, value: V): this { this.removed.delete(key); this.writes.set(key, value); return this; }
  delete(key: K): boolean { const existed = this.has(key); this.writes.delete(key); this.removed.add(key); return existed; }
  *entries(): IterableIterator<[K, V]> {
    for (const [key, value] of this.parent) if (!this.removed.has(key) && !this.writes.has(key)) yield [key, value];
    yield* this.writes;
  }
  *values(): IterableIterator<V> { for (const [, value] of this.entries()) yield value; }
  [Symbol.iterator](): IterableIterator<[K, V]> { return this.entries(); }
  commit(): void {
    for (const key of this.removed) this.parent.delete(key);
    for (const [key, value] of this.writes) this.parent.set(key, value);
  }
}

function cloneMemory(memory: Memory): Memory {
  return {
    ...memory,
    containerTags: [...memory.containerTags],
    embedding: memory.embedding ? [...memory.embedding] : null,
    metadata: structuredClone(memory.metadata),
  };
}

function cloneRelationship(relationship: MemoryRelationship): MemoryRelationship {
  return { ...relationship };
}

function cosineSimilarity(left: number[], right: number[]): number {
  if (left.length === 0 || left.length !== right.length) return Number.NEGATIVE_INFINITY;
  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;
  for (let index = 0; index < left.length; index += 1) {
    const leftValue = left[index] ?? 0;
    const rightValue = right[index] ?? 0;
    dot += leftValue * rightValue;
    leftMagnitude += leftValue * leftValue;
    rightMagnitude += rightValue * rightValue;
  }
  if (leftMagnitude === 0 || rightMagnitude === 0) return 0;
  return dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
}

function metadataMatches(
  metadata: Record<string, unknown>,
  filters: Record<string, unknown> | undefined,
): boolean {
  if (!filters) return true;
  return Object.entries(filters).every(([key, value]) => jsonContains(metadata[key], value));
}

function jsonContains(actual: unknown, expected: unknown): boolean {
  if (Array.isArray(expected)) {
    return Array.isArray(actual)
      && expected.every((candidate) => actual.some((value) => jsonContains(value, candidate)));
  }
  if (expected && typeof expected === 'object') {
    if (!actual || typeof actual !== 'object' || Array.isArray(actual)) return false;
    return Object.entries(expected as Record<string, unknown>)
      .every(([key, value]) => jsonContains((actual as Record<string, unknown>)[key], value));
  }
  return Object.is(actual, expected);
}

/**
 * A process-local StorageAdapter for self-hosted development and tests. It
 * preserves records for the lifetime of this adapter instance and applies the
 * same tag-overlap and metadata-filter semantics as the Postgres adapter. Use
 * the Postgres adapter when storage must survive process restarts.
 */
export class MemoryStorageAdapter implements StorageAdapter {
  private memories = new Map<string, Memory>();
  private relationships = new Map<string, MemoryRelationship>();
  private sequence = 0;
  private mutationVersion = 0;

  async transaction<T>(operation: (storage: StorageAdapter) => Promise<T>): Promise<T> {
    const version = this.mutationVersion;
    const staged = new MemoryStorageAdapter();
    const memories = new StagedMap(this.memories);
    const relationships = new StagedMap(this.relationships);
    staged.memories = memories; staged.relationships = relationships;
    staged.sequence = this.sequence;
    const result = await operation(staged);
    if (this.mutationVersion !== version) throw new Error('MEMORY_REVISION_CONFLICT');
    memories.commit(); relationships.commit();
    this.sequence = staged.sequence;
    if (memories.writes.size || memories.removed.size || relationships.writes.size || relationships.removed.size) this.mutationVersion++;

    return result;
  }

  async insertMemories(inputs: MemoryInsert[]): Promise<Memory[]> {
    if (!inputs.length) return [];
    const now = Date.now();
    const saved = inputs.map((input) => {
      requireScope(input.tenantId, input.containerTags);
      const memory: Memory = {
        id: input.id ?? `memory-${now}-${++this.sequence}`,
        tenantId: input.tenantId,
        revision: 1,
        deletedAt: null,
        containerTags: [...input.containerTags],
        type: input.type ?? 'conversational',
        content: input.content ?? '',
        embedding: input.embedding ? [...input.embedding] : null,
        metadata: structuredClone(input.metadata ?? {}),
        isLatest: input.isLatest ?? true,
        createdAt: input.createdAt ?? now,
        updatedAt: input.updatedAt ?? now,
      };
      return memory;
    });
    const ids = new Set<string>();
    for (const memory of saved) {
      if (ids.has(memory.id) || this.memories.has(memory.id)) {
        throw new Error(`Memory already exists: ${memory.id}`);
      }
      ids.add(memory.id);
    }
    this.mutationVersion++;
    for (const memory of saved) this.memories.set(memory.id, cloneMemory(memory));
    return saved.map(cloneMemory);
  }

  async insertRelationships(inputs: MemoryRelationshipInsert[]): Promise<MemoryRelationship[]> {
    if (!inputs.length) return [];
    const now = Date.now();
    const saved = inputs.map((input) => {
      requireScope(input.tenantId, input.containerTags);
      const from = this.memories.get(input.fromId);
      const to = this.memories.get(input.toId);
      const inScope = (memory: Memory | undefined) => memory
        && !memory.deletedAt
        && memory.tenantId === input.tenantId
        && input.containerTags.every(tag => memory.containerTags.includes(tag));
      if (!inScope(from) || !inScope(to)) throw new Error("MEMORY_RELATION_SCOPE_INVALID");
      const relationship: MemoryRelationship = {
        id: input.id ?? `relationship-${now}-${++this.sequence}`,
        fromId: input.fromId,
        toId: input.toId,
        type: input.type ?? 'extends',
        confidence: input.confidence ?? 1,
        ...(input.reasoning === undefined ? {} : { reasoning: input.reasoning }),
        createdAt: input.createdAt ?? now,
      };
      return relationship;
    });
    const ids = new Set<string>();
    for (const relationship of saved) {
      if (ids.has(relationship.id) || this.relationships.has(relationship.id)) throw new Error("MEMORY_RELATION_EXISTS");
      ids.add(relationship.id);
    }
    this.mutationVersion++;
    for (const relationship of saved) this.relationships.set(relationship.id, cloneRelationship(relationship));
    return saved.map(cloneRelationship);
  }

  async searchVectors(params: {
    tenantId: string;
    embedding: number[];
    containerTags: string[];
    filters?: Record<string, unknown>;
    topK: number;
    threshold?: number;
  }): Promise<Memory[]> {
    requireScope(params.tenantId, params.containerTags);
    const requestedTags = new Set(params.containerTags);
    return [...this.memories.values()]
      .filter((memory) => (
        memory.tenantId === params.tenantId
        && memory.deletedAt == null && memory.isLatest
        && ([...requestedTags].every(tag => memory.containerTags.includes(tag)))
        && metadataMatches(memory.metadata, params.filters)
      ))
      .map((memory) => ({
        memory,
        similarity: memory.embedding ? cosineSimilarity(params.embedding, memory.embedding) : 0,
      }))
      .filter(({ similarity }) => Number.isFinite(similarity) && (params.threshold === undefined || similarity >= params.threshold))
      .sort((left, right) => right.similarity - left.similarity || right.memory.updatedAt - left.memory.updatedAt)
      .slice(0, Math.max(0, params.topK))
      .map(({ memory }) => cloneMemory(memory));
  }
  async getMemory(scope: MemoryScope & { id: string }): Promise<Memory | null> {
    requireScope(scope.tenantId, scope.containerTags);
    const memory = this.memories.get(scope.id);
    return memory && memory.deletedAt == null && memory.tenantId === scope.tenantId
      && scope.containerTags.every(tag => memory.containerTags.includes(tag)) ? cloneMemory(memory) : null;
  }

  async updateMemory(input: MemoryUpdate): Promise<Memory> {
    const memory = await this.getMemory(input);
    if (!memory) throw new Error('MEMORY_NOT_FOUND');
    // Recheck after the await: two competing revisions cannot both win.
    const current = this.memories.get(input.id)!;
    if (current.deletedAt != null || current.revision !== input.expectedRevision) throw new Error('MEMORY_REVISION_CONFLICT');
    const updated = cloneMemory({ ...current, ...input.changes, metadata: input.changes.metadata ?? current.metadata, isLatest: input.changes.isLatest ?? current.isLatest, id: current.id, tenantId: current.tenantId,
      containerTags: current.containerTags, revision: current.revision! + 1, updatedAt: Date.now() });
    this.mutationVersion++;
    this.memories.set(updated.id, updated);
    return cloneMemory(updated);
  }

  async deleteMemory(input: MemoryDelete): Promise<void> {
    requireScope(input.tenantId, input.containerTags);
    const current = this.memories.get(input.id);
    if (!current || current.tenantId !== input.tenantId || !input.containerTags.every(tag => current.containerTags.includes(tag))) throw new Error('MEMORY_NOT_FOUND');
    if (current.deletedAt != null) return;
    if (input.expectedRevision !== undefined && current.revision !== input.expectedRevision) throw new Error('MEMORY_REVISION_CONFLICT');
    this.mutationVersion++;
    this.memories.set(input.id, { ...current, content: '', embedding: null, metadata: {}, isLatest: false,
      deletedAt: Date.now(), updatedAt: Date.now(), revision: current.revision! + 1 });
    for (const [id, relation] of this.relationships) {
      if (relation.fromId === input.id || relation.toId === input.id) this.relationships.delete(id);
    }
  }

}
