import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  reject: false,
  oversized: false,
  hostile: false,
  closeAttempts: 0,
  closeFailures: 0,
}));
vi.mock("@mcpfn/inspector", () => ({ McpFnInspector: { create: ({ target }: any) => {
  let handle: any;
  return { connect: async () => { handle = await target.open({ requestId: "inspect-test", diagnostic: async () => {} }); },
    snapshot: async () => { if (state.hostile) throw { get message() { throw new Error("opaque-inspect-value"); }, toString() { throw new Error("opaque-inspect-value"); } }; if (state.oversized) return { tools: [{ description: "x".repeat(300000) }] }; if (state.reject) throw new McpFnClientError("MCPFN_OPERATION_FAILED", "remote echoed opaque-inspect-value", {phase: "capability-operation"}); return { tools: [{ description: "opaque-inspect-value" }] }; },
    serializeSnapshot: (snapshot: unknown) => `${JSON.stringify(snapshot, null, 2).replaceAll("opaque-inspect-value", "[REDACTED]")}\n`,
    close: async () => {
      state.closeAttempts += 1;
      if (state.closeAttempts <= state.closeFailures) throw new Error("close echoed opaque-inspect-value");
      await handle?.close();
    } };
} } }));
import { McpFnClientError } from "@mcpfn/client";
import { McpFnInspectorCleanupError, runCli } from "../src/index.js";

it("scrubs acquired credentials from inspect stdout and its output file", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "mcpfn-inspect-"));
  vi.stubEnv("MCPFN_INSPECT_TEST_TOKEN", "opaque-inspect-value");
  let stdout = "", stderr = "";
  try {
    const code = await runCli(["inspect", "http://127.0.0.1:1/mcp", "--api-key-env", "MCPFN_INSPECT_TEST_TOKEN", "--output", "snapshot.json"], {
      cwd: root, stdout: (text) => { stdout += text; }, stderr: (text) => { stderr += text; },
    });
    expect(code, stderr).toBe(0);
    expect(stdout).toContain("[REDACTED]");
    expect(stdout).not.toContain("opaque-inspect-value");
    expect(await readFile(path.join(root, "snapshot.json"), "utf8")).toBe(stdout);
  } finally { vi.unstubAllEnvs(); await rm(root, { recursive: true, force: true }); }
});

it("scrubs credentials from failed inspect stderr", async () => {
  vi.stubEnv("MCPFN_INSPECT_TEST_TOKEN", "opaque-inspect-value");
  state.reject = true;
  let stderr = "";
  try {
    const code = await runCli(["inspect", "http://127.0.0.1:1/mcp", "--api-key-env", "MCPFN_INSPECT_TEST_TOKEN"], { stdout: () => {}, stderr: text => { stderr += text; } });
    expect(code).toBe(1);
    expect(stderr).toContain("[REDACTED]");
    expect(stderr).not.toContain("opaque-inspect-value");
  } finally { state.reject = false; vi.unstubAllEnvs(); }
});


it("passes snapshots above the payload-redaction scalar limit to stdout", async () => {
  vi.stubEnv("MCPFN_INSPECT_TEST_TOKEN", "opaque-inspect-value");
  state.oversized = true;
  let stdout = "";
  try {
    const code = await runCli(["inspect", "http://127.0.0.1:1/mcp", "--api-key-env", "MCPFN_INSPECT_TEST_TOKEN"], {
      stdout: text => { stdout += text; }, stderr: () => {},
    });
    expect(code).toBe(0);
    expect(stdout.length).toBeGreaterThan(262_144);
  } finally { state.oversized = false; vi.unstubAllEnvs(); }
});

it("classifies hostile inspect failures as runtime errors without secrets", async () => {
  vi.stubEnv("MCPFN_INSPECT_TEST_TOKEN", "opaque-inspect-value");
  state.hostile = true;
  let stderr = "";
  try {
    const code = await runCli(["inspect", "http://127.0.0.1:1/mcp", "--api-key-env", "MCPFN_INSPECT_TEST_TOKEN"], {
      stdout: () => {}, stderr: text => { stderr += text; },
    });
    expect(code).toBe(1);
    expect(stderr).not.toContain("opaque-inspect-value");
  } finally { state.hostile = false; vi.unstubAllEnvs(); }
});

it("retains the inspector cleanup owner through diagnostics and a failed bounded retry", async () => {
  vi.stubEnv("MCPFN_INSPECT_TEST_TOKEN", "opaque-inspect-value");
  state.closeAttempts = 0;
  state.closeFailures = 2;
  try {
    const failure = await runCli([
      "inspect", "http://127.0.0.1:1/mcp", "--api-key-env", "MCPFN_INSPECT_TEST_TOKEN",
    ], {
      stdout: () => {},
      stderr: async () => { throw new Error("diagnostic unavailable"); },
    }).then(() => undefined, error => error);
    expect(failure).toBeInstanceOf(McpFnInspectorCleanupError);
    expect(state.closeAttempts).toBe(2);
    await expect(failure.retryCleanup()).resolves.toBeUndefined();
    expect(state.closeAttempts).toBe(3);
  } finally {
    state.closeFailures = 0;
    vi.unstubAllEnvs();
  }
});
