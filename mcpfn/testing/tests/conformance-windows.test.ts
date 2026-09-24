import { afterEach, expect, it, vi } from "vitest";
import type { ChildProcess } from "node:child_process";
const mocks = vi.hoisted(() => ({ execFile: vi.fn() }));
vi.mock("node:child_process", () => ({ execFile: mocks.execFile }));
import { terminateConformanceRunner } from "../src/conformance-process.js";
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });
const runner = () => ({ pid: 123, kill: vi.fn(), stdout: { destroy: vi.fn() }, stderr: { destroy: vi.fn() } });
it.each([null, new Error("ENOENT")])("handles Windows tree-kill completion: %s", async error => {
  const child = runner();
  mocks.execFile.mockImplementation((_file, _args, _options, done) => done(error));
  await terminateConformanceRunner(child as unknown as ChildProcess, "win32", "C:\\Windows");
  expect(mocks.execFile.mock.calls[0][0]).toBe("C:\\Windows\\System32\\taskkill.exe");
  expect(child.kill).toHaveBeenCalledTimes(error ? 1 : 0);
  expect(child.stdout.destroy).toHaveBeenCalledOnce();
});
it("bounds an unresponsive Windows tree-kill and falls back to the wrapper", async () => {
  vi.useFakeTimers();
  mocks.execFile.mockImplementation(() => undefined);
  const child = runner();
  const cleanup = terminateConformanceRunner(child as unknown as ChildProcess, "win32", "C:\\Windows");
  await vi.advanceTimersByTimeAsync(2500);
  await cleanup;
  expect(child.kill).toHaveBeenCalledWith("SIGKILL");
  expect(child.stderr.destroy).toHaveBeenCalledOnce();
});
