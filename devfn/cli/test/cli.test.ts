import { access, mkdir, mkdtemp, readFile, readdir, symlink, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isPortAvailable } from "@devfn/ports";
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

  it("rejects non-TypeScript init targets", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "devfn-init-"));
    await writeFile(path.join(cwd, "package.json"), JSON.stringify({ name: "sample" }), "utf8");
    let stdout = "";
    expect(await runCli(["init", "--yes", "--config", "devfn.config.json", "--json"], { cwd, stdout: (text) => { stdout += text; }, stderr: () => undefined })).toBe(1);
    expect(JSON.parse(stdout).error.code).toBe("DEVFN_CONFIG_INVALID");
    await expect(access(path.join(cwd, "devfn.config.json"))).rejects.toMatchObject({ code: "ENOENT" });
    stdout = "";
    expect(await runCli(["init", "--yes", "--config", "devfn.config.TS", "--json"], { cwd, stdout: (text) => { stdout += text; }, stderr: () => undefined })).toBe(0);
    await expect(access(path.join(cwd, "devfn.config.TS"))).resolves.toBeUndefined();
  });

  it("restricts init manifests to the repository root", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "devfn-init-"));
    await writeFile(path.join(cwd, "package.json"), JSON.stringify({ name: "sample" }), "utf8");
    let stdout = "";
    expect(await runCli(["init", "--yes", "--config", "config/devfn.config.ts", "--json"], { cwd, stdout: (text) => { stdout += text; }, stderr: () => undefined })).toBe(1);
    expect(JSON.parse(stdout).error.message).toContain("repository root");
    await expect(access(path.join(cwd, "config", "devfn.config.ts"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rolls back the generated manifest when the runtime ignore cannot be written", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "devfn-init-"));
    await writeFile(path.join(cwd, "package.json"), JSON.stringify({ name: "sample" }), "utf8");
    await mkdir(path.join(cwd, ".gitignore"));
    expect(await runCli(["init", "--yes", "--json"], { cwd, stdout: () => undefined, stderr: () => undefined })).toBe(1);
    await expect(access(path.join(cwd, "devfn.config.ts"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("refuses to update a runtime ignore symlink outside the repository", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "devfn-init-"));
    const outside = path.join(await mkdtemp(path.join(tmpdir(), "devfn-outside-")), "gitignore");
    await writeFile(path.join(cwd, "package.json"), JSON.stringify({ name: "sample" }), "utf8");
    await writeFile(outside, "outside\n", "utf8");
    await symlink(outside, path.join(cwd, ".gitignore"));
    expect(await runCli(["init", "--yes", "--json"], { cwd, stdout: () => undefined, stderr: () => undefined })).toBe(1);
    expect(await readFile(outside, "utf8")).toBe("outside\n");
    await expect(access(path.join(cwd, "devfn.config.ts"))).rejects.toMatchObject({ code: "ENOENT" });
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
      const wrongStateDir = await mkdtemp(path.join(tmpdir(), "devfn-wrong-state-"));
      let wrongOutput = "";
      expect(await runCli(["down", "--trust", "--json", "--state-dir", wrongStateDir], { cwd, stdout: (text) => { wrongOutput += text; }, stderr: () => undefined })).toBe(1);
      expect(JSON.parse(wrongOutput).error.message).toContain("same --state-dir");
      const down = await invoke(["down"]);
      expect(down.value.state).toBe("stopped");
      expect((await invoke(["url"])).value.urls).toEqual({});
    } finally {
      await invoke(["down"]).catch(() => undefined);
    }
  }, 15_000);

  it("restarts a live process whose configured readiness has degraded", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "devfn-readiness-recovery-"));
    const stateDir = await mkdtemp(path.join(tmpdir(), "devfn-state-"));
    const closeMarker = path.join(cwd, "close-listener");
    await writeFile(path.join(cwd, "server.mjs"), "import { existsSync, unlinkSync } from 'node:fs'; import http from 'node:http'; const server = http.createServer((_request, response) => { response.writeHead(200); response.end('ok'); }); server.listen(Number(process.env.PORT), '127.0.0.1'); setInterval(() => { if (existsSync(process.env.CLOSE_FILE)) { unlinkSync(process.env.CLOSE_FILE); server.close(); } }, 25);\n", "utf8");
    await writeFile(path.join(cwd, "devfn.config.json"), JSON.stringify({
      version: 1, project: { id: "readiness-recovery" }, ports: { app: { range: [44710, 44800], env: "PORT" } },
      processes: { app: { adapter: "command", command: [process.execPath, "server.mjs"], env: { CLOSE_FILE: closeMarker }, ports: ["app"], health: { type: "http", port: "app", timeoutMs: 5000 } } },
      profiles: { default: { processes: ["app"] } },
    }), "utf8");
    const invoke = async (args: string[]) => {
      let stdout = "";
      const code = await runCli([...args, "--json", "--state-dir", stateDir], { cwd, stdout: (text) => { stdout += text; }, stderr: () => undefined });
      return { code, value: JSON.parse(stdout) as Record<string, unknown> };
    };
    try {
      expect((await invoke(["up", "--trust"])).code).toBe(0);
      await writeFile(closeMarker, "close\n");
      for (let attempt = 0; attempt < 100; attempt += 1) {
        const status = await invoke(["status"]);
        if (status.value.state === "degraded") break;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      expect((await invoke(["status"])).value.state).toBe("degraded");
      const restarted = await invoke(["up"]);
      expect(restarted.code, JSON.stringify(restarted.value)).toBe(0);
      expect(restarted.value.state).toBe("ready");
    } finally { await invoke(["down"]).catch(() => undefined); }
  }, 20_000);

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

  it("does not infer HTTP URLs from inactive profile nodes", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "devfn-profile-url-"));
    const stateDir = await mkdtemp(path.join(tmpdir(), "devfn-state-"));
    await writeFile(path.join(cwd, "server.mjs"), "import net from 'node:net'; const server = net.createServer(); server.listen(Number(process.env.PORT), '127.0.0.1');\n", "utf8");
    await writeFile(path.join(cwd, "devfn.config.json"), JSON.stringify({
      version: 1, project: { id: "profile-url" }, ports: { app: { range: [44600, 44700], env: "PORT" } },
      processes: {
        worker: { adapter: "command", command: [process.execPath, "server.mjs"], ports: ["app"], health: { type: "tcp", port: "app", timeoutMs: 5000 } },
        web: { adapter: "command", command: [process.execPath, "server.mjs"], ports: ["app"], health: { type: "http", port: "app", timeoutMs: 5000 } },
      },
      profiles: { default: { processes: ["worker"] }, web: { processes: ["web"] } },
    }), "utf8");
    const invoke = async (args: string[]) => {
      let stdout = "";
      const code = await runCli([...args, "--json", "--state-dir", stateDir], { cwd, stdout: (text) => { stdout += text; }, stderr: () => undefined });
      return { code, value: JSON.parse(stdout) as Record<string, unknown> };
    };
    try {
      expect((await invoke(["up", "--trust"])).code).toBe(0);
      expect((await invoke(["url"])).value.urls).toEqual({});
    } finally { await invoke(["down"]).catch(() => undefined); }
  }, 15_000);

  it("matches exact-port diagnostics by protocol", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "devfn-doctor-"));
    const stateDir = await mkdtemp(path.join(tmpdir(), "devfn-state-"));
    const server = createServer();
    await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("TCP test server did not receive a port.");
    await writeFile(path.join(cwd, "devfn.config.json"), JSON.stringify({
      version: 1, project: { id: "udp-doctor" }, ports: { udp: { preferred: address.port, exact: true, protocol: "udp" } },
      processes: { worker: { adapter: "command", command: [process.execPath, "-e", "process.exit(0)"], ports: ["udp"] } }, profiles: { default: { processes: ["worker"] } },
    }), "utf8");
    let stdout = "";
    try {
      expect(await runCli(["doctor", "--trust", "--json", "--state-dir", stateDir], { cwd, stdout: (text) => { stdout += text; }, stderr: () => undefined }), stdout).toBe(0);
      const diagnostics = JSON.parse(stdout).diagnostics as Array<{ code: string }>;
      expect(diagnostics.some((item) => item.code === "DEVFN_EXACT_PORT_OCCUPIED")).toBe(false);
    } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
  });

  it("does not report the running instance's exact port as a doctor conflict", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "devfn-doctor-owned-"));
    const stateDir = await mkdtemp(path.join(tmpdir(), "devfn-state-"));
    const probe = createServer();
    await new Promise<void>((resolve, reject) => { probe.once("error", reject); probe.listen(0, "127.0.0.1", resolve); });
    const address = probe.address();
    if (!address || typeof address === "string") throw new Error("TCP test server did not receive a port.");
    await new Promise<void>((resolve) => probe.close(() => resolve()));
    await writeFile(path.join(cwd, "server.mjs"), "import net from 'node:net'; const server = net.createServer(); server.listen(Number(process.env.PORT), '127.0.0.1');\n", "utf8");
    await writeFile(path.join(cwd, "devfn.config.json"), JSON.stringify({
      version: 1, project: { id: "doctor-owned" }, ports: { app: { preferred: address.port, exact: true, env: "PORT" } },
      processes: { app: { adapter: "command", command: [process.execPath, "server.mjs"], ports: ["app"], health: { type: "tcp", port: "app", timeoutMs: 5000 } } },
      profiles: { default: { processes: ["app"] } },
    }), "utf8");
    const invoke = async (args: string[]) => {
      let stdout = "";
      const code = await runCli([...args, "--json", "--state-dir", stateDir], { cwd, stdout: (text) => { stdout += text; }, stderr: () => undefined });
      return { code, value: JSON.parse(stdout) as { diagnostics?: Array<{ code: string }> } };
    };
    try {
      expect((await invoke(["up", "--trust"])).code).toBe(0);
      const registry = JSON.parse(await readFile(path.join(stateDir, "registry.json"), "utf8")) as { allocations: Array<{ state: string; process?: { pid: number } }> };
      expect(registry.allocations[0], JSON.stringify(registry)).toMatchObject({ state: "active", process: { pid: expect.any(Number) } });
      const doctor = await invoke(["doctor"]);
      expect(doctor.code, JSON.stringify(doctor.value)).toBe(0);
      expect(doctor.value.diagnostics?.some((item) => item.code === "DEVFN_EXACT_PORT_OCCUPIED")).toBe(false);
      if (process.platform !== "win32") {
        const originalPath = process.env.PATH;
        const toolsDir = await mkdtemp(path.join(tmpdir(), "devfn-tools-"));
        await symlink("/bin/ps", path.join(toolsDir, "ps"));
        try {
          process.env.PATH = toolsDir;
          const unavailable = await invoke(["doctor"]);
          expect(unavailable.code, JSON.stringify(unavailable.value)).toBe(0);
          expect(unavailable.value.diagnostics?.some((item) => item.code === "DEVFN_LISTENER_INSPECTION_UNAVAILABLE")).toBe(true);
        } finally { process.env.PATH = originalPath; }
      }
    } finally { await invoke(["down"]).catch(() => undefined); }
  }, 15_000);

  it("fails closed when local TCP listener ownership cannot be inspected", async () => {
    if (process.platform === "win32") return;
    const cwd = await mkdtemp(path.join(tmpdir(), "devfn-listener-tools-"));
    const stateDir = await mkdtemp(path.join(tmpdir(), "devfn-state-"));
    const toolsDir = await mkdtemp(path.join(tmpdir(), "devfn-tools-"));
    await symlink("/bin/ps", path.join(toolsDir, "ps"));
    await writeFile(path.join(cwd, "server.mjs"), "import net from 'node:net'; net.createServer().listen(Number(process.env.PORT), '127.0.0.1');\n", "utf8");
    await writeFile(path.join(cwd, "devfn.config.json"), JSON.stringify({
      version: 1, project: { id: "listener-tools" }, ports: { app: { range: [45300, 45400], env: "PORT" } },
      processes: { app: { adapter: "command", command: [process.execPath, "server.mjs"], ports: ["app"], health: { type: "tcp", port: "app", timeoutMs: 5000 } } },
      profiles: { default: { processes: ["app"] } },
    }), "utf8");
    const originalPath = process.env.PATH;
    let stdout = "";
    try {
      process.env.PATH = toolsDir;
      expect(await runCli(["doctor", "--trust", "--json", "--state-dir", stateDir], { cwd, stdout: (text) => { stdout += text; }, stderr: () => undefined })).toBe(1);
      expect(JSON.parse(stdout).diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ code: "DEVFN_LISTENER_INSPECTION_UNAVAILABLE", severity: "error" })]));
      stdout = "";
      expect(await runCli(["up", "--trust", "--json", "--state-dir", stateDir], { cwd, stdout: (text) => { stdout += text; }, stderr: () => undefined })).toBe(1);
      expect(JSON.parse(stdout).error.message).toContain("could not be inspected");
    } finally { process.env.PATH = originalPath; }
  }, 15_000);

  it("waits for an unprobed process to bind its declared port", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "devfn-slow-listener-"));
    const stateDir = await mkdtemp(path.join(tmpdir(), "devfn-state-"));
    await writeFile(path.join(cwd, "server.mjs"), "import net from 'node:net'; setTimeout(() => net.createServer().listen(Number(process.env.PORT), '127.0.0.1'), 900);\n", "utf8");
    await writeFile(path.join(cwd, "devfn.config.json"), JSON.stringify({
      version: 1, project: { id: "slow-listener" }, ports: { app: { range: [45410, 45500], env: "PORT" } },
      processes: { app: { adapter: "command", command: [process.execPath, "server.mjs"], ports: ["app"] } },
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
      const allocation = (up.value.allocations as Array<{ port: number }>)[0];
      expect(await isPortAvailable(allocation.port)).toBe(false);
    }
    finally { await invoke(["down"]).catch(() => undefined); }
  }, 15_000);

  it("reports an unrelated listener that replaces a recorded exact-port owner", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "devfn-doctor-replaced-"));
    const stateDir = await mkdtemp(path.join(tmpdir(), "devfn-state-"));
    const probe = createServer();
    await new Promise<void>((resolve, reject) => { probe.once("error", reject); probe.listen(0, "127.0.0.1", resolve); });
    const address = probe.address();
    if (!address || typeof address === "string") throw new Error("TCP test server did not receive a port.");
    await new Promise<void>((resolve) => probe.close(() => resolve()));
    const closeMarker = path.join(cwd, "close-listener");
    await writeFile(path.join(cwd, "server.mjs"), "import { existsSync } from 'node:fs'; import net from 'node:net'; const server = net.createServer(); server.listen(Number(process.env.PORT), '127.0.0.1'); setInterval(() => { if (existsSync(process.env.CLOSE_FILE)) server.close(); }, 25);\n", "utf8");
    await writeFile(path.join(cwd, "devfn.config.json"), JSON.stringify({
      version: 1, project: { id: "doctor-replaced" }, ports: { app: { preferred: address.port, exact: true, env: "PORT" } },
      processes: { app: { adapter: "command", command: [process.execPath, "server.mjs"], env: { CLOSE_FILE: closeMarker }, ports: ["app"], health: { type: "tcp", port: "app", timeoutMs: 5000 } } },
      profiles: { default: { processes: ["app"] } },
    }), "utf8");
    const invoke = async (args: string[]) => {
      let stdout = "";
      const code = await runCli([...args, "--json", "--state-dir", stateDir], { cwd, stdout: (text) => { stdout += text; }, stderr: () => undefined });
      return { code, value: JSON.parse(stdout) as { diagnostics?: Array<{ code: string }> } };
    };
    const replacement = createServer();
    try {
      expect((await invoke(["up", "--trust"])).code).toBe(0);
      await writeFile(closeMarker, "close\n");
      for (let attempt = 0; attempt < 100 && !await isPortAvailable(address.port); attempt += 1) await new Promise((resolve) => setTimeout(resolve, 25));
      expect(await isPortAvailable(address.port)).toBe(true);
      await new Promise<void>((resolve, reject) => { replacement.once("error", reject); replacement.listen(address.port, "127.0.0.1", resolve); });
      const doctor = await invoke(["doctor"]);
      expect(doctor.code).toBe(1);
      expect(doctor.value.diagnostics?.some((item) => item.code === "DEVFN_EXACT_PORT_OCCUPIED"), JSON.stringify(doctor.value)).toBe(true);
    } finally {
      await new Promise<void>((resolve) => replacement.close(() => resolve()));
      await invoke(["down"]).catch(() => undefined);
    }
  }, 15_000);

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
    stdout = "";
    expect(await runCli(["status", "--json", "--state-dir", stateDir], { cwd, stdout: (text) => { stdout += text; }, stderr: () => undefined })).toBe(0);
    expect(JSON.parse(stdout)).toMatchObject({ ok: false, state: "failed" });
  }, 15_000);
});
