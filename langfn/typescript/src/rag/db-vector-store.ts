import { Adapter, WhereClause } from "@superfunctions/db";
import { NonProductionBackendError } from "../core/errors.js";
import { cosineSimilarity, Document, Embeddings, matchesRetrievalFilter, RetrievalOptions, VectorStore } from "./base.js";

export interface DocumentRecord {
  id: string;
  content: string;
  embedding: number[];
  metadata: Record<string, unknown>;
  namespace: string;
  createdAt: number;
  score?: number;
}

export interface DbVectorStoreOptions {
  namespace?: string;
  mode?: "reference" | "production";
  pageSize?: number;
  maxScan?: number;
  indexedSearch?: (payload: {
    query: string;
    k: number;
    filter?: Record<string, unknown>;
    namespace: string;
    queryEmbedding: number[];
  }) => Promise<DocumentRecord[]>;
}

/**
 * Reference DB vector store. This fallback is intentionally non-production unless an indexed search callback is supplied.
 */
export class DbVectorStore extends VectorStore {
  readonly backendType: "reference" | "production";
  private readonly tableName = "langfn_documents";
  private readonly namespace: string;
  private readonly pageSize: number;
  private readonly maxScan: number;
  private readonly indexedSearch?: DbVectorStoreOptions["indexedSearch"];

  constructor(
    private readonly db: Adapter,
    private readonly embeddings: Embeddings,
    options: DbVectorStoreOptions = {}
  ) {
    super();
    this.namespace = options.namespace ?? "default";
    this.backendType = options.mode ?? "reference";
    this.pageSize = Math.max(1, options.pageSize ?? 64);
    this.maxScan = Math.max(this.pageSize, options.maxScan ?? 512);
    this.indexedSearch = options.indexedSearch;
  }

  async addDocuments(documents: Document[]): Promise<void> {
    const texts = documents.map((document) => document.content);
    const vectors = await this.embeddings.embedDocuments(texts);
    const records: DocumentRecord[] = documents.map((document, index) => ({
      id: `doc_${crypto.randomUUID()}`,
      content: document.content,
      embedding: vectors[index]!,
      metadata: { ...document.metadata },
      namespace: this.namespace,
      createdAt: Date.now()
    }));
    await this.db.createMany({
      model: this.tableName,
      data: records
    });
  }

  async search(query: string, options: RetrievalOptions = {}): Promise<Document[]> {
    const k = options.k ?? 4;
    const queryEmbedding = await this.embeddings.embedQuery(query);
    const records = this.indexedSearch
      ? await this.indexedSearch({
          query,
          k,
          filter: options.filter,
          namespace: this.namespace,
          queryEmbedding
        })
      : await this.referenceSearch(queryEmbedding, options, k);

    return records
      .slice(0, k)
      .map((record) => ({
        content: record.content,
        metadata: { ...record.metadata },
        score: record.score
      }));
  }

  private async referenceSearch(
    queryEmbedding: number[],
    options: RetrievalOptions,
    k: number
  ): Promise<DocumentRecord[]> {
    if (this.backendType === "production") {
      throw new NonProductionBackendError("Production retrieval requires adapter-native indexed search or memoryfn", {
        metadata: { backend: "db-vector-store" }
      });
    }

    const where: WhereClause[] = [{ field: "namespace", operator: "eq", value: this.namespace }];
    const scored: DocumentRecord[] = [];
    let offset = 0;

    while (offset < this.maxScan) {
      const limit = Math.min(this.pageSize, this.maxScan - offset);
      const records = await this.db.findMany<DocumentRecord>({
        model: this.tableName,
        where,
        limit,
        offset
      });
      if (!records.length) {
        break;
      }

      records.forEach((record, index) => {
        if (!matchesRetrievalFilter(record.metadata ?? {}, options.filter)) {
          return;
        }
        scored.push({
          ...record,
          score: cosineSimilarity(queryEmbedding, record.embedding),
          createdAt: record.createdAt ?? offset + index
        });
      });

      offset += records.length;
      if (records.length < limit) {
        break;
      }
    }

    return scored
      .sort((left, right) => (right.score ?? 0) - (left.score ?? 0) || left.createdAt - right.createdAt)
      .slice(0, Math.max(k, 1));
  }
}
