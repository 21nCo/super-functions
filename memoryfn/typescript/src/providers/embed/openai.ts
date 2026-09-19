import OpenAI from 'openai';
import { Embedder } from '../types';

export class OpenAIEmbedder implements Embedder {
  private client: OpenAI;
  private model: string;
  private dims?: number;
  private batchSize: number;

  constructor(config: { apiKey: string; model?: string; dims?: number; batchSize?: number }) {
    this.client = new OpenAI({ apiKey: config.apiKey });
    this.model = config.model || 'text-embedding-3-small';
    this.dims = config.dims;
    this.batchSize = config.batchSize ?? 2048;
    if (!Number.isSafeInteger(this.batchSize) || this.batchSize < 1 || this.batchSize > 2048) {
      throw new RangeError('OpenAI embedding batchSize must be an integer between 1 and 2048');
    }
  }

  async embed(text: string): Promise<number[]> {
    const response = await this.client.embeddings.create({
      model: this.model,
      input: text,
      dimensions: this.dims
    });
    return response.data[0].embedding;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    const embeddings: number[][] = [];
    for (let offset = 0; offset < texts.length; offset += this.batchSize) {
      const batch = texts.slice(offset, offset + this.batchSize);
      const response = await this.client.embeddings.create({
        model: this.model,
        input: batch,
        dimensions: this.dims
      });
      const ordered = [...response.data].sort((left, right) => left.index - right.index);
      if (ordered.length !== batch.length || ordered.some((item, index) => item.index !== index)) {
        throw new Error('MEMORY_EMBEDDING_RESPONSE_MISMATCH');
      }
      embeddings.push(...ordered.map(item => item.embedding));
    }
    return embeddings;
  }
}
