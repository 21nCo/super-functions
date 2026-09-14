import OpenAI from 'openai';
import { Embedder } from '../types';

export class OpenAIEmbedder implements Embedder {
  private client: OpenAI;
  private model: string;
  private dims?: number;

  constructor(config: { apiKey: string; model?: string; dims?: number }) {
    this.client = new OpenAI({ apiKey: config.apiKey });
    this.model = config.model || 'text-embedding-3-small';
    this.dims = config.dims;
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
    // OpenAI batch size limits apply, for now simple implementation
    const response = await this.client.embeddings.create({
      model: this.model,
      input: texts,
      dimensions: this.dims
    });
    return response.data.map(d => d.embedding);
  }
}
