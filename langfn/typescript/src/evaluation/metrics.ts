import { ValidationError } from "../core/errors.js";
import type { DatasetItem } from "./dataset.js";

export interface MetricResult {
  score: number;
  passed: boolean;
}

export interface EvaluationMetric {
  name: string;
  evaluate(output: string, expected: string, item: DatasetItem): MetricResult | boolean | number;
}

export function exactMatchMetric(): EvaluationMetric {
  return {
    name: "exact_match",
    evaluate(output, expected) {
      const passed = output.trim() === expected.trim();
      return { score: passed ? 1 : 0, passed };
    }
  };
}

export function createMetric(
  name: string,
  evaluate: EvaluationMetric["evaluate"]
): EvaluationMetric {
  if (!name.trim()) {
    throw new ValidationError("evaluation metric name must be non-empty");
  }
  return { name, evaluate };
}

export function normalizeMetricResult(result: MetricResult | boolean | number): MetricResult {
  if (typeof result === "boolean") {
    return { score: result ? 1 : 0, passed: result };
  }
  if (typeof result === "number") {
    return { score: result, passed: result >= 1 };
  }
  return result;
}
