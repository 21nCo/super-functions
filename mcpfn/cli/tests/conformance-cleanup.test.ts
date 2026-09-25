import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  failure: undefined as Error | undefined,
  result: undefined as import("@mcpfn/testing").OfficialConformanceResult | undefined,
  realPath: false,
}));
vi.mock("@mcpfn/testing", async importOriginal => {
  const actual = await importOriginal<typeof import("@mcpfn/testing")>();
  return { ...actual, runAuthenticatedOfficialConformance: async (options: Parameters<typeof actual.runAuthenticatedOfficialConformance>[0]) => {
    if (state.realPath) return actual.runAuthenticatedOfficialConformance(options);
    if (state.result) return state.result;
    if (state.failure) throw state.failure;
    throw new actual.McpFnConformanceCleanupError(async () => {}, {
      formatVersion: 1, kind: "mcpfn.official-conformance-report", suiteVersion: "0.1.16",
      ok: false, exitCode: 1, stdout: "redacted output", stderr: "credential cleanup failed",
    });
  } };
});
import { runCli } from "../src/index.js";

it("marks a size-truncated conformance report incomplete and non-passing", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mcpfn-conformance-cap-"));
  const previous = process.env.MCPFN_CLEANUP_TEST_KEY;
  process.env.MCPFN_CLEANUP_TEST_KEY = "secret";
  state.result = {
    formatVersion: 1,
    kind: "mcpfn.official-conformance-report",
    suiteVersion: "0.1.16",
    ok: true,
    exitCode: 0,
    stdout: "x".repeat(4_096),
    stderr: "",
  };
  try {
    const report = path.join(root, "report.json");
    expect(await runCli([
      "conformance", "http://127.0.0.1:1/mcp",
      "--api-key-env", "MCPFN_CLEANUP_TEST_KEY",
      "--report", report,
      "--max-report-bytes", "1025",
    ], { stdout: () => {}, stderr: () => {} })).toBe(1);
    const bounded = JSON.parse(await readFile(report, "utf8"));
    expect(bounded).toMatchObject({
      ok: false,
      status: "incomplete",
      exitCode: 1,
      incompleteReason: "Report content exceeded --max-report-bytes and was truncated",
      stdout: "[TRUNCATED]",
    });
    expect(Buffer.byteLength(await readFile(report, "utf8"))).toBeLessThanOrEqual(1025);
  } finally {
    state.result = undefined;
    if (previous === undefined) delete process.env.MCPFN_CLEANUP_TEST_KEY;
    else process.env.MCPFN_CLEANUP_TEST_KEY = previous;
    await rm(root, { recursive: true, force: true });
  }
});

it("writes a failed conformance report after credential cleanup exhaustion", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mcpfn-cleanup-report-"));
  const previous = process.env.MCPFN_CLEANUP_TEST_KEY;
  process.env.MCPFN_CLEANUP_TEST_KEY = "secret";
  try {
    const report = path.join(root, "report.json");
    const code = await runCli(["conformance", "http://127.0.0.1:1/mcp", "--api-key-env", "MCPFN_CLEANUP_TEST_KEY", "--report", report], { stdout: () => {}, stderr: () => {} });
    expect(code).toBe(1);
    expect(JSON.parse(await readFile(report, "utf8"))).toMatchObject({ ok: false, exitCode: 1, stderr: "credential cleanup failed" });
  } finally {
    if (previous === undefined) delete process.env.MCPFN_CLEANUP_TEST_KEY;
    else process.env.MCPFN_CLEANUP_TEST_KEY = previous;
    await rm(root, { recursive: true, force: true });
  }
});

