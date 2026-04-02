import type { PipelineOptions } from "./types";

export interface PipelineCompatibilityIssue {
  option: "customStages" | "stemmer";
  reason: string;
}

export interface PipelineCompatibilityResult {
  portable: boolean;
  issues: PipelineCompatibilityIssue[];
}

export function analyzePipelineCompatibility(options?: PipelineOptions): PipelineCompatibilityResult {
  const issues: PipelineCompatibilityIssue[] = [];

  if (options?.customStages && options.customStages.length > 0) {
    issues.push({
      option: "customStages",
      reason: "Custom pipeline stages run user-defined JavaScript and are not portable across all engine implementations."
    });
  }

  if (options?.stemmer) {
    issues.push({
      option: "stemmer",
      reason: "Custom stemmer implementations are JavaScript-defined and are not portable across all engine implementations."
    });
  }

  return {
    portable: issues.length === 0,
    issues
  };
}
