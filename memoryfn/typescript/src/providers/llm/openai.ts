import OpenAI from 'openai';
import { LLMProvider } from '../types';

export class OpenAILLM implements LLMProvider {
  private client: OpenAI;
  private model: string;
  private temperature: number;
  private maxTokens?: number;

  constructor(config: { apiKey: string; model?: string; temperature?: number; maxTokens?: number }) {
    this.client = new OpenAI({ apiKey: config.apiKey });
    this.model = config.model || 'gpt-4o-mini';
    this.temperature = config.temperature || 0;
    this.maxTokens = config.maxTokens;
  }

  async generate(prompt: string): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [{ role: 'user', content: prompt }],
      temperature: this.temperature,
      max_tokens: this.maxTokens,
    });
    return response.choices[0].message.content || '';
  }

  async generateJSON<T>(prompt: string, schema?: any): Promise<T> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: 'You are a helpful assistant that outputs JSON.' },
        { role: 'user', content: prompt }
      ],
      temperature: this.temperature,
      max_tokens: this.maxTokens,
      response_format: schema
        ? { type: 'json_schema', json_schema: { name: 'memoryfn_output', strict: true, schema } }
        : { type: 'json_object' }
    });

    const content = response.choices[0].message.content || '{}';
    return JSON.parse(content) as T;
  }
}
