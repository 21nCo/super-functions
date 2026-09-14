import { LLMProvider } from '../providers/types';

export interface Fact {
  content: string;
  type: 'profile_static' | 'profile_dynamic' | 'conversational' | 'derived';
  confidence: number;
  tags: string[];
}

export class FactExtractor {
  private llm: LLMProvider;

  constructor(llm: LLMProvider) {
    this.llm = llm;
  }

  async extract(text: string): Promise<Fact[]> {
    const prompt = `
    Analyze the following text and extract discrete, atomic facts. 
    Return a JSON object with a key "facts" containing an array of objects.
    Each object should have:
    - "content": The fact as a standalone sentence.
    - "type": One of "profile_static", "profile_dynamic", "conversational".
    - "confidence": A number between 0 and 1.
    - "tags": Array of relevant keywords.

    Text: "${text}"
    `;

    const result = await this.llm.generateJSON<unknown>(prompt);
    if (!result || typeof result !== 'object' || Array.isArray(result) ||
        !('facts' in result) || !Array.isArray(result.facts)) throw new Error('MEMORY_EXTRACTION_INVALID');
    // Validate the whole batch before the pipeline embeds or persists any fact.
    return result.facts.map((fact: unknown): Fact => {
      if (!fact || typeof fact !== 'object' || Array.isArray(fact)) throw new Error('MEMORY_EXTRACTION_INVALID');
      const value = fact as Record<string, unknown>;
      if (typeof value.content !== 'string' || !value.content.trim() ||
          typeof value.type !== 'string' || !['profile_static', 'profile_dynamic', 'conversational', 'derived'].includes(value.type) ||
          typeof value.confidence !== 'number' || !Number.isFinite(value.confidence) || value.confidence < 0 || value.confidence > 1 ||
          !Array.isArray(value.tags) || !value.tags.every(tag => typeof tag === 'string' && tag.trim().length > 0)) {
        throw new Error('MEMORY_EXTRACTION_INVALID');
      }
      return { content: value.content.trim(), type: value.type as Fact['type'], confidence: value.confidence, tags: [...value.tags] };
    });
  }
}
