import { Embeddings } from "./base.js";

export interface OpenAIEmbeddingsConfig {
  apiKey: string;
  model?: string;
  baseUrl?: string;
}

export class OpenAIEmbeddings extends Embeddings {
  private apiKey: string;
  private model: string;
  private baseUrl: string;

  constructor(config: OpenAIEmbeddingsConfig) {
    super();
    this.apiKey = config.apiKey;
    this.model = config.model || "text-embedding-3-small";
    this.baseUrl = config.baseUrl || "https://api.openai.com/v1";
  }

  async embedQuery(text: string): Promise<number[]> {
    const res = await this.embedDocuments([text]);
    return res[0];
  }

  async embedDocuments(texts: string[]): Promise<number[][]> {
    const response = await fetch(`${this.baseUrl}/embeddings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        input: texts,
        model: this.model
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI Embeddings Error: ${await response.text()}`);
    }

    const data = await response.json();
    return data.data
      .sort((a: any, b: any) => a.index - b.index)
      .map((item: any) => item.embedding);
  }
}