it("terminates with a test failure when cleanup exhausts before a report exists", async () => {
  const previous = process.env.MCPFN_CLEANUP_TEST_KEY;
  process.env.MCPFN_CLEANUP_TEST_KEY = "secret";
  try {
    state.failure = new (await import("@mcpfn/testing")).McpFnConformanceCleanupError(async () => {}, undefined);
    expect(await runCli(["conformance", "http://127.0.0.1:1/mcp", "--api-key-env", "MCPFN_CLEANUP_TEST_KEY"], { stderr: () => {} })).toBe(1);
  } finally {
    state.failure = undefined;
    if (previous === undefined) delete process.env.MCPFN_CLEANUP_TEST_KEY;
    else process.env.MCPFN_CLEANUP_TEST_KEY = previous;
  }
});

it("persists the conformance report and rethrows its owner when the retry still fails", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mcpfn-cleanup-owner-"));
  const previous = process.env.MCPFN_CLEANUP_TEST_KEY;
  process.env.MCPFN_CLEANUP_TEST_KEY = "secret";
  let attempts = 0;
  const report = {
    formatVersion: 1 as const,
    kind: "mcpfn.official-conformance-report" as const,
    suiteVersion: "0.1.16",
    ok: false,
    exitCode: 1,
    stdout: "redacted output",
    stderr: "credential cleanup failed",
  };
  const failure = new (await import("@mcpfn/testing")).McpFnConformanceCleanupError(
    async () => { if (++attempts === 1) throw new Error("still unavailable"); },
    report,
  );
  state.failure = failure;
  try {
    const output = path.join(root, "report.json");
    await expect(runCli([
      "conformance", "http://127.0.0.1:1/mcp",
      "--api-key-env", "MCPFN_CLEANUP_TEST_KEY",
      "--report", output,
    ], { stdout: () => {}, stderr: () => {} })).rejects.toBe(failure);
    expect(JSON.parse(await readFile(output, "utf8"))).toMatchObject(report);
    await expect(failure.retryCleanup()).resolves.toBeUndefined();
    expect(attempts).toBe(2);
  } finally {
    state.failure = undefined;
    if (previous === undefined) delete process.env.MCPFN_CLEANUP_TEST_KEY;
    else process.env.MCPFN_CLEANUP_TEST_KEY = previous;
    await rm(root, { recursive: true, force: true });
  }
});

it.each(["output", "persistence"] as const)(
  "retains the conformance cleanup owner when %s fails",
  async failureMode => {
    const root = await mkdtemp(path.join(os.tmpdir(), "mcpfn-cleanup-secondary-"));
    const previous = process.env.MCPFN_CLEANUP_TEST_KEY;
    process.env.MCPFN_CLEANUP_TEST_KEY = "secret";
    let attempts = 0;
    const failure = new (await import("@mcpfn/testing")).McpFnConformanceCleanupError(
      async () => { if (++attempts === 1) throw new Error("still unavailable"); },
      {
        formatVersion: 1,
        kind: "mcpfn.official-conformance-report",
        suiteVersion: "0.1.16",
        ok: false,
        exitCode: 1,
        stdout: "redacted output",
        stderr: "credential cleanup failed",
      },
    );
    state.failure = failure;
    try {
      const args = [
        "conformance", "http://127.0.0.1:1/mcp",
        "--api-key-env", "MCPFN_CLEANUP_TEST_KEY",
        ...(failureMode === "persistence"
          ? ["--report", path.join(root, "missing", "report.json")]
          : []),
      ];
      const thrown = await runCli(args, {
        stdout: failureMode === "output"
          ? async () => { throw new Error("stdout unavailable"); }
          : () => {},
        stderr: failureMode === "output"
          ? async () => { throw new Error("stderr unavailable"); }
          : () => {},
      }).then(() => undefined, error => error);
      expect(thrown).toBe(failure);
      await expect(failure.retryCleanup()).resolves.toBeUndefined();
      expect(attempts).toBe(2);
    } finally {
      state.failure = undefined;
      if (previous === undefined) delete process.env.MCPFN_CLEANUP_TEST_KEY;
      else process.env.MCPFN_CLEANUP_TEST_KEY = previous;
      await rm(root, { recursive: true, force: true });
    }
  },
);

