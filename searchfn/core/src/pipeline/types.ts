import type { DocId } from "../types";

export interface Token {
  value: string;
  position: number;
  field: string;
  documentId: DocId | null;
  metadata?: Record<string, unknown>;
}

export interface PipelineContext {
  field: string;
  documentId: DocId | null;
}

export interface PipelineStage {
  name: string;
  execute(tokens: Token[], context: PipelineContext): Token[];
}

export interface Stemmer {
  stem(token: string): string;
}

export interface EdgeNGramFieldConfig {
  enabled: boolean;
  minLength?: number;
  maxLength?: number;
}

export interface PipelineOptions {
  enableStemming?: boolean;
  stopWords?: Iterable<string>;
  customStages?: PipelineStage[];
  language?: string;
  stemmer?: Stemmer;
  enableEdgeNGrams?: boolean;
  edgeNGramMinLength?: number;
  edgeNGramMaxLength?: number;
  edgeNGramFieldConfig?: Record<string, EdgeNGramFieldConfig>;
}

export interface Pipeline {
  run(field: string, text: string, documentId?: DocId): Token[];
}
