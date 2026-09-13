import { writeFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, DEFAULT_POLICY, type HarnessInput } from "@superfunctions/reviewfn-core";
import { CodexHarnessAdapter, type CommandRunner } from "../src/index.js";

const baseInput: HarnessInput = {
  runId: "run", workspace: ".",
  change: { repositoryId: "repo", host: "local", targetBranch: "main", baseCommit: "a".repeat(40), headCommit: "b".repeat(40), mergeBaseCommit: "a".repeat(40), diffDigest: "c".repeat(64), changedPaths: ["src/index.ts"], capturedAt: "2026-01-01T00:00:00.000Z" },
  context: { version: 1, sources: [], selection: { candidates: [], selected: [], rule: "none" }, limits: { maxSources: 1, maxBytes: 1, maxDepth: 1 }, incompleteReasons: [], digest: "d".repeat(64) },
  policy: DEFAULT_POLICY,
  configuration: { ...DEFAULT_CONFIG, inference: { provider: "openai", model: "gpt-5.6-sol", auth: "chatgpt" } },
  testReceipts: [], prompt: "review",
};

describe("CodexHarnessAdapter", () => {
  it("normalizes JSONL and structured output", async () => {
    const runner: CommandRunner = async (_command, args) => {
      if (args[0] === "--version") return { code: 0, signal: null, stdout: "codex 1.0", stderr: "", timedOut: false, canceled: false };
      const output = args[args.indexOf("--output-last-message") + 1];
      await writeFile(output, JSON.stringify({ requirements: [], assessments: [], evidence: [], findings: [], inspectedPaths: [], uninspected: [] }));
      return { code: 0, signal: null, stdout: '{"type":"turn.started"}\n{"type":"turn.completed","usage":{"input_tokens":1}}\n', stderr: "", timedOut: false, canceled: false };
    };
    const adapter = new CodexHarnessAdapter({ runner, environment: { PATH: process.env.PATH } });
    expect((await adapter.preflight(baseInput.configuration)).ok).toBe(true);
    const output = await adapter.run(baseInput);
    expect(output.terminal).toBe("completed");
    expect(output.events).toHaveLength(2);
    expect(output.events[1].type).toBe("usage");
  });
  it("fails before inference when PR changes auto-loaded instructions", async () => {
    let invoked = false;
    const adapter = new CodexHarnessAdapter({ runner: async () => { invoked = true; return { code: 0, signal: null, stdout: "", stderr: "", timedOut: false, canceled: false }; } });
    const output = await adapter.run({ ...baseInput, change: { ...baseInput.change, changedPaths: ["AGENTS.md"] } });
    expect(output.terminal).toBe("failed");
    expect(invoked).toBe(false);
  });
  it("never exposes a raw API key to pull-request review", async () => {
    let invoked = false;
    const adapter = new CodexHarnessAdapter({ runner: async () => { invoked = true; return { code: 0, signal: null, stdout: "", stderr: "", timedOut: false, canceled: false }; }, environment: { CODEX_API_KEY: "secret" } });
    const output = await adapter.run({ ...baseInput, change: { ...baseInput.change, pullRequest: 7 }, configuration: { ...baseInput.configuration, inference: { provider: "openai", model: "gpt-5.6-sol", auth: "api-key", credentialEnv: "CODEX_API_KEY" } } });
    expect(output.terminal).toBe("failed");
    expect(output.error).toMatch(/forbidden/);
    expect(invoked).toBe(false);
  });
  it("fails proxy preflight when no credential-isolating endpoint is configured", async () => {
    const adapter = new CodexHarnessAdapter({ runner: async () => ({ code: 0, signal: null, stdout: "codex 1.0", stderr: "", timedOut: false, canceled: false }), environment: { PATH: process.env.PATH } });
    const result = await adapter.preflight({ ...baseInput.configuration, inference: { provider: "openai", model: "gpt-5.6-sol", auth: "action-proxy" } });
    expect(result.diagnostics.map((item) => item.code)).toContain("REVIEWFN_PROXY_REQUIRED");
  });
  it("reports quota and timeout as non-completed terminals", async () => {
    const quota = new CodexHarnessAdapter({ runner: async () => ({ code: 1, signal: null, stdout: "", stderr: "quota exhausted", timedOut: false, canceled: false }) });
    expect((await quota.run(baseInput)).terminal).toBe("quota_exhausted");
    const timeout = new CodexHarnessAdapter({ runner: async () => ({ code: null, signal: "SIGTERM", stdout: "", stderr: "", timedOut: true, canceled: false }) });
    expect((await timeout.run(baseInput)).terminal).toBe("timed_out");
  });
});
it("rejects invalid schema and redacts custom credential values on every terminal path", async () => {
  for (const code of [0, 1]) {
    const adapter = new CodexHarnessAdapter({ environment: { REVIEW_AUTH: "private-custom-value" }, runner: async (_command, args) => {
      await writeFile(args[args.indexOf("--output-last-message") + 1], JSON.stringify({ requirements: [], assessments: [], evidence: [], inspectedPaths: [], uninspected: [] }));
      return { code, signal: null, stdout: 'private-custom-value', stderr: 'private-custom-value', timedOut: false, canceled: false };
    } });
    const result = await adapter.run({ ...baseInput, configuration: { ...baseInput.configuration, inference: { provider: "openai", model: "test", auth: "api-key", credentialEnv: "REVIEW_AUTH" } } });
    expect(result.terminal).toBe(code ? "failed" : "malformed"); expect(JSON.stringify(result)).not.toContain("private-custom-value");
  }
});
it("blocks override instructions before invoking the model", async () => {
  let invoked = false; const adapter = new CodexHarnessAdapter({ runner: async () => { invoked = true; throw new Error("unexpected"); } });
  expect((await adapter.run({ ...baseInput, change: { ...baseInput.change, changedPaths: ["nested/AGENTS.override.md"] } })).terminal).toBe("failed"); expect(invoked).toBe(false);
});
