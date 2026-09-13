import { LangFn } from "../client.js";
import { ValidationError } from "../core/errors.js";
import { EvaluationDataset, type DatasetItem } from "./dataset.js";
import { exactMatchMetric, normalizeMetricResult, type EvaluationMetric, type MetricResult } from "./metrics.js";

export interface EvaluationItemResult {
  id: string;
  input: string;
  expected: string;
  output: string;
  passed: boolean;
  score: number;
  latency: number;
  traceId?: string | null;
  metrics: Record<string, MetricResult>;
}

export interface TestFnExportPayload {
  id: string;
  timestamp: number;
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    duration: number;
  };
  results: Array<{
    id: string;
    status: "passed" | "failed";
    duration: number;
    metadata: Record<string, unknown>;
  }>;
  metadata: Record<string, unknown>;
}

export class EvaluationResult {
  constructor(
    readonly accuracy: number,
    readonly avgLatency: number,
    readonly totalCost: number,
    readonly results: EvaluationItemResult[]
  ) {}

  get passRate(): number {
    return this.accuracy;
  }

  get avgScore(): number {
    if (!this.results.length) {
      return 0;
    }
    return this.results.reduce((total, item) => total + item.score, 0) / this.results.length;
  }

  toTestFnRun(modelName = "langfn-eval"): TestFnExportPayload {
    const passed = this.results.filter((item) => item.passed).length;
    return {
      id: `langfn-eval-${modelName}`,
      timestamp: Date.now(),
      summary: {
        total: this.results.length,
        passed,
        failed: this.results.length - passed,
        skipped: 0,
        duration: this.results.reduce((total, item) => total + item.latency, 0)
      },
      results: this.results.map((item) => ({
        id: item.id,
        status: item.passed ? "passed" : "failed",
        duration: item.latency,
        metadata: {
          input: item.input,
          expected: item.expected,
          output: item.output,
          metrics: item.metrics,
          traceId: item.traceId ?? null
        }
      })),
      metadata: {
        accuracy: this.accuracy,
        avgLatency: this.avgLatency,
        totalCost: this.totalCost
      }
    };
  }
}

export interface CompareModelEntry {
  name: string;
  lang: LangFn;
}

export interface EvaluationCompareResult {
  accuracy: number;
  perModel: Record<string, EvaluationResult>;
  bestModel: string | null;
  testfnExported: boolean;
}

export interface EvaluateOptions {
  lang: LangFn;
  dataset: DatasetItem[];
  metrics?: EvaluationMetric[];
  exportHook?: (payload: TestFnExportPayload) => Promise<void> | void;
  modelName?: string;
}

export interface CompareOptions {
  models: CompareModelEntry[];
  dataset: DatasetItem[];
  metrics?: EvaluationMetric[];
  exportHook?: (payload: TestFnExportPayload) => Promise<void> | void;
}

export class Evaluator {
  private readonly lang?: LangFn;

  constructor(options: { lang?: LangFn } = {}) {
    this.lang = options.lang;
  }

  async evaluate(options: EvaluateOptions): Promise<EvaluationResult> {
    const dataset = EvaluationDataset.from(options.dataset);
    const metrics = options.metrics?.length ? options.metrics : [exactMatchMetric()];
    const results: EvaluationItemResult[] = [];
    let totalLatency = 0;
    let totalCost = 0;

    for (const item of dataset.items) {
      const start = Date.now();
      const response = await options.lang.complete(item.input);
      const latency = Date.now() - start;
      const output = response.content;
      const metricResults = Object.fromEntries(
        metrics.map((metric) => [metric.name, normalizeMetricResult(metric.evaluate(output, item.expected, item))])
      );
      const primary = metricResults[metrics[0].name];
      results.push({
        id: item.id!,
        input: item.input,
        expected: item.expected,
        output,
        passed: primary.passed,
        score: primary.score,
        latency,
        traceId: response.traceId ?? response.trace_id ?? null,
        metrics: metricResults
      });
      totalLatency += latency;
      totalCost += response.cost?.total ?? 0;
    }

    const evaluation = new EvaluationResult(
      results.reduce((total, item) => total + item.score, 0) / results.length,
      totalLatency / results.length,
      totalCost,
      results
    );

    if (options.exportHook) {
      await options.exportHook(evaluation.toTestFnRun(options.modelName));
    }

    return evaluation;
  }

  async run(
    dataset: DatasetItem[],
    options: {
      lang?: LangFn;
      metrics?: EvaluationMetric[];
      exportHook?: (payload: TestFnExportPayload) => Promise<void> | void;
      modelName?: string;
    } = {}
  ): Promise<EvaluationResult> {
    const lang = options.lang ?? this.lang;
    if (!lang) {
      throw new ValidationError("Evaluator requires a LangFn instance");
    }
    return await this.evaluate({
      lang,
      dataset,
      metrics: options.metrics,
      exportHook: options.exportHook,
      modelName: options.modelName
    });
  }

  async compare(options: CompareOptions): Promise<EvaluationCompareResult> {
    if (!options.models.length) {
      throw new ValidationError("compare() requires at least one model");
    }

    const perModel: Record<string, EvaluationResult> = {};
    for (const model of options.models) {
      perModel[model.name] = await this.evaluate({
        lang: model.lang,
        dataset: options.dataset,
        metrics: options.metrics,
        exportHook: options.exportHook,
        modelName: model.name
      });
    }

    const ordered = Object.entries(perModel).sort((left, right) => right[1].accuracy - left[1].accuracy);
    return {
      accuracy: ordered.reduce((total, [, result]) => total + result.accuracy, 0) / ordered.length,
      perModel,
      bestModel: ordered[0]?.[0] ?? null,
      testfnExported: Boolean(options.exportHook)
    };
  }
}
