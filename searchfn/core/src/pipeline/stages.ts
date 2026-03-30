import type { PipelineStage, PipelineContext, Token, Stemmer } from "./types";
import { STOP_WORDS_EN, STOP_WORDS_ES, STOP_WORDS_FR } from "./stop-words";
import { EnglishStemmer, NoOpStemmer } from "./stemmers";
import { createEdgeNGramStage } from "./stages/edge-ngram-stage";

const TOKEN_REGEX = /[\p{L}\p{N}]+/gu;

const normalizeStage: PipelineStage = {
  name: "normalize",
  execute(tokens: Token[], context: PipelineContext): Token[] {
    void context;
    return tokens.map((token) => ({
      ...token,
      value: token.value.toLowerCase()
    }));
  }
};

const tokenizeStage: PipelineStage = {
  name: "tokenize",
  execute(tokens: Token[], context: PipelineContext): Token[] {
    if (tokens.length !== 1) {
      throw new Error("Tokenize stage expects a single seed token containing raw text");
    }
    const [seed] = tokens;
    const matches = seed.value.matchAll(TOKEN_REGEX);
    const generated: Token[] = [];
    for (const match of matches) {
      if (!match[0]) continue;
      generated.push({
        value: match[0],
        position: match.index ?? generated.length,
        field: context.field,
        documentId: context.documentId ?? null
      });
    }
    return generated;
  }
};

export function createStopWordStage(stopWords: Set<string>): PipelineStage {
  return {
    name: "stopWords",
    execute(tokens: Token[], context: PipelineContext): Token[] {
      void context;
      if (stopWords.size === 0) return tokens;
      return tokens.filter((token) => !stopWords.has(token.value));
    }
  };
}

export function createStemStage(stemmer: import("./types").Stemmer): PipelineStage {
  return {
    name: "stem",
    execute(tokens: Token[], context: PipelineContext): Token[] {
      void context;
      return tokens.map((token) => ({
        ...token,
        value: stemmer.stem(token.value)
      }));
    }
  };
}

interface BuildStagesOptions {
  stopWords?: Set<string>;
  enableStemming?: boolean;
  stemmer?: Stemmer;
  language?: string;
  enableEdgeNGrams?: boolean;
  edgeNGramMinLength?: number;
  edgeNGramMaxLength?: number;
  edgeNGramFieldConfig?: Record<string, import("./types").EdgeNGramFieldConfig>;
}

function getStopWordsForLanguage(language?: string): Set<string> {
  switch (language?.toLowerCase()) {
    case 'es':
    case 'spanish':
      return STOP_WORDS_ES;
    case 'fr':
    case 'french':
      return STOP_WORDS_FR;
    case 'en':
    case 'english':
    default:
      return STOP_WORDS_EN;
  }
}

function getStemmerForLanguage(language?: string): Stemmer {
  switch (language?.toLowerCase()) {
    case 'en':
    case 'english':
      return new EnglishStemmer();
    case 'es':
    case 'spanish':
    case 'fr':
    case 'french':
      // For now, use NoOpStemmer for non-English languages
      // TODO: Integrate proper Spanish/French stemmers
      return new NoOpStemmer();
    default:
      return new EnglishStemmer();
  }
}

export function buildDefaultStages(options?: BuildStagesOptions): PipelineStage[] {
  const stages: PipelineStage[] = [tokenizeStage, normalizeStage];

  // Stop words: explicit > language-based > default (English)
  const stopWordSet = options?.stopWords ?? getStopWordsForLanguage(options?.language);
  stages.push(createStopWordStage(stopWordSet));

  // Stemming: only if explicitly enabled or stemmer provided
  if (options?.enableStemming || options?.stemmer) {
    const stemmer = options?.stemmer ?? getStemmerForLanguage(options?.language);
    stages.push(createStemStage(stemmer));
  }

  // Edge N-Grams: enabled globally or per-field
  if (options?.enableEdgeNGrams || options?.edgeNGramFieldConfig) {
    const minLength = options.edgeNGramMinLength ?? 2;
    const maxLength = Math.max(options.edgeNGramMaxLength ?? 15, minLength);
    stages.push(createEdgeNGramStage({ 
      minGram: minLength, 
      maxGram: maxLength,
      fieldConfig: options.edgeNGramFieldConfig
    }));
  }

  return stages;
}