it.each(["report", "stdout", "stderr"] as const)(
  "classifies conformance %s failures as safe runtime exit 1",
  async failureMode => {
    const root = await mkdtemp(path.join(os.tmpdir(), "mcpfn-conformance-output-"));
    const previous = process.env.MCPFN_CLEANUP_TEST_KEY;
    process.env.MCPFN_CLEANUP_TEST_KEY = "secret";
    state.result = {
      formatVersion: 1,
      kind: "mcpfn.official-conformance-report",
      suiteVersion: "0.1.16",
      ok: true,
      exitCode: 0,
      stdout: "captured output",
      stderr: "captured error",
    };
    let errors = "";
    let stderrCalls = 0;
    try {
      const args = [
        "conformance", "http://127.0.0.1:1/mcp",
        "--api-key-env", "MCPFN_CLEANUP_TEST_KEY",
        ...(failureMode === "report"
          ? ["--report", path.join(root, "missing", "report.json")]
          : []),
      ];
      expect(await runCli(args, {
        stdout: failureMode === "stdout"
          ? async () => { throw new Error("unsafe stdout detail"); }
          : () => {},
        stderr: async value => {
          stderrCalls += 1;
          if (failureMode === "stderr") {
            throw new Error("unsafe stderr detail");
          }
          errors += value;
        },
      })).toBe(1);
      if (failureMode === "stderr") expect(errors).toBe("");
      else expect(errors).toContain("Conformance report output failed");
      expect(errors).not.toContain("ENOENT");
      expect(errors).not.toContain("unsafe stdout detail");
      expect(errors).not.toContain("unsafe stderr detail");
    } finally {
      state.result = undefined;
      if (previous === undefined) delete process.env.MCPFN_CLEANUP_TEST_KEY;
      else process.env.MCPFN_CLEANUP_TEST_KEY = previous;
      await rm(root, { recursive: true, force: true });
    }
  },
);


it("classifies proxy operational failures as exit1 with safe output, while keeping input errors exit2", async () => {
  const previous = process.env.MCPFN_CLEANUP_TEST_KEY;
  process.env.MCPFN_CLEANUP_TEST_KEY = "private-token";
  try {
    const args = ["conformance", "http://127.0.0.1:1/mcp", "--api-key-env", "MCPFN_CLEANUP_TEST_KEY"];
    let stderr = "";
    state.failure = new Error("bind or close failed: private-token");
    expect(await runCli(args, { stderr: value => { stderr += value; } }), stderr).toBe(1);
    expect(stderr).toContain("Authenticated conformance failed");
    expect(stderr).not.toContain("private-token");
    state.failure = new TypeError("Authenticated conformance upstream must use HTTP or HTTPS");
    expect(await runCli(args, { stderr: () => {} })).toBe(2);
  } finally {
    state.failure = undefined;
    if (previous === undefined) delete process.env.MCPFN_CLEANUP_TEST_KEY;
    else process.env.MCPFN_CLEANUP_TEST_KEY = previous;
  }
});


it.each(["not-a-url", "ftp://127.0.0.1/mcp", "https://example.com/mcp", "http://user:password@127.0.0.1/mcp", "http://127.0.0.1/mcp#fragment"])("classifies real authenticated input validation as exit2 (%s)", async url => {
  const previous = process.env.MCPFN_CLEANUP_TEST_KEY;
  process.env.MCPFN_CLEANUP_TEST_KEY = "secret";
  state.realPath = true;
  try {
    expect(await runCli(["conformance", url, "--api-key-env", "MCPFN_CLEANUP_TEST_KEY"], { stderr: () => {} })).toBe(2);
  } finally {
    state.realPath = false;
    if (previous === undefined) delete process.env.MCPFN_CLEANUP_TEST_KEY;
    else process.env.MCPFN_CLEANUP_TEST_KEY = previous;
  }
});
