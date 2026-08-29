#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cliRequire = createRequire(path.join(repoRoot, "mcpfn/cli/package.json"));
const jiti = path.join(path.dirname(cliRequire.resolve("jiti/package.json")), "lib/jiti-cli.mjs");
const serverSource = path.join(repoRoot, "mcpfn/examples/calculator-http-server.ts");
const clientSource = path.join(repoRoot, "mcpfn/examples/calculator-client.ts");

function waitForServerUrl(child) {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      reject(new Error(`Calculator server did not start in time\n${stderr}`));
    }, 10_000);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      const match = /http:\/\/127\.0\.0\.1:\d+\/mcp/.exec(stdout);
      if (match) {
        clearTimeout(timer);
        resolve(match[0]);
      }
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("exit", (code, signal) => {
      clearTimeout(timer);
      reject(new Error(
        `Calculator server exited before startup (code=${code}, signal=${signal})\n${stderr}`,
      ));
    });
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

async function stop(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise((resolve) => child.once("exit", resolve));
  child.kill("SIGTERM");
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(resolve, 3_000, "timeout");
  });
  try {
    if (await Promise.race([exited, timeout]) === "timeout") {
      child.kill("SIGKILL");
      await exited;
    }
  } finally {
    clearTimeout(timer);
  }
}

const server = spawn(process.execPath, [jiti, serverSource], {
  cwd: repoRoot,
  stdio: ["ignore", "pipe", "pipe"],
});

try {
  const url = await waitForServerUrl(server);
  const client = spawnSync(process.execPath, [jiti, clientSource, url], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: "pipe",
    timeout: 15_000,
  });
  if (client.status !== 0) {
    throw new Error(
      `Calculator client failed with ${client.status}\n${client.stdout}\n${client.stderr}`,
    );
  }
  const output = JSON.parse(client.stdout);
  assert.ok(output.tools.some((tool) => tool.name === "calculator_sum"));
  assert.deepEqual(output.result.structuredContent, { result: 5 });
  process.stdout.write(JSON.stringify({ ok: true, tool: "calculator_sum", result: 5 }) + "\n");
} finally {
  await stop(server);
}
