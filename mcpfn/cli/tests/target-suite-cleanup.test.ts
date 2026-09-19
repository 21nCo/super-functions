import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  attempts: 0,
  reportless: false,
  failure: undefined as import("@mcpfn/testing").McpFnTargetSuiteCleanupError | undefined,
  artifactFailure: undefined as import("@mcpfn/testing").McpFnTargetSuiteArtifactCleanupError | undefined,
}));

vi.mock("@mcpfn/testing", async importOriginal => {
  const actual = await importOriginal<typeof import("@mcpfn/testing")>();
  return {
    ...actual,
    runMcpFnTargetSuite: async () => {
      if (state.reportless) {
        state.artifactFailure = new actual.McpFnTargetSuiteArtifactCleanupError(
          async () => { state.attempts += 1; },
          new Error("unsafe report omitted"),
        );
        throw state.artifactFailure;
      }
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
  state.attempts = 0;
  state.reportless = false;
  try {
    await writeFile(path.join(root, "scenarios.json"), "[]\n");
    const output = path.join(root, "report.json");
    let releaseStdout!: () => void;
    let stdoutStarted!: () => void;
    const started = new Promise<void>((resolve) => { stdoutStarted = resolve; });
    const run = runCli([
      "test-target", "http://127.0.0.1:1/mcp", "scenarios.json", "--output", output,
    ], {
      cwd: root,
      stdout: async () => {
        stdoutStarted();
        await new Promise<void>((resolve) => { releaseStdout = resolve; });
      },
      stderr: () => {},
    });
    await started;
    expect(state.attempts).toBe(0);
    releaseStdout();
    const failure = await run.then(
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

it.each(["output", "persistence"] as const)(
  "retains the target-suite cleanup owner when %s fails",
  async failureMode => {
    const root = await mkdtemp(path.join(os.tmpdir(), "mcpfn-target-cleanup-secondary-"));
    state.attempts = 0;
    state.reportless = false;
    try {
      await writeFile(path.join(root, "scenarios.json"), "[]\n");
      const args = [
        "test-target", "http://127.0.0.1:1/mcp", "scenarios.json",
        ...(failureMode === "persistence"
          ? ["--output", path.join(root, "missing", "report.json")]
          : []),
      ];
      const failure = await runCli(args, {
        cwd: root,
        stdout: failureMode === "output"
          ? async () => { throw new Error("stdout unavailable"); }
          : () => {},
        stderr: failureMode === "output"
          ? async () => { throw new Error("stderr unavailable"); }
          : () => {},
      }).then(() => undefined, error => error);
      expect(failure).toBe(state.failure);
      await expect(state.failure!.retryCleanup()).resolves.toBeUndefined();
      expect(state.attempts).toBe(2);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);

it("retries cleanup without serializing a structurally unsafe report", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mcpfn-target-cleanup-unsafe-report-"));
  state.attempts = 0;
  state.reportless = true;
  try {
    await writeFile(path.join(root, "scenarios.json"), "[]\n");
    const stderr: string[] = [];
    const exitCode = await runCli([
      "test-target", "http://127.0.0.1:1/mcp", "scenarios.json",
    ], {
      cwd: root,
      stdout: () => { throw new Error("unsafe report must not be written"); },
      stderr: text => { stderr.push(text); },
    });
    expect(exitCode).toBe(1);
    expect(state.attempts).toBe(1);
    expect(stderr.join("")).toContain("unsafe report omitted");
  } finally {
    state.reportless = false;
    await rm(root, { recursive: true, force: true });
  }
});
