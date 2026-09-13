import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, DEFAULT_POLICY, ReviewCoordinator, type HarnessOutput } from "@superfunctions/reviewfn-core";
import { FakeContextAdapter, FakeExecutionAdapter, FakeHarnessAdapter, FakePublisher, FakeSourceControlAdapter, MemoryArtifactStore } from "../src/index.js";

const manifest = { version: 1 as const, sources: [{ id: "issue:1", type: "issue" as const, retrievedAt: "2026-01-01T00:00:00.000Z", digest: "d".repeat(64), status: "available" as const, content: "must return value" }], selection: { candidates: ["ISS-1"], selected: ["issue:1"], rule: "explicit" }, limits: { maxSources: 10, maxBytes: 1000, maxDepth: 2 }, incompleteReasons: [] };
const output: HarnessOutput = {
  terminal: "completed",
  requirements: [{ id: "R1", statement: "Return value", sources: [{ sourceId: "issue:1", anchor: "L1" }], category: "behavior", scope: "api", classification: "mandatory", dependencies: [], extraction: { harness: "fake", promptDigest: "prompt" } }],
  assessments: [{ requirementId: "R1", status: "implemented", evidenceIds: ["E1"], reasoning: "present", gaps: [], confidence: 1 }],
  evidence: [{ id: "E1", kind: "code", description: "value", code: { commit: "b".repeat(40), path: "src/value.ts", startLine: 1 } }],
  findings: [], inspectedPaths: ["src/value.ts"], uninspected: [], events: [],
};
const config = { ...DEFAULT_CONFIG, harness: { adapter: "fake", version: "1" }, inference: { provider: "fake", model: "fixture", auth: "none" }, context: [{ adapter: "fixture", issue: "ISS-1" }], execution: { ...DEFAULT_CONFIG.execution, adapter: "fake-execution" } };

describe("ReviewCoordinator", () => {
  it("publishes a validated exact-head report", async () => {
    const publisher = new FakePublisher();
    const coordinator = new ReviewCoordinator({ sourceControl: new FakeSourceControlAdapter(), contexts: [new FakeContextAdapter("fixture", manifest)], harness: new FakeHarnessAdapter(output), execution: new FakeExecutionAdapter(), artifacts: new MemoryArtifactStore(), publishers: [publisher] });
    const result = await coordinator.run({ root: ".", base: "base", head: "head", config, policy: { ...DEFAULT_POLICY, requiredCategories: ["behavior"] }, issue: "ISS-1" });
    expect(result.report.verdict).toBe("ready");
    expect(result.report.contextManifestArtifact).toMatch(/^context-manifest-/);
    expect(result.publications[0].status).toBe("published");
    expect(publisher.requests).toHaveLength(1);
  });
  it("does not publish when head changed", async () => {
    const source = new FakeSourceControlAdapter(); source.current = "c".repeat(40);
    const publisher = new FakePublisher();
    const coordinator = new ReviewCoordinator({ sourceControl: source, contexts: [new FakeContextAdapter("fixture", manifest)], harness: new FakeHarnessAdapter(output), execution: new FakeExecutionAdapter(), artifacts: new MemoryArtifactStore(), publishers: [publisher] });
    const result = await coordinator.run({ root: ".", base: "base", head: "head", config, policy: { ...DEFAULT_POLICY, requiredCategories: ["behavior"] } });
    expect(result.publications[0].status).toBe("stale");
    expect(publisher.requests).toHaveLength(0);
  });
  it("cannot turn quota exhaustion into a verdict", async () => {
    const failed = { ...output, terminal: "quota_exhausted" as const, requirements: [], assessments: [], evidence: [], findings: [], inspectedPaths: [], uninspected: [{ scope: "review", reason: "quota" }], error: "quota" };
    const coordinator = new ReviewCoordinator({ sourceControl: new FakeSourceControlAdapter(), contexts: [new FakeContextAdapter("fixture", manifest)], harness: new FakeHarnessAdapter(failed), execution: new FakeExecutionAdapter(), artifacts: new MemoryArtifactStore() });
    const result = await coordinator.run({ root: ".", base: "base", head: "head", config, policy: { ...DEFAULT_POLICY, requiredCategories: ["behavior"] } });
    expect(result.report.execution).toBe("failed");
    expect(result.report.coverage).toBe("incomplete");
    expect(result.report.verdict).toBeUndefined();
  });
});

