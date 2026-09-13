import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { beforeEach, expect, it, vi } from "vitest";
const spawn = vi.hoisted(() => vi.fn());
vi.mock("node:child_process", () => ({ spawn }));
import { McpFnConformanceCleanupError, runAuthenticatedOfficialConformance } from "../src/conformance.js";

beforeEach(() => {
  spawn.mockReset();
  spawn.mockImplementation(() => {
    const child = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough() });
    queueMicrotask(() => { child.stdout.write('{"echo":"opaque-runner-value"}'); child.stderr.write("failure opaque-runner-value"); child.emit("close", 1); });
    return child;
  });
});

it("scrubs opaque credentials from runner output and never inherits authenticated stdio", async () => {
  const result = await runAuthenticatedOfficialConformance({ url: "http://127.0.0.1:1/mcp", headers: { "x-api-key": "opaque-runner-value" }, stdio: "inherit" });
  expect(result.ok).toBe(false);
  expect(JSON.stringify(result)).not.toContain("opaque-runner-value");
  expect(result.stdout).toContain("[REDACTED]");
  expect(spawn.mock.calls[0][2].stdio).toBe("pipe");
});

it("rejects raw output artifacts before credential acquisition", async () => {
  const acquire = vi.fn();
  await expect(runAuthenticatedOfficialConformance({ url: "http://127.0.0.1:1/mcp", credential: { acquire }, outputDir: "/tmp/unsafe-output" })).rejects.toThrow(/outputDir/);
  expect(acquire).not.toHaveBeenCalled();
});

it("retries transient conformance credential revocation", async () => {
  const revoke = vi.fn().mockRejectedValueOnce(new Error("temporary")).mockResolvedValue(undefined);
  await runAuthenticatedOfficialConformance({url: "http://127.0.0.1:1/mcp", credential: {acquire: () => ({headers: {"x-api-key": "opaque-runner-value"}}), revoke}});
  expect(revoke).toHaveBeenCalledTimes(2);
});
it("retains permanently failing conformance cleanup for explicit retry", async () => {
  const revoke = vi.fn().mockRejectedValue(new Error("secret-cleanup-error"));
  let failure: unknown;
  try { await runAuthenticatedOfficialConformance({url: "http://127.0.0.1:1/mcp", credential: {acquire: () => ({headers: {"x-api-key": "opaque-runner-value"}}), revoke}}); }
  catch(error) { failure = error; }
  expect(failure).toBeInstanceOf(McpFnConformanceCleanupError);
  expect(revoke).toHaveBeenCalledTimes(3);
  expect((failure as Error).message).not.toContain("secret-cleanup-error");
  revoke.mockResolvedValue(undefined);
  await (failure as McpFnConformanceCleanupError).retryCleanup();
  expect(revoke).toHaveBeenCalledTimes(4);
});

it("redacts credentials crossing the conformance output truncation boundary", async () => {
  const secret = "opaque-boundary-credential";
  spawn.mockImplementation(() => {
    const child = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough() });
    queueMicrotask(() => { child.stdout.write("x".repeat(262_140) + secret); child.emit("close", 0); });
    return child;
  });
  const result = await runAuthenticatedOfficialConformance({ url: "http://127.0.0.1:1/mcp", headers: { "x-api-key": secret } });
  expect(result.stdout).not.toContain("opaq");
});
