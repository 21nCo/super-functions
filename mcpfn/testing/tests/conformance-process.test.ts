import { afterEach, expect, it, vi } from "vitest";
const fixture = vi.hoisted(() => ({ wrapper: "" }));
vi.mock("node:child_process", async importOriginal => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return { ...actual, spawn: (_command: string, _args: string[], options: import("node:child_process").SpawnOptions) => actual.spawn(process.execPath, ["-e", fixture.wrapper], options) };
});
afterEach(() => vi.unstubAllGlobals());
import { runOfficialConformance } from "../src/conformance.js";

it.skipIf(process.platform === "win32")("stops an overflowing wrapper and its pipe-owning child", async () => {
  // The process under test is a local wrapper fixture, not the Node-22-only official runner.
  vi.stubGlobal("process", { ...process, versions: { ...process.versions, node: "22.0.0" } });
  const runner = `process.stdout.write('x'.repeat(300000)); setInterval(() => {}, 1000);`;
  fixture.wrapper = `const {spawn}=require('node:child_process'); spawn(process.execPath,['-e',${JSON.stringify(runner)}],{stdio:'inherit'}); setInterval(()=>{},1000);`;
  const result = await runOfficialConformance({ url: "http://127.0.0.1:1/mcp", stdio: "pipe" });
  expect(result.ok).toBe(false);
  expect(result.stderr).toContain("capture limit");
}, 10000);
