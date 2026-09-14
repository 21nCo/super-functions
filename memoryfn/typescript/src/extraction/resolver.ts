import { LLMProvider } from '../providers/types';
import { Memory, RelationType } from '../core/types';

export interface ResolutionResult {
  type: RelationType | 'none';
  reasoning: string;
}

export class ConflictResolver {
  private llm: LLMProvider;

  constructor(llm: LLMProvider) {
    this.llm = llm;
  }

  async resolve(newFact: string, existingMemory: Memory): Promise<ResolutionResult> {
    const prompt = `
    Compare the following two pieces of information and determine their relationship.
    
    Existing Fact: "${existingMemory.content}"
    New Fact: "${newFact}"
    
    Determine if the New Fact:
    - "updates": Supersedes the Existing Fact (e.g., "I live in NY" vs "I moved to SF").
    - "extends": Adds detail to the Existing Fact without conflict.
    - "contradicts": Directly conflicts with the Existing Fact (e.g., "I like red" vs "I hate red").
    - "none": No direct relationship or unrelated.
    
    Return JSON:
    {
      "type": "updates" | "extends" | "contradicts" | "none",
      "reasoning": "Short explanation"
    }
    `;

    const result = await this.llm.generateJSON<ResolutionResult>(prompt);
    if (!result || !['updates', 'extends', 'contradicts', 'none'].includes(result.type) || typeof result.reasoning !== 'string') {
      throw new Error('MEMORY_RESOLUTION_INVALID');
    }
    return result;
  }
}
