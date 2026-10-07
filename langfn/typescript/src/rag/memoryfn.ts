import { Document, RetrievalOptions, Retriever } from "./base.js";

export interface MemoryFnClient {
  search?(query: string, options?: RetrievalOptions): Promise<Document[]> | Document[];
  retrieve?(query: string, options?: RetrievalOptions): Promise<Document[]> | Document[];
}

export class MemoryFnRetriever extends Retriever {
  constructor(private readonly client: MemoryFnClient, private readonly defaults: RetrievalOptions = {}) {
    super();
  }

  async getRelevantDocuments(query: string, options: RetrievalOptions = {}): Promise<Document[]> {
    const request = { ...this.defaults, ...options };
    const results = this.client.search
      ? await this.client.search(query, request)
      : this.client.retrieve
        ? await this.client.retrieve(query, request)
        : [];
    const k = request.k ?? 4;
    return [...results]
      .sort((left, right) => (right.score ?? 0) - (left.score ?? 0) || left.content.localeCompare(right.content))
      .slice(0, k)
      .map((document) => ({
        content: document.content,
        metadata: { ...document.metadata },
        score: document.score
      }));
  }
}
