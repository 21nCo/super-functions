import { spawn, spawnSync } from "node:child_process";
import { get } from "node:http";

export const frameworkPorts = {
  react: 6111,
  svelte: 6112,
  solid: 6114,
};

async function canReach(url) {
  return await new Promise((resolve) => {
    const request = get(url, (response) => {
      response.resume();
      resolve(Boolean(response.statusCode && response.statusCode >= 200 && response.statusCode < 500));
    });
    request.setTimeout(1200, () => {
      request.destroy();
      resolve(false);
    });
    request.on("error", () => resolve(false));
  });
}

export async function ensureWorkbenchServer(framework) {
  const port = frameworkPorts[framework];
  const baseUrl = `http://127.0.0.1:${port}`;
  if (await canReach(baseUrl)) {
    return { baseUrl, stop: async () => undefined, reused: true };
  }

  const reuseStartedAt = Date.now();
  while (Date.now() - reuseStartedAt < 2500) {
    if (await canReach(baseUrl)) {
      return { baseUrl, stop: async () => undefined, reused: true };
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  const workspace = `@uifn/example-${framework}-workbench`;
  const serverMode = process.env.UIFN_WORKBENCH_SERVER_MODE === "dev" ? "dev" : "preview";
  const childEnv = {
    ...process.env,
    PATH: `/opt/homebrew/opt/node@22/bin:/opt/homebrew/bin:${process.env.PATH ?? ""}`,
  };
  if (serverMode === "preview") {
    const build = spawnSync("npm", ["--workspace", workspace, "run", "build"], {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: childEnv,
    });
    if (build.status !== 0) {
      throw new Error(`Workbench build for ${framework} failed: ${(build.stderr || build.stdout).split("\n").slice(-12).join("\n")}`);
    }
  }

  const child = spawn("npm", ["--workspace", workspace, "run", serverMode, "--", "--strictPort"], {
    cwd: process.cwd(),
    stdio: ["ignore", "pipe", "pipe"],
    env: childEnv,
  });

  let lastOutput = "";
  child.stdout.on("data", (chunk) => { lastOutput += String(chunk).slice(-4000); });
  child.stderr.on("data", (chunk) => { lastOutput += String(chunk).slice(-4000); });

  const startedAt = Date.now();
  while (Date.now() - startedAt < 20_000) {
    if (child.exitCode !== null) {
      if (lastOutput.includes("Port") && lastOutput.includes("is already in use")) {
        const startedByPeerAt = Date.now();
        while (Date.now() - startedByPeerAt < 7500) {
          if (await canReach(baseUrl)) {
            return { baseUrl, stop: async () => undefined, reused: true };
          }
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
      }
      throw new Error(`Workbench server for ${framework} exited early: ${lastOutput.slice(-1000)}`);
    }
    if (await canReach(baseUrl)) {
      return {
        baseUrl,
        reused: false,
        stop: async () => {
          child.kill("SIGTERM");
          await new Promise((resolve) => setTimeout(resolve, 250));
          if (child.exitCode === null) child.kill("SIGKILL");
        },
      };
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  child.kill("SIGKILL");
  throw new Error(`Timed out starting Workbench server for ${framework}: ${lastOutput.slice(-1000)}`);
}
