import { MemoryFnConfig, IMemoryFn } from './config';
import { AddMemoryInput, AddMemoryResult, SearchMemoryInput, SearchMemoryResult, Memory, MemoryRelationship } from './types';
import { requireScope, type StorageAdapter, type MemoryScope, type MemoryDelete } from '../storage/adapter';
import { Embedder, LLMProvider } from '../providers/types';
import { FactExtractor } from '../extraction/facts';
import { Deduplicator } from '../extraction/dedup';
import { ConflictResolver } from '../extraction/resolver';

export class MemoryFn implements IMemoryFn {
  private storage: StorageAdapter;
  private embedder?: Embedder;
  private llm?: LLMProvider;
  private extractor?: FactExtractor;
  private deduplicator: Deduplicator;
  private resolver?: ConflictResolver;

  constructor(_config: MemoryFnConfig, storage: StorageAdapter, embedder?: Embedder, llm?: LLMProvider) {
    this.storage = storage;
    this.embedder = embedder;
    this.llm = llm;
    if (this.llm) {
      this.extractor = new FactExtractor(this.llm);
      this.resolver = new ConflictResolver(this.llm);
    }
    this.deduplicator = new Deduplicator(this.storage, 0.95);
  }

  async add(input: AddMemoryInput): Promise<AddMemoryResult> {
    requireScope(input.tenantId, input.containerTags);
    const content = input.content ?? input.messages?.map(message => `${message.role}: ${message.content}`).join('\n') ?? '';
    if (!content.trim()) throw new Error('MEMORY_CONTENT_REQUIRED');
    const facts = this.extractor ? await this.extractor.extract(content) : [{ content, type: input.type ?? 'conversational', tags: [], confidence: 1 }];
    const embeddings = this.embedder ? await this.embedder.embedBatch(facts.map(fact => fact.content)) : [];
    if (this.embedder && embeddings.length !== facts.length) throw new Error('MEMORY_EMBEDDING_COUNT_MISMATCH');
    const saved: Memory[] = [];
    const relationships: MemoryRelationship[] = [];
    let deduplicated = 0;
    let updated = 0;
    for (let i = 0; i < facts.length; i++) {
      const fact = facts[i];
      // Model-generated tags are descriptive metadata, never authority or scope.
      const tags = [...input.containerTags];
      const embedding = embeddings[i] ?? null;
      if (embedding && await this.deduplicator.findDuplicate(input.tenantId!, embedding, tags)) { deduplicated++; continue; }
      const related = embedding && this.resolver ? await this.storage.searchVectors({ tenantId: input.tenantId, containerTags: tags, embedding, threshold: 0.75, topK: 3 }) : [];
      const resolutions = this.resolver ? await Promise.all(related.map(async memory => ({ memory, resolution: await this.resolver!.resolve(fact.content, memory) }))) : [];
      const [memory] = await this.storage.insertMemories([{
        tenantId: input.tenantId, containerTags: tags, content: fact.content, type: fact.type,
        embedding, metadata: { ...input.metadata, extractedTags: fact.tags, confidence: fact.confidence }, isLatest: true,
      }]);
      saved.push(memory);
      for (const { memory: existing, resolution } of resolutions) {
        if (resolution.type === 'none') continue;
        if (resolution.type === 'updates') {
          await this.storage.updateMemory({ tenantId: input.tenantId!, containerTags: tags, id: existing.id,
            expectedRevision: existing.revision ?? 1,
            changes: { content: existing.content, embedding: existing.embedding, isLatest: false } });
          updated++;
        }
        relationships.push(...await this.storage.insertRelationships([{
          fromId: memory.id, toId: existing.id, type: resolution.type, confidence: 1, reasoning: resolution.reasoning,
        }]));
      }
    }
    return { memories: saved, relationships, summary: { created: saved.length, updated, deduplicated } };
  }

  async close(): Promise<void> { await this.storage.close?.(); }

  async update(input: MemoryScope & { id: string; expectedRevision: number; content: string; metadata?: Record<string, unknown> }): Promise<Memory> {
    const current = await this.storage.getMemory(input);
    if (!current) throw new Error('MEMORY_NOT_FOUND');
    const embedding = this.embedder ? await this.embedder.embed(input.content) : null;
    return this.storage.updateMemory({ ...input, changes: { content: input.content, embedding, ...(input.metadata === undefined ? {} : { metadata: input.metadata }) } });
  }

  async forget(input: MemoryDelete): Promise<void> { await this.storage.deleteMemory(input); }

  async search(input: SearchMemoryInput): Promise<SearchMemoryResult> {
    requireScope(input.tenantId, input.containerTags);
    // 1. Process query (embed)
    let embedding: number[] = [];
    if (this.embedder) {
        embedding = await this.embedder.embed(input.q);
    } else {
        // Deterministic zero vector for storage adapters that support lexical or
        // metadata-only fallback search without a configured embedder.
        console.warn('No embedder configured, search results may be invalid for vector search');
        embedding = new Array(1536).fill(0);
    }

    // 2. Vector search
    const results = await this.storage.searchVectors({
      tenantId: input.tenantId!,
      embedding,
      containerTags: input.containerTags,
      filters: input.filters,
      topK: input.limit || 10,
      threshold: input.threshold
    });

    return {
      results,
      metadata: {
        totalFound: results.length,
        returned: results.length
      }
    };
  }
}
