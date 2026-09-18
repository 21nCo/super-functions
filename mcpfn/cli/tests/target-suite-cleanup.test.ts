import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  attempts: 0,
  failure: undefined as import("@mcpfn/testing").McpFnTargetSuiteCleanupError | undefined,
}));

vi.mock("@mcpfn/testing", async importOriginal => {
  const actual = await importOriginal<typeof import("@mcpfn/testing")>();
  return {
    ...actual,
    runMcpFnTargetSuite: async () => {
      const report: import("@mcpfn/testing").McpFnTargetSuiteReport = {
        formatVersion: 1,
        kind: "mcpfn.target-suite-report",
        status: "incomplete",
        runtime: {
          node: process.versions.node,
          scenarioFormatVersion: 1,
          reportSchemaVersion: "1",
          packages: { testing: "0.0.5" },
        },
        ok: false,
        target: { kind: "custom" },
        manifestChecked: false,
        total: 0,
        passed: 0,
        failed: 0,
        incomplete: 0,
        droppedResults: 0,
        droppedObservedEvents: 0,
        timeline: [],
        droppedTimelineEvents: 0,
        results: [],
        incompleteReason: "Target cleanup failed",
      };
      state.failure = new actual.McpFnTargetSuiteCleanupError(report, async () => {
        if (++state.attempts === 1) throw new Error("still unavailable");
      });
      throw state.failure;
    },
  };
});

import { runCli } from "../src/index.js";

it("persists a target-suite snapshot and retains its cleanup owner after a failed retry", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mcpfn-target-cleanup-owner-"));
  try {
    await writeFile(path.join(root, "scenarios.json"), "[]\n");
    const output = path.join(root, "report.json");
    const failure = await runCli([
      "test-target", "http://127.0.0.1:1/mcp", "scenarios.json", "--output", output,
    ], { cwd: root, stdout: () => {}, stderr: () => {} }).then(
      () => undefined,
      error => error,
    );
    expect(failure).toBe(state.failure);
    expect(JSON.parse(await readFile(output, "utf8"))).toMatchObject({
      kind: "mcpfn.target-suite-report",
      status: "incomplete",
      ok: false,
    });
    await expect(state.failure!.retryCleanup()).resolves.toBeUndefined();
    expect(state.attempts).toBe(2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
