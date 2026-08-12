import { randomUUID } from "node:crypto";
import type { RequestResult, RunReport } from "./types.js";

export function buildRunReport(input: {
  collectionName: string;
  environment: string;
  startedAt: string;
  completedAt: string;
  results: RequestResult[];
}): RunReport {
  const started = new Date(input.startedAt).getTime();
  const completed = new Date(input.completedAt).getTime();
  const duration = Math.max(0, completed - started);

  const summary = {
    total: input.results.length,
    passed: input.results.filter((r) => r.status === "passed").length,
    failed: input.results.filter((r) => r.status === "failed").length,
    skipped: input.results.filter((r) => r.status === "skipped").length,
    errors: input.results.filter((r) => r.status === "error").length,
    duration,
  };

  return {
    id: randomUUID(),
    collectionName: input.collectionName,
    environment: input.environment,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    duration,
    results: input.results,
    summary,
  };
}
