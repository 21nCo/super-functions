import type { DocId } from "../types";
import type { PipelineOptions, PipelineStage, PipelineContext, Token, Pipeline } from "./types";
import { buildDefaultStages } from "./stages";

export class PipelineEngine implements Pipeline {
  private readonly stages: PipelineStage[];

  constructor(options?: PipelineOptions) {
    const baseStages = buildDefaultStages({
      stopWords: options?.stopWords ? new Set(options.stopWords) : undefined,
      enableStemming: options?.enableStemming ?? false,
      language: options?.language,
      stemmer: options?.stemmer,
      enableEdgeNGrams: options?.enableEdgeNGrams ?? false,
      edgeNGramMinLength: options?.edgeNGramMinLength,
      edgeNGramMaxLength: options?.edgeNGramMaxLength,
      edgeNGramFieldConfig: options?.edgeNGramFieldConfig
    });
    this.stages = [...baseStages, ...(options?.customStages ?? [])];
  }

  run(field: string, text: string, documentId?: DocId): Token[] {
    const context: PipelineContext = {
      field,
      documentId: documentId ?? null
    };

    let tokens: Token[] = [
      {
        value: text,
        position: 0,
        field,
        documentId: documentId ?? null
      }
    ];

    for (const stage of this.stages) {
      tokens = stage.execute(tokens, context);
      if (tokens.length === 0) break;
    }

    return tokens;
  }
}

export type { PipelineOptions, PipelineStage, PipelineContext, Token, Pipeline } from "./types";
