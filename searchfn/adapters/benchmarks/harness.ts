import { performance } from "node:perf_hooks";
import type { SearchAdapter } from "../src/types";
import type { BenchmarkThresholds } from "./thresholds";

export interface BenchmarkMetrics {
  docsPerSec: number;
  searchP95Ms: number;
}

export interface BenchmarkResult {
  target: string;
  metrics: BenchmarkMetrics;
  thresholds: BenchmarkThresholds;
}

export interface BenchmarkOptions {
  docsCount?: number;
  searchIterations?: number;
}

export async function runAdapterBenchmark(
  target: string,
  adapter: SearchAdapter,
  thresholds: BenchmarkThresholds,
  options: BenchmarkOptions = {},
): Promise<BenchmarkResult> {
  const resource = `bench_${target}`;
  const docsCount = Math.max(100, options.docsCount ?? 2_000);
  const searchIterations = Math.max(5, options.searchIterations ?? 30);
  const docs = Array.from({ length: docsCount }, (_, i) => ({
    id: String(i + 1),
    fields: {
      title: `incident ${i + 1}`,
      body: `benchmark sample document ${i + 1}`,
    },
  }));

  try {
    if (adapter.initialize) {
      await adapter.initialize({
        resources: [{ name: resource, searchFields: ["title", "body"] }],
      });
    }

    await adapter.clear(resource);

    const indexStart = performance.now();
    await adapter.index({ resource, documents: docs });
    const indexElapsedMs = performance.now() - indexStart;
    const docsPerSec = (docs.length / indexElapsedMs) * 1000;

    const searchDurations: number[] = [];
    for (let i = 0; i < searchIterations; i++) {
      const start = performance.now();
      await adapter.search({ resource, query: "incident", limit: 20 });
      searchDurations.push(performance.now() - start);
    }

    searchDurations.sort((a, b) => a - b);
    const p95Index = Math.min(searchDurations.length - 1, Math.ceil(searchDurations.length * 0.95) - 1);
    const searchP95Ms = searchDurations[p95Index] ?? 0;

    return {
      target,
      metrics: {
        docsPerSec,
        searchP95Ms,
      },
      thresholds,
    };
  } finally {
    await adapter.clear(resource).catch(() => undefined);
    if (adapter.dispose) {
      await adapter.dispose().catch(() => undefined);
    }
  }
}

export function validateBenchmarkGate(result: BenchmarkResult): void {
  if (result.metrics.docsPerSec < result.thresholds.docsPerSecMin) {
    throw new Error(
      `LIMIT_EXCEEDED: Performance gate failed (${result.target}.index.docsPerSec ${result.metrics.docsPerSec.toFixed(2)} < ${result.thresholds.docsPerSecMin})`,
    );
  }
  if (result.metrics.searchP95Ms > result.thresholds.searchP95MsMax) {
    throw new Error(
      `LIMIT_EXCEEDED: Performance gate failed (${result.target}.search.p95.ms ${result.metrics.searchP95Ms.toFixed(2)} > ${result.thresholds.searchP95MsMax})`,
    );
  }
}
