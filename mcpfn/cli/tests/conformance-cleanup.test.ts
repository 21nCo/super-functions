import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it, vi } from "vitest";
vi.mock("@mcpfn/testing", async importOriginal => {
  const actual = await importOriginal<typeof import("@mcpfn/testing")>();
  return { ...actual, runAuthenticatedOfficialConformance: async () => {
    throw new actual.McpFnConformanceCleanupError(async () => {}, {
      formatVersion: 1, kind: "mcpfn.official-conformance-report", suiteVersion: "0.1.16",
      ok: false, exitCode: 1, stdout: "redacted output", stderr: "credential cleanup failed",
    });
  } };
});
import { runCli } from "../src/index.js";
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