it("retains local output and continues publishers after publication failure", async () => {
  const store = new MemoryArtifactStore(); const publisher = new FakePublisher();
  const failed = { id: "failed", preflight: async () => ({ ok: true, diagnostics: [] }), publish: async () => { throw new Error("429 retry later"); } };
  const coordinator = new ReviewCoordinator({ sourceControl: new FakeSourceControlAdapter(), contexts: [new FakeContextAdapter("fixture", manifest)], harness: new FakeHarnessAdapter(output), execution: new FakeExecutionAdapter(), artifacts: store, publishers: [failed, publisher] });
  const result = await coordinator.run({ root: ".", base: "base", head: "head", config, policy: { ...DEFAULT_POLICY, requiredCategories: ["behavior"] } });
  expect(result.publications.map(item => item.status)).toEqual(["failed", "published"]);
  expect([...store.values.keys()].some(key => key.startsWith("review-report-"))).toBe(true);
});
it("never publishes after cancellation during inference", async () => {
  const controller = new AbortController(); const publisher = new FakePublisher(); const harness = new FakeHarnessAdapter(output);
  harness.run = async () => { controller.abort(); return structuredClone(output); };
  const coordinator = new ReviewCoordinator({ sourceControl: new FakeSourceControlAdapter(), contexts: [new FakeContextAdapter("fixture", manifest)], harness, execution: new FakeExecutionAdapter(), artifacts: new MemoryArtifactStore(), publishers: [publisher] });
  const result = await coordinator.run({ root: ".", base: "base", head: "head", config, policy: DEFAULT_POLICY, signal: controller.signal });
  expect(result.report.execution).toBe("canceled"); expect(result.report.verdict).toBeUndefined(); expect(publisher.requests).toHaveLength(0);
});
it("writes an incomplete artifact for structurally invalid harness output", async () => {
  const invalid = { ...output, findings: undefined } as unknown as HarnessOutput;
  const coordinator = new ReviewCoordinator({ sourceControl: new FakeSourceControlAdapter(), contexts: [new FakeContextAdapter("fixture", manifest)], harness: new FakeHarnessAdapter(invalid), execution: new FakeExecutionAdapter(), artifacts: new MemoryArtifactStore() });
  const result = await coordinator.run({ root: ".", base: "base", head: "head", config, policy: DEFAULT_POLICY });
  expect(result.report.execution).toBe("failed"); expect(result.report.verdict).toBeUndefined(); expect(result.report.coverage).toBe("incomplete");
});
it("uses content identity across attempts with different collection timestamps", async () => {
  const source = new FakeSourceControlAdapter(); const capture = source.capture.bind(source); let counter = 0;
  source.capture = async () => ({ ...await capture(), capturedAt: String(counter++) });
  const coordinator = new ReviewCoordinator({ sourceControl: source, contexts: [new FakeContextAdapter("fixture", manifest)], harness: new FakeHarnessAdapter(output), execution: new FakeExecutionAdapter(), artifacts: new MemoryArtifactStore() });
  const request = { root: ".", base: "base", head: "head", config, policy: DEFAULT_POLICY };
  const a = await coordinator.run(request); const b = await coordinator.run(request);
  expect(a.report.runId).toBe(b.report.runId); expect(a.report.attemptId).not.toBe(b.report.attemptId);
});

it("keeps configured test failures incomplete even when the model omits their receipts", async () => {
  const execution = new FakeExecutionAdapter([{ id: "failed-test", command: ["node", "test.js"], cwd: ".", commit: "b".repeat(40), startedAt: "now", finishedAt: "now", runtimeMs: 1, exitCode: 1, signal: null, timedOut: false, canceled: false, stdoutDigest: "d", stderrDigest: "e", limitations: [] }]);
  const coordinator = new ReviewCoordinator({ sourceControl: new FakeSourceControlAdapter(), contexts: [new FakeContextAdapter("fixture", manifest)], harness: new FakeHarnessAdapter(output), execution, artifacts: new MemoryArtifactStore() });
  const result = await coordinator.run({ root: ".", base: "base", head: "head", config, policy: { ...DEFAULT_POLICY, requiredCategories: ["behavior"] } });
  expect(result.report.coverage).toBe("incomplete"); expect(result.report.verdict).toBe("needs_verification"); expect(result.report.coverageReasons.join()).toMatch(/did not pass/);
});
