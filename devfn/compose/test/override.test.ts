import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ComposeController, renderComposeOverride } from "../src/index.js";

describe("ComposeController", () => {
  it("exposes availability as a non-throwing diagnostic", async () => {
    const available = new ComposeController(async () => ({ stdout: "2.24.4", stderr: "" }));
    const tooOld = new ComposeController(async () => ({ stdout: "Docker Compose version v2.23.99", stderr: "" }));
    const unavailable = new ComposeController(async () => { throw new Error("missing"); });
    expect(await available.available()).toBe(true);
    expect(await tooOld.available()).toBe(false);
    expect(await unavailable.available()).toBe(false);
  });

  it("keeps conventional container ports behind allocated loopback ports", () => {
    const output = renderComposeOverride({ adapter: "compose", service: "postgres", ports: { database: 5432 } }, { database: 55432 });
    expect(output).toContain("127.0.0.1:55432:5432");
    expect(output).toContain("ports: !override");
  });

  it("binds explicitly public ports and disables persistence for secret-bearing logs", () => {
    const output = renderComposeOverride(
      { adapter: "compose", service: "api", ports: { api: 8080 }, secretEnv: ["API_TOKEN"], envAllowlist: ["API_TOKEN"] },
      { api: 48080 },
      { api: "0.0.0.0" },
    );
    expect(output).toContain("0.0.0.0:48080:8080");
    expect(output).toContain("driver: none");
  });

  it("renders a valid empty service override", () => {
    expect(renderComposeOverride({ adapter: "compose", service: "worker" }, {})).toContain("worker:\n    {}");
    expect(renderComposeOverride({ adapter: "compose", service: "worker" }, {}, {}, {}, { instanceId: "instance", lifecycleName: "worker" })).toContain('devfn.managed: "true"');
  });

  it("rejects a missing host allocation", () => {
    expect(() => renderComposeOverride({ adapter: "compose", service: "api", ports: { api: 8080 } }, {})).toThrow(/Missing allocation/);
  });

  it("passes the effective environment to every Compose query and lifecycle command", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "devfn-compose-"));
    const calls: Array<{ args: readonly string[]; cwd?: string; appPort?: string; dockerHost?: string }> = [];
    const controller = new ComposeController(async (_file, args, options) => {
      calls.push({ args, cwd: options.cwd, appPort: options.env?.APP_PORT, dockerHost: options.env?.DOCKER_HOST });
      if (args.includes("version")) return { stdout: "2.24.4", stderr: "" };
      if (args.includes("ps")) return { stdout: calls.filter((call) => call.args.includes("ps")).length === 3 ? "container-id\n" : "", stderr: "" };
      if (args[0] === "inspect") return { stdout: "true\n", stderr: "" };
      if (args[0] === "logs") return { stdout: "standard output\n", stderr: "standard error\n" };
      return { stdout: "", stderr: "" };
    });
    const managed = await controller.start({
      name: "api", spec: { adapter: "compose", service: "api", env: { APP_PORT: "4100" }, health: { type: "log", pattern: "standard output" } }, root, runtimeDir: path.join(root, ".devfn", "instances", "test"), instanceId: "test",
      ports: {}, environment: { APP_PORT: "generated", DOCKER_HOST: "tcp://docker.example:2376" },
    });
    expect(managed.containerIds).toEqual(["container-id"]);
    expect(calls.filter((call) => call.args[0] === "compose").every((call) => call.cwd === root && call.appPort === "generated" && call.dockerHost === "tcp://docker.example:2376")).toBe(true);
    const up = calls.find((call) => call.args.includes("up"));
    expect(up?.args).not.toContain("--no-recreate");
    const readinessLogs = calls.find((call) => call.args[0] === "logs" && call.args.includes("--since"));
    expect(readinessLogs?.args[readinessLogs.args.indexOf("--since") + 1]).toBe(managed.startedAt);
    expect(await controller.logs(managed)).toBe("standard output\nstandard error\n");
    await controller.stop(managed);
    expect(calls.filter((call) => ["inspect", "logs", "stop", "rm"].includes(call.args[0])).every((call) => call.dockerHost === "tcp://docker.example:2376")).toBe(true);
  });

  it("clears ambient Docker selectors for new receipts but retains them for legacy receipts", async () => {
    const original = process.env.DOCKER_HOST;
    process.env.DOCKER_HOST = "tcp://ambient.example:2376";
    const observed: Array<string | undefined> = [];
    const controller = new ComposeController(async (_file, _args, options) => {
      observed.push(options.env?.DOCKER_HOST);
      return { stdout: "true\n", stderr: "" };
    });
    const service = { name: "api", composeService: "api", projectName: "devfn-test", files: [], containerIds: ["container-id"], preExisting: false, wasRunning: false, startedAt: new Date().toISOString() };
    try {
      await controller.status({ ...service, dockerEnvironment: {} });
      await controller.status(service);
    } finally {
      if (original === undefined) delete process.env.DOCKER_HOST;
      else process.env.DOCKER_HOST = original;
    }
    expect(observed).toEqual([undefined, "tcp://ambient.example:2376"]);
  });

  it("preserves user-owned services but reclaims abandoned DevFn containers", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "devfn-compose-owner-"));
    const runCase = async (projectName: string | undefined) => {
      const calls: readonly string[][] = [];
      let psCalls = 0;
      const controller = new ComposeController(async (_file, args) => {
        (calls as string[][]).push([...args]);
        if (args.includes("version")) return { stdout: "2.24.4", stderr: "" };
        if (args.includes("ps")) { psCalls += 1; return { stdout: `${projectName || psCalls < 3 ? "old-id" : "new-id"}\n`, stderr: "" }; }
        if (args[0] === "inspect") return { stdout: args.some((arg) => arg.includes("devfn.managed")) ? (projectName ? "\n" : "true\tmanaged\tapi\n") : "true\n", stderr: "" };
        return { stdout: "", stderr: "" };
      });
      const managed = await controller.start({
        name: "api", spec: { adapter: "compose", service: "api", ...(projectName ? { projectName } : {}) }, root,
        runtimeDir: path.join(root, ".devfn", "instances", projectName ?? "managed"), instanceId: projectName ?? "managed", ports: {},
      });
      return { calls, controller, managed };
    };

    const userOwned = await runCase("shared-project");
    expect(userOwned.calls.find((args) => args.includes("up"))).toContain("--no-recreate");
    expect(userOwned.managed).toMatchObject({ preExisting: true, wasRunning: true });
    await userOwned.controller.stop(userOwned.managed);
    expect(userOwned.calls.some((args) => args[0] === "stop")).toBe(false);

    const abandoned = await runCase(undefined);
    expect(abandoned.calls.find((args) => args.includes("up"))).not.toContain("--no-recreate");
    expect(abandoned.managed).toMatchObject({ containerIds: ["new-id"], preExisting: false, wasRunning: false });
    await abandoned.controller.stop(abandoned.managed);
    expect(abandoned.calls.some((args) => args[0] === "stop" && args.includes("new-id"))).toBe(true);
  });

  it("restores only user-owned containers that DevFn started", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "devfn-compose-mixed-"));
    const calls: string[][] = [];
    const controller = new ComposeController(async (_file, args) => {
      calls.push([...args]);
      if (args.includes("version")) return { stdout: "2.24.4", stderr: "" };
      if (args.includes("ps")) return { stdout: args.includes("-a") ? "running-id\nstopped-id\n" : "running-id\n", stderr: "" };
      if (args[0] === "inspect") return { stdout: "\n", stderr: "" };
      return { stdout: "", stderr: "" };
    });
    const managed = await controller.start({
      name: "api", spec: { adapter: "compose", service: "api", projectName: "shared" }, root,
      runtimeDir: path.join(root, ".devfn", "instances", "current"), instanceId: "current", ports: {},
    });
    expect(managed).toMatchObject({ preExisting: true, wasRunning: false, startedContainerIds: ["stopped-id"] });
    await controller.stop(managed);
    expect(calls.find((args) => args[0] === "stop")).toEqual(["stop", "stopped-id"]);
    expect(calls.some((args) => args[0] === "rm")).toBe(false);
  });

  it("does not reclaim a container owned by another DevFn lifecycle", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "devfn-compose-other-owner-"));
    const calls: string[][] = [];
    const controller = new ComposeController(async (_file, args) => {
      calls.push([...args]);
      if (args.includes("version")) return { stdout: "2.24.4", stderr: "" };
      if (args.includes("ps")) return { stdout: "old-id\n", stderr: "" };
      if (args[0] === "inspect") return { stdout: args.some((arg) => arg.includes("devfn.managed")) ? "true\tother-instance\tapi\n" : "true\n", stderr: "" };
      return { stdout: "", stderr: "" };
    });
    const managed = await controller.start({
      name: "api", spec: { adapter: "compose", service: "api", projectName: "shared" }, root,
      runtimeDir: path.join(root, ".devfn", "instances", "current"), instanceId: "current", ports: {},
    });
    expect(calls.find((args) => args.includes("up"))).toContain("--no-recreate");
    expect(managed).toMatchObject({ preExisting: true, startedContainerIds: [] });
  });

  it("cleans a replacement DevFn container when startup journaling fails", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "devfn-compose-replace-"));
    const calls: string[][] = [];
    let psCalls = 0;
    const controller = new ComposeController(async (_file, args) => {
      calls.push([...args]);
      if (args.includes("version")) return { stdout: "2.24.4", stderr: "" };
      if (args.includes("ps")) { psCalls += 1; return { stdout: `${psCalls < 3 ? "old-id" : "new-id"}\n`, stderr: "" }; }
      if (args[0] === "inspect") return { stdout: "true\tmanaged\tapi\n", stderr: "" };
      return { stdout: "", stderr: "" };
    });
    await expect(controller.start({
      name: "api", spec: { adapter: "compose", service: "api" }, root,
      runtimeDir: path.join(root, ".devfn", "instances", "managed"), instanceId: "managed", ports: {},
      onStarted: async () => { throw new Error("journal failed"); },
    })).rejects.toMatchObject({ code: "DEVFN_COMPOSE_START_FAILED", details: { cause: "journal failed" } });
    expect(calls.some((args) => args[0] === "stop" && args.includes("new-id"))).toBe(true);
    expect(calls.some((args) => args[0] === "rm" && args.includes("new-id"))).toBe(true);
  });
});
