export interface Document {
  content: string;
  metadata: Record<string, unknown>;
  score?: number;
}

export interface RetrievalOptions {
  k?: number;
  filter?: Record<string, unknown>;
}

export function matchesRetrievalFilter(metadata: Record<string, unknown>, filter?: Record<string, unknown>): boolean {
  if (!filter) {
    return true;
  }
  return Object.entries(filter).every(([key, value]) => metadata[key] === value);
}

export function cosineSimilarity(left: number[], right: number[]): number {
  let dotProduct = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;
  for (let index = 0; index < left.length; index += 1) {
    dotProduct += left[index]! * right[index]!;
    leftMagnitude += left[index]! * left[index]!;
    rightMagnitude += right[index]! * right[index]!;
  }
  if (leftMagnitude === 0 || rightMagnitude === 0) {
    return 0;
  }
  return dotProduct / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
}

export abstract class Embeddings {
  abstract embedQuery(text: string): Promise<number[]>;
  abstract embedDocuments(texts: string[]): Promise<number[][]>;
}

export abstract class VectorStore {
  readonly backendType: "reference" | "production" = "reference";

  abstract addDocuments(documents: Document[]): Promise<void>;
  abstract search(query: string, options?: RetrievalOptions): Promise<Document[]>;

  asRetriever(options: RetrievalOptions = {}): Retriever {
    return new VectorStoreRetriever(this, options);
  }
}

export abstract class Retriever {
  abstract getRelevantDocuments(query: string, options?: RetrievalOptions): Promise<Document[]>;
}

export class VectorStoreRetriever extends Retriever {
  constructor(private readonly store: VectorStore, private readonly defaults: RetrievalOptions = {}) {
    super();
  }

  async getRelevantDocuments(query: string, options: RetrievalOptions = {}): Promise<Document[]> {
    return await this.store.search(query, {
      ...this.defaults,
      ...options
    });
  }
}

export interface RetrievalChainConfig {
  retriever: Retriever;
  generator?: (payload: { query: string; documents: Document[] }) => Promise<string> | string;
  lang?: { complete(prompt: string): Promise<{ content: string }> };
}

export interface RetrievalResult {
  retrieved: Document[];
  answer: string;
}

export class RetrievalChain {
  constructor(private readonly config: RetrievalChainConfig) {}

  async retrieve(query: string, options?: RetrievalOptions): Promise<Document[]> {
    return await this.config.retriever.getRelevantDocuments(query, options);
  }

  async run(query: string, options?: RetrievalOptions): Promise<RetrievalResult> {
    const documents = await this.retrieve(query, options);
    const answer = await this.generateAnswer(query, documents);
    return { retrieved: documents, answer };
  }

  private async generateAnswer(query: string, documents: Document[]): Promise<string> {
    if (this.config.generator) {
      return await this.config.generator({ query, documents });
    }
    if (this.config.lang) {
      const response = await this.config.lang.complete(
        [`Question: ${query}`, "", "Context:", ...documents.map((document) => document.content)].join("\n")
      );
      return response.content;
    }
    return documents.map((document) => document.content).join("\n");
  }
}
