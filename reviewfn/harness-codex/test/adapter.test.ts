import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import path from "node:path";
import { writeFile, mkdtemp, symlink, rm } from "node:fs/promises";
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
it("rejects invalid schema and redacts custom credential values on malformed and failed terminal paths", async () => {
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

it("maps the configured API credential to Codex while excluding publication credentials", async () => {
  let environment: NodeJS.ProcessEnv = {};
  const adapter = new CodexHarnessAdapter({ environment: { REVIEW_AUTH: "custom-private-key", GITHUB_TOKEN: "publication-private-key", PATH: process.env.PATH }, runner: async (_command, _args, options) => { environment = options.env; return { code: 0, signal: null, stdout: "codex-cli 0.154.0", stderr: "", timedOut: false, canceled: false }; } });
  await adapter.preflight({ ...baseInput.configuration, inference: { provider: "openai", model: "gpt-5.6-sol", auth: "api-key", credentialEnv: "REVIEW_AUTH" } });
  expect(environment.CODEX_API_KEY).toBe("custom-private-key"); expect(environment.GITHUB_TOKEN).toBeUndefined();
});

it.skipIf(process.platform === "win32")("rejects a runner output symlink without reading its external target", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "reviewfn-external-output-"));
  try {
    const target = path.join(directory, "external.json");
    await writeFile(target, JSON.stringify({ requirements: [], assessments: [], evidence: [], findings: [], inspectedPaths: [], uninspected: [] }));
    const adapter = new CodexHarnessAdapter({ runner: async (_command, args) => {
      await symlink(target, args[args.indexOf("--output-last-message") + 1]);
      return { code: 0, signal: null, stdout: '{"type":"turn.started"}\n', stderr: "", timedOut: false, canceled: false };
    } });
    const result = await adapter.run(baseInput);
    expect(result.terminal).toBe("malformed");
    expect(result.events).toHaveLength(1);
    expect(result.error).not.toContain(target);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

it.skipIf(process.platform === "win32")("rejects a runner output FIFO without waiting for a writer", async () => {
  const adapter = new CodexHarnessAdapter({ runner: async (_command, args) => {
    await promisify(execFile)("mkfifo", [args[args.indexOf("--output-last-message") + 1]]);
    return { code: 0, signal: null, stdout: "", stderr: "", timedOut: false, canceled: false };
  } });
  expect((await adapter.run(baseInput)).terminal).toBe("malformed");
});
