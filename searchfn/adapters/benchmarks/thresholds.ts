export interface BenchmarkThresholds {
  docsPerSecMin: number;
  searchP95MsMax: number;
}

export const BENCHMARK_THRESHOLDS: Record<string, BenchmarkThresholds> = {
  memory: {
    docsPerSecMin: 50_000,
    searchP95MsMax: 20,
  },
  indexeddb: {
    docsPerSecMin: 5_000,
    searchP95MsMax: 40,
  },
  postgres: {
    docsPerSecMin: 1_000,
    searchP95MsMax: 120,
  },
};
