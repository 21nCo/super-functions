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
const config = { ...DEFAULT_CONFIG, review: { ...DEFAULT_CONFIG.review, categories: ["behavior" as const] }, harness: { adapter: "fake", version: "1" }, inference: { provider: "fake", model: "fixture", auth: "none" }, context: [{ adapter: "fixture", issue: "ISS-1" }], execution: { ...DEFAULT_CONFIG.execution, adapter: "fake-execution" } };

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
it.each([null, undefined, { ...output, findings: undefined }])("writes an incomplete artifact for invalid harness output %s", async value => {
  const invalid = value as unknown as HarnessOutput;
  const store = new MemoryArtifactStore();
  const coordinator = new ReviewCoordinator({ sourceControl: new FakeSourceControlAdapter(), contexts: [new FakeContextAdapter("fixture", manifest)], harness: new FakeHarnessAdapter(invalid), execution: new FakeExecutionAdapter(), artifacts: store });
  const result = await coordinator.run({ root: ".", base: "base", head: "head", config, policy: DEFAULT_POLICY });
  expect(result.report.execution).toBe("failed"); expect(result.report.verdict).toBeUndefined(); expect(result.report.coverage).toBe("incomplete");
  expect([...store.values.keys()].some(key => key.startsWith("review-report-"))).toBe(true);
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

it("honors shorter configured retention for every artifact and test logs", async () => {
  const store = new MemoryArtifactStore(); const writes: Array<{ kind: string; days: number }> = [];
  const artifacts = { get: store.get.bind(store), deleteExpired: store.deleteExpired.bind(store), put: async (kind: string, content: string | Uint8Array, days: number) => { writes.push({ kind, days }); return store.put(kind, content); } };
  const execution = new FakeExecutionAdapter(); let testLogDays = 0;
  execution.run = async (_root, _head, _commands, policy) => { testLogDays = policy.retention.testLogDays; return []; };
  const coordinator = new ReviewCoordinator({ sourceControl: new FakeSourceControlAdapter(), contexts: [new FakeContextAdapter("fixture", manifest)], harness: new FakeHarnessAdapter({ ...output, transcript: "observed" }), execution, artifacts });
  await coordinator.run({ root: ".", base: "base", head: "head", config: { ...config, retainTranscript: true, retention: { reportDays: 3, transcriptDays: 1, testLogDays: 2 } }, policy: DEFAULT_POLICY });
  expect(writes).toHaveLength(4); expect(writes.map(item => item.days)).toEqual([3, 3, 1, 3]); expect(writes[2].kind).toBe("redacted-transcript"); expect(testLogDays).toBe(2);
});

it("keeps finding identity stable when coordinator redaction secrets differ", async () => {
  const finding = { fingerprint: "from-harness", severity: "high" as const, category: "behavior", title: "private-example-secret bug", trigger: "input", impact: "wrong", direction: "fix", requirementIds: ["R1"], evidenceIds: ["E1"], lifecycle: "new" as const, basis: "inferred" as const };
  const run = async () => new ReviewCoordinator({ sourceControl: new FakeSourceControlAdapter(), contexts: [new FakeContextAdapter("fixture", manifest)], harness: new FakeHarnessAdapter({ ...output, findings: [finding] }), execution: new FakeExecutionAdapter(), artifacts: new MemoryArtifactStore() }).run({ root: ".", base: "base", head: "head", config, policy: DEFAULT_POLICY });
  const original = process.env.REVIEWFN_TEST_SECRET;
  try {
    delete process.env.REVIEWFN_TEST_SECRET; const first = await run();
    process.env.REVIEWFN_TEST_SECRET = "private-example-secret"; const second = await run();
    expect(first.report.findings[0].fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(first.report.findings[0].fingerprint).not.toBe("from-harness");
    expect(second.report.findings[0].fingerprint).toBe(first.report.findings[0].fingerprint);
    expect(second.report.findings[0].title).not.toContain("private-example-secret");
  } finally { if (original === undefined) delete process.env.REVIEWFN_TEST_SECRET; else process.env.REVIEWFN_TEST_SECRET = original; }
});

it.each([[80, 90, 17, 19], [8, 9, 8, 9]])("records effective execution limits for config %s/%s", async (timeoutMs, maxOutputBytes, expectedTimeout, expectedBytes) => {
  const execution = new FakeExecutionAdapter(); let limits;
  execution.run = async (_root, _head, _commands, policy) => { limits = policy.limits; return []; };
  const coordinator = new ReviewCoordinator({ sourceControl: new FakeSourceControlAdapter(), contexts: [new FakeContextAdapter("fixture", manifest)], harness: new FakeHarnessAdapter(output), execution, artifacts: new MemoryArtifactStore() });
  const result = await coordinator.run({ root: ".", base: "base", head: "head", config: { ...config, execution: { ...config.execution, timeoutMs, maxOutputBytes } }, policy: { ...DEFAULT_POLICY, limits: { ...DEFAULT_POLICY.limits, testTimeoutMs: 17, maxOutputBytes: 19 } } });
  expect(limits).toMatchObject({ testTimeoutMs: expectedTimeout, maxOutputBytes: expectedBytes }); expect(result.report.configuration.execution).toMatchObject({ timeoutMs: expectedTimeout, maxOutputBytes: expectedBytes });
});

it("keeps omitted configured categories incomplete even when policy does not require them", async () => {
  const coordinator = new ReviewCoordinator({ sourceControl: new FakeSourceControlAdapter(), contexts: [new FakeContextAdapter("fixture", manifest)], harness: new FakeHarnessAdapter(output), execution: new FakeExecutionAdapter(), artifacts: new MemoryArtifactStore() });
  const result = await coordinator.run({ root: ".", base: "base", head: "head", config: { ...config, review: { ...config.review, categories: ["behavior", "documentation"] } }, policy: { ...DEFAULT_POLICY, requiredCategories: ["behavior"] } });
  expect(result.report.configuration.reviewCategories).toEqual(["behavior", "documentation"]);
  expect(result.report.coverageReasons.join()).toMatch(/category documentation/);
  expect(result.report.verdict).toBe("needs_verification");
});

it.each(["api-key", "chatgpt", "action-proxy"])("checks PR authentication before review (%s)", async auth => {
  const harness = new FakeHarnessAdapter(output);
  const coordinator = new ReviewCoordinator({ sourceControl: new FakeSourceControlAdapter(), contexts: [new FakeContextAdapter("fixture", manifest)], harness: { capabilities: { ...harness.capabilities, id: "codex" }, preflight: harness.preflight.bind(harness), run: harness.run.bind(harness) }, execution: new FakeExecutionAdapter(), artifacts: new MemoryArtifactStore() });
  const diagnostics = await coordinator.preflight({ root: ".", base: "base", head: "head", pullRequest: 177, config: { ...config, inference: { ...config.inference, auth } }, policy: DEFAULT_POLICY });
  expect(diagnostics.some(item => item.code === "REVIEWFN_PR_AUTH_REQUIRED")).toBe(auth !== "action-proxy");
});
