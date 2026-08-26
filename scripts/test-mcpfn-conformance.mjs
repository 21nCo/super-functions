#!/usr/bin/env node

import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

import { runOfficialConformance } from "../mcpfn/testing/dist/index.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = await mkdtemp(path.join(tmpdir(), "mcpfn-conformance-"));
const server = spawn(
  process.execPath,
  [
    path.join(repoRoot, "node_modules/jiti/lib/jiti-cli.mjs"),
    path.join(repoRoot, "mcpfn/examples/conformance-http-server.ts"),
  ],
  { cwd: repoRoot, stdio: ["ignore", "pipe", "pipe"] },
);
let serverStderr = "";
server.stderr.on("data", (chunk) => {
  serverStderr += chunk.toString();
});

try {
  const url = await new Promise((resolve, reject) => {
    const lines = readline.createInterface({ input: server.stdout });
    const timer = setTimeout(() => {
      reject(new Error(`McpFn conformance server did not start. ${serverStderr}`));
    }, 10_000);
    lines.once("line", (line) => {
      clearTimeout(timer);
      lines.close();
      resolve(line.trim());
    });
    server.once("error", reject);
    server.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`McpFn conformance server exited with ${code}. ${serverStderr}`));
    });
  });

  const suite = "active";
  const result = await runOfficialConformance({
    url,
    suite,
    outputDir: outputRoot,
    cwd: repoRoot,
    stdio: "pipe",
  });
  if (result.exitCode !== 0) {
    throw new Error(
      `Official MCP conformance failed for the ${suite} suite.\n${result.stdout}\n${result.stderr}`,
    );
  }
  process.stdout.write(`${JSON.stringify({ ok: true, suite })}\n`);
} finally {
  server.kill("SIGTERM");
  await new Promise((resolve) => {
    if (server.exitCode !== null || server.signalCode !== null) resolve();
    else server.once("exit", resolve);
  });
  await rm(outputRoot, { recursive: true, force: true });
}
