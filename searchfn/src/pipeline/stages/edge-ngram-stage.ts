import type { PipelineStage, PipelineContext, Token } from "../types";

export interface EdgeNGramMetadata {
  isPrefix: boolean;
  originalTerm: string;
}

export interface EdgeNGramOptions {
  minGram: number;
  maxGram: number;
  fieldConfig?: Record<string, {
    enabled: boolean;
    minLength?: number;
    maxLength?: number;
  }>;
}

/**
 * Edge N-Gram Stage
 * 
 * Generates all prefixes of tokens from minGram to maxGram length.
 * Used for prefix matching and autocomplete functionality.
 * 
 * Example: "anthropic" with minGram=2, maxGram=15 generates:
 * ["an", "ant", "anth", "anthr", "anthro", "anthrop", "anthropi", "anthropic"]
 * 
 * @param options Configuration for n-gram generation
 */
export function createEdgeNGramStage(options: EdgeNGramOptions): PipelineStage {
  const { minGram, maxGram, fieldConfig } = options;

  return {
    name: "edgeNGram",
    execute(tokens: Token[], context: PipelineContext): Token[] {
      // Check if n-grams should be generated for this field
      if (fieldConfig) {
        const config = fieldConfig[context.field];
        if (!config || !config.enabled) {
          // Field not configured or disabled, return original tokens
          return tokens;
        }
        // Use field-specific min/max if provided
        const fieldMinGram = config.minLength ?? minGram;
        const fieldMaxGram = config.maxLength ?? maxGram;
        return generateNGrams(tokens, fieldMinGram, fieldMaxGram);
      }
      
      // Global configuration
      return generateNGrams(tokens, minGram, maxGram);
    }
  };
}

function generateNGrams(tokens: Token[], minGram: number, maxGram: number): Token[] {
  const result: Token[] = [];

  for (const token of tokens) {
    const term = token.value;

    // Skip terms shorter than minGram
    if (term.length < minGram) {
      result.push(token);
      continue;
    }

    // Generate all prefixes from minGram to min(term.length, maxGram)
    const maxLength = Math.min(term.length, maxGram);

    for (let i = minGram; i <= maxLength; i++) {
      const prefix = term.substring(0, i);
      const isPrefix = i < term.length;

      result.push({
        ...token,
        value: prefix,
        // Store metadata for scoring and debugging
        // This will be serialized with the token
        metadata: {
          ...token.metadata,
          isPrefix,
          originalTerm: term
        } as EdgeNGramMetadata
      });
    }
  }

  return result;
}
