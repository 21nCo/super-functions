import { getTransportClient, type TransportClient } from "../models/transport.js";
import { raiseForStatus } from "../models/openai.js";
import { NotConfiguredError } from "../core/errors.js";
import { Embeddings } from "./base.js";

export interface OpenAIEmbeddingsConfig {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  timeout?: number;
  transport?: () => TransportClient;
}

export class OpenAIEmbeddings extends Embeddings {
  private readonly transport: () => TransportClient;
  private model: string;
  private baseUrl: string;

  constructor(config: OpenAIEmbeddingsConfig) {
    super();
    this.transport = config.transport ?? (() => {
      if (!config.apiKey) throw new NotConfiguredError("OpenAI API key is required");
      return getTransportClient({ baseUrl: this.baseUrl, timeout: config.timeout ?? 60_000, fetchImpl: config.fetchImpl, headers: { authorization: `Bearer ${config.apiKey}`, "content-type": "application/json" } });
    });
    this.model = config.model || "text-embedding-3-small";
    this.baseUrl = config.baseUrl || "https://api.openai.com/v1";
  }

  async embedQuery(text: string): Promise<number[]> {
    const res = await this.embedDocuments([text]);
    return res[0];
  }

  async embedDocuments(texts: string[]): Promise<number[][]> {
    const response = await this.transport().request("/embeddings", {
      method: "POST",
      body: JSON.stringify({
        input: texts,
        model: this.model
      })
    });

    await raiseForStatus("openai", response);

    const data = await response.json();
    return data.data
      .sort((a: any, b: any) => a.index - b.index)
      .map((item: any) => item.embedding);
  }
}
