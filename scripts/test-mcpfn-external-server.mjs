#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cliRequire = createRequire(path.join(repoRoot, "mcpfn/cli/package.json"));
const jiti = path.join(path.dirname(cliRequire.resolve("jiti/package.json")), "lib/jiti-cli.mjs");
const serverSource = path.join(repoRoot, "mcpfn/examples/external-http-server.ts");
const scenarios = path.join(repoRoot, "mcpfn/examples/external-scenarios.ts");
const apiKey = "mcpfn-external-example-key";
const header = `Authorization: Bearer ${apiKey}`;

function waitForServerUrl(child) {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      reject(new Error(`External example server did not start in time\n${stderr}`));
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
        `External example server exited before startup (code=${code}, signal=${signal})\n${stderr}`,
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

const outputRoot = await mkdtemp(path.join(tmpdir(), "mcpfn-external-example-"));
const server = spawn(process.execPath, [jiti, serverSource], {
  cwd: repoRoot,
  env: { ...process.env, MCPFN_EXTERNAL_API_KEY: apiKey },
  stdio: ["ignore", "pipe", "pipe"],
});

try {
  const url = await waitForServerUrl(server);
  const jsonReport = path.join(outputRoot, "target-report.json");
  const junitReport = path.join(outputRoot, "target-report.xml");
  const cli = path.join(repoRoot, "mcpfn/cli/dist/bin.js");
  const target = spawnSync(process.execPath, [
    cli,
    "test-target",
    url,
    scenarios,
    "--header",
    header,
    "--output",
    jsonReport,
    "--junit",
    junitReport,
  ], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: "pipe",
    timeout: 30_000,
  });
  if (target.status !== 0) {
    throw new Error(
      `mcpfn test-target failed for the external server example\n${target.stdout}\n${target.stderr}`,
    );
  }
  const report = JSON.parse(await readFile(jsonReport, "utf8"));
  if (!report.ok || report.passed < 1) {
    throw new Error(`External server example report was not successful: ${JSON.stringify(report)}`);
  }
  const junit = await readFile(junitReport, "utf8");
  if (!junit.includes("echoes a message") || junit.includes(apiKey)) {
    throw new Error("External server example JUnit report is missing the scenario or leaked the API key");
  }
  const unauthorized = spawnSync(process.execPath, [
    cli,
    "test-target",
    url,
    scenarios,
  ], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: "pipe",
    timeout: 15_000,
  });
  if (unauthorized.status === 0) {
    throw new Error("Unauthenticated test-target against the external example unexpectedly passed");
  }
  process.stdout.write(`${JSON.stringify({
    ok: true,
    example: "mcpfn/examples/external-http-server.ts",
    authenticated: true,
  })}\n`);
} finally {
  await stop(server);
  await rm(outputRoot, { recursive: true, force: true });
}
