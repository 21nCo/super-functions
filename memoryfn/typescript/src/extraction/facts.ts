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

    const result = await this.llm.generateJSON<{ facts: Fact[] }>(prompt);
    if (!Array.isArray(result.facts)) throw new Error('MEMORY_EXTRACTION_INVALID');
    return result.facts;
  }
}
