export interface Embedder {
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
}

export interface LLMProvider {
  generate(prompt: string): Promise<string>;
  generateJSON<T>(prompt: string, schema?: any): Promise<T>;
}
