import { cosineSimilarity, Document, Embeddings, matchesRetrievalFilter, RetrievalOptions, VectorStore } from "./base.js";

/**
 * Reference-only vector store for local examples and tests.
 * This backend is intentionally non-production and uses application-side reranking.
 */
export class InMemoryVectorStore extends VectorStore {
  readonly backendType = "reference" as const;
  private readonly documents: Array<Document & { _index: number }> = [];
  private readonly vectors: number[][] = [];

  constructor(private readonly embeddings: Embeddings) {
    super();
  }

  async addDocuments(documents: Document[]): Promise<void> {
    const texts = documents.map((document) => document.content);
    const vectors = await this.embeddings.embedDocuments(texts);
    documents.forEach((document, index) => {
      this.documents.push({ ...document, _index: this.documents.length + index });
    });
    this.vectors.push(...vectors);
  }

  async search(query: string, options: RetrievalOptions = {}): Promise<Document[]> {
    const k = options.k ?? 4;
    const queryVector = await this.embeddings.embedQuery(query);
    const scored: Array<{ score: number; document: Document & { _index: number } }> = [];

    this.documents.forEach((document, index) => {
      if (!matchesRetrievalFilter(document.metadata, options.filter)) {
        return;
      }
      scored.push({
        score: cosineSimilarity(queryVector, this.vectors[index]!),
        document
      });
    });

    return scored
      .sort((left, right) => right.score - left.score || left.document._index - right.document._index)
      .slice(0, k)
      .map(({ score, document }) => ({
        content: document.content,
        metadata: { ...document.metadata },
        score
      }));
  }
}
