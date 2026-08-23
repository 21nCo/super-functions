import { access, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runCli } from "../src/index.js";

describe("devfn CLI", () => {
  it("previews detection before init writes", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "devfn-init-"));
    await writeFile(path.join(cwd, "package.json"), JSON.stringify({ name: "sample", scripts: { dev: "node server.js" } }), "utf8");
    let stdout = "";
    expect(await runCli(["init", "--json"], { cwd, stdout: (text) => { stdout += text; } })).toBe(0);
    const output = JSON.parse(stdout) as { written: boolean; preview: string };
    expect(output.written).toBe(false);
    expect(output.preview).toContain("export default");
  });

  it("writes a manifest only with explicit confirmation and adds the runtime ignore", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "devfn-init-"));
    const stateDir = await mkdtemp(path.join(tmpdir(), "devfn-state-"));
    await writeFile(path.join(cwd, "package.json"), JSON.stringify({ name: "sample", scripts: { dev: "node server.js" } }), "utf8");
    expect(await runCli(["init", "--yes", "--json"], { cwd, stdout: () => undefined })).toBe(0);
    expect(await readFile(path.join(cwd, "devfn.config.ts"), "utf8")).toContain("sample");
    expect(await readFile(path.join(cwd, ".gitignore"), "utf8")).toContain(".devfn/");
    let stdout = "";
    expect(await runCli(["status", "--trust", "--json", "--state-dir", stateDir], { cwd, stdout: (text) => { stdout += text; }, stderr: () => undefined })).toBe(0);
    expect(JSON.parse(stdout).state).toBe("stopped");
  });

  it("runs the local up, status, url, and down lifecycle with JSON receipts", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "devfn-lifecycle-"));
    const stateDir = await mkdtemp(path.join(tmpdir(), "devfn-state-"));
    await writeFile(path.join(cwd, "server.mjs"), "import http from 'node:http'; const server = http.createServer((_request, response) => { response.writeHead(200); response.end('ok'); }); server.listen(Number(process.env.PORT), '127.0.0.1');\n", "utf8");
    await writeFile(path.join(cwd, "devfn.config.json"), JSON.stringify({
      version: 1,
      project: { id: "fixture" },
      ports: { app: { range: [44200, 44300], env: "PORT" } },
      processes: { app: { adapter: "command", command: [process.execPath, "server.mjs"], ports: ["app"], health: { type: "http", port: "app", timeoutMs: 5000 } } },
      profiles: { default: { processes: ["app"] } },
    }), "utf8");

    const invoke = async (args: string[]) => {
      let stdout = "";
      const code = await runCli([...args, "--json", "--state-dir", stateDir], { cwd, stdout: (text) => { stdout += text; }, stderr: () => undefined });
      return { code, value: JSON.parse(stdout) as Record<string, unknown> };
    };

    try {
      const up = await invoke(["up", "--trust"]);
      expect(up.code, JSON.stringify(up.value)).toBe(0);
      expect(up.value.state).toBe("ready");
      const status = await invoke(["status"]);
      expect(status.value.state).toBe("ready");
      const url = await invoke(["url"]);
      expect((url.value.urls as Record<string, string>).app).toMatch(/^http:\/\/127\.0\.0\.1:/);
      const down = await invoke(["down"]);
      expect(down.value.state).toBe("stopped");
    } finally {
      await invoke(["down"]).catch(() => undefined);
    }
  }, 15_000);

  it("requires a separate confirmation for public exposure", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "devfn-public-"));
    const stateDir = await mkdtemp(path.join(tmpdir(), "devfn-state-"));
    await writeFile(path.join(cwd, "devfn.config.json"), JSON.stringify({
      version: 1,
      project: { id: "public-fixture" },
      processes: { tunnel: { adapter: "command", exposure: "public", command: [process.execPath, "-e", "setInterval(() => {}, 1000)"] } },
      profiles: { oauth: { processes: ["tunnel"] } },
      defaultProfile: "oauth",
    }), "utf8");
    let stdout = "";
    const code = await runCli(["up", "--profile", "oauth", "--trust", "--json", "--state-dir", stateDir], { cwd, stdout: (text) => { stdout += text; }, stderr: () => undefined });
    expect(code).toBe(1);
    expect(JSON.parse(stdout).error.code).toBe("DEVFN_PUBLIC_EXPOSURE_CONFIRMATION_REQUIRED");
  });

  it("does not execute an untrusted TypeScript manifest", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "devfn-trust-"));
    const stateDir = await mkdtemp(path.join(tmpdir(), "devfn-state-"));
    const marker = path.join(cwd, "executed.txt");
    await writeFile(path.join(cwd, "devfn.config.ts"), `import { writeFileSync } from "node:fs"; writeFileSync(${JSON.stringify(marker)}, "executed"); export default { version: 1, project: { id: "unsafe" }, profiles: { default: {} } };\n`, "utf8");
    let stdout = "";
    const code = await runCli(["status", "--json", "--state-dir", stateDir], { cwd, stdout: (text) => { stdout += text; }, stderr: () => undefined });
    expect(code).toBe(1);
    expect(JSON.parse(stdout).error.code).toBe("DEVFN_MANIFEST_UNTRUSTED");
    expect(JSON.parse(stdout).error.message).toContain("is not trusted");
    await expect(access(marker)).rejects.toMatchObject({ code: "ENOENT" });
    stdout = "";
    const trustedCode = await runCli(["status", "--trust", "--json", "--state-dir", stateDir], { cwd, stdout: (text) => { stdout += text; }, stderr: () => undefined });
    expect(trustedCode).toBe(1);
    expect(JSON.parse(stdout).error.code).toBe("DEVFN_CONFIG_INVALID");
    await expect(access(marker)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("does not load an untrusted JSON manifest", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "devfn-json-trust-"));
    const stateDir = await mkdtemp(path.join(tmpdir(), "devfn-state-"));
    await writeFile(path.join(cwd, "devfn.config.json"), JSON.stringify({ version: 1, project: { id: "unsafe-json" }, profiles: { default: {} } }), "utf8");
    let stdout = "";
    const code = await runCli(["status", "--json", "--state-dir", stateDir], { cwd, stdout: (text) => { stdout += text; }, stderr: () => undefined });
    expect(code).toBe(1);
    expect(JSON.parse(stdout).error.code).toBe("DEVFN_MANIFEST_UNTRUSTED");
  });

  it("rejects unsupported ports actions", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "devfn-ports-"));
    const stateDir = await mkdtemp(path.join(tmpdir(), "devfn-state-"));
    await writeFile(path.join(cwd, "devfn.config.json"), JSON.stringify({ version: 1, project: { id: "ports" }, profiles: { default: {} } }), "utf8");
    let stdout = "";
    const code = await runCli(["ports", "wat", "--trust", "--json", "--state-dir", stateDir], { cwd, stdout: (text) => { stdout += text; }, stderr: () => undefined });
    expect(code).toBe(1);
    expect(JSON.parse(stdout).error.code).toBe("DEVFN_RUNTIME_INVALID");
  });

  it("rolls back a ready dependency when a later process fails", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "devfn-rollback-"));
    const stateDir = await mkdtemp(path.join(tmpdir(), "devfn-state-"));
    await writeFile(path.join(cwd, "server.mjs"), "import net from 'node:net'; const server = net.createServer(); server.listen(Number(process.env.PORT), '127.0.0.1');\n", "utf8");
    await writeFile(path.join(cwd, "devfn.config.json"), JSON.stringify({
      version: 1,
      project: { id: "rollback" },
      ports: { app: { range: [44400, 44500], env: "PORT" } },
      processes: {
        app: { adapter: "command", command: [process.execPath, "server.mjs"], ports: ["app"], health: { type: "tcp", port: "app", timeoutMs: 5000 } },
        fail: { adapter: "command", command: [process.execPath, "-e", "process.exit(2)"], dependsOn: ["app"] },
      },
      profiles: { default: { processes: ["fail"] } },
    }), "utf8");
    let stdout = "";
    expect(await runCli(["up", "--trust", "--json", "--state-dir", stateDir], { cwd, stdout: (text) => { stdout += text; }, stderr: () => undefined })).toBe(1);
    expect(JSON.parse(stdout).error.code).toBe("DEVFN_START_FAILED");
    const instance = (await readdir(path.join(cwd, ".devfn", "instances")))[0];
    const receipt = JSON.parse(await readFile(path.join(cwd, ".devfn", "instances", instance, "receipt.json"), "utf8")) as { state: string; cleanup: { stoppedProcesses: string[]; releasedPorts: boolean } };
    expect(receipt.state).toBe("failed");
    expect(receipt.cleanup.stoppedProcesses, JSON.stringify(receipt)).toContain("app");
    expect(receipt.cleanup.releasedPorts).toBe(true);
  }, 15_000);
});
