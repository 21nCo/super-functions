import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { ComposeController, composeProjectName, createComposeEnvironment, renderComposeOverride, type ManagedComposeService } from "../src/index.js";

const execFileAsync = promisify(execFile);

describe("ComposeController", () => {
  it("keeps case-distinct opaque owners in separate stable Compose projects", () => {
    expect(composeProjectName("blue", "Owner")).not.toBe(composeProjectName("BLUE", "owner"));
    expect(composeProjectName("blue", "OWNER")).not.toBe(composeProjectName("blue", "owner-0559aadba9e2"));
    expect(composeProjectName("blue", "Owner")).toBe(composeProjectName("BLUE", "Owner"));
    expect(composeProjectName("blue", "--token=synthetic-sentinel")).not.toContain("synthetic-sentinel");
  });

  it.skipIf(process.env.DEVFN_REAL_COMPOSE !== "1")("isolates simultaneous case-distinct owners through stop and retry", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "devfn-compose-dual-owner-"));
    const file = path.join(root, "compose.yaml");
    const controller = new ComposeController();
    const prefix = path.basename(root).toLowerCase().slice(0, 22);
    const owners = ["Owner", "owner"];
    await writeFile(file, 'services:\n  api:\n    image: node:22-alpine\n    command: ["node", "-e", "setInterval(() => {}, 1000)"]\n');
    const start = (owner: string) => controller.start({ name: "api", spec: { adapter: "compose", service: "api", projectName: prefix }, root,
      runtimeDir: path.join(root, owner), instanceId: owner, ports: {} });
    try {
      const first = await start(owners[0]);
      const second = await start(owners[1]);
      expect(first.projectName).not.toBe(second.projectName);
      expect(first.containerIds[0]).not.toBe(second.containerIds[0]);
      await controller.stop(first);
      expect(await controller.status(second)).toBe("running");
      await controller.stop(second);
      const retried = await start(owners[0]);
      expect(retried.projectName).toBe(first.projectName);
      expect(await controller.status(retried)).toBe("running");
    } finally {
      for (const owner of owners) await execFileAsync("docker", ["compose", "-p", composeProjectName(prefix, owner), "-f", file, "down"], { cwd: root }).catch(() => undefined);
      await rm(root, { recursive: true, force: true });
    }
  }, 60_000);
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

  it("sanitizes readiness and lifecycle environments with generated values taking precedence", () => {
    expect(createComposeEnvironment(
      { adapter: "compose", service: "api", envAllowlist: ["ALLOWED"], env: { APP_PORT: "configured" } },
      { APP_PORT: "4100" },
      { PATH: "/bin", ALLOWED: "yes", SECRET_TOKEN: "no" },
    )).toMatchObject({ PATH: "/bin", ALLOWED: "yes", APP_PORT: "4100" });
    expect(createComposeEnvironment(
      { adapter: "compose", service: "api", envAllowlist: ["ALLOWED"], env: { APP_PORT: "configured" } },
      { APP_PORT: "4100" },
      { PATH: "/bin", ALLOWED: "yes", SECRET_TOKEN: "no" },
    )).not.toHaveProperty("SECRET_TOKEN");
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
    await controller.logs(managed, 0);
    expect(calls.findLast((call) => call.args[0] === "logs")?.args).toEqual(["logs", "--tail", "0", "container-id"]);
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
        if (args.includes("config")) return { stdout: JSON.stringify({ services: { api: { environment: {} } } }), stderr: "" };
        if (args[0] === "image") return { stdout: '["PATH=/bin"]\n', stderr: "" };
        if (args.includes("{{json .Config.Env}}")) return { stdout: '["PATH=/bin"]\n', stderr: "" };
        if (args.includes("{{.Image}}")) return { stdout: "image-id\n", stderr: "" };
        if (args[0] === "inspect") return { stdout: args.some((arg) => arg.includes("devfn.managed")) ? (projectName ? "<no value>\t<no value>\t<no value>\n" : "true\tmanaged\tapi\n") : "true\n", stderr: "" };
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

  it("refuses stale environment in an unmanaged container before Compose up", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "devfn-compose-stale-"));
    for (const running of [true, false]) {
      const calls: string[][] = [];
      const controller = new ComposeController(async (_file, args) => {
        calls.push([...args]);
        if (args.includes("version")) return { stdout: "2.24.4", stderr: "" };
        if (args.includes("ps")) return { stdout: args.includes("-a") || running ? "old-id\n" : "", stderr: "" };
        if (args.includes("config")) return { stdout: JSON.stringify({ services: { api: { environment: { DEVFN_PORT_API: "4102" } } } }), stderr: "" };
        if (args[0] === "inspect") return { stdout: args.includes("{{json .Config.Env}}") ? '["DEVFN_PORT_API=4101"]\n' : "<no value>\t<no value>\t<no value>\n", stderr: "" };
        return { stdout: "", stderr: "" };
      });
      await expect(controller.start({ name: "api", spec: { adapter: "compose", service: "api", projectName: "shared" }, root,
        runtimeDir: path.join(root, ".devfn", "instances", "owner"), instanceId: "owner", ports: {}, environment: { DEVFN_PORT_API: "4102" } })).rejects.toThrow(/stale startup environment/);
      expect(calls.some((args) => args.includes("up"))).toBe(false);
      expect(calls.some((args) => args[0] === "stop" || args[0] === "rm")).toBe(false);
    }
  });

  it("refuses removed DevFn startup keys in stopped and running unmanaged containers", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "devfn-compose-removed-env-"));
    try {
      for (const running of [true, false]) {
        for (const removed of ["DEVFN_URL_API", "DEVFN_PORT_API"]) {
          const calls: string[][] = [];
          const controller = new ComposeController(async (_file, args) => {
            calls.push([...args]);
            if (args.includes("version")) return { stdout: "2.24.4", stderr: "" };
            if (args.includes("ps")) return { stdout: args.includes("-a") || running ? "old-id\n" : "", stderr: "" };
            if (args.includes("config")) return { stdout: JSON.stringify({ services: { api: { environment: { MODE: "current" } } } }), stderr: "" };
            if (args[0] === "inspect") return { stdout: args.includes("{{json .Config.Env}}") ? JSON.stringify(["MODE=current", `${removed}=synthetic-sentinel`]) + "\n" : "<no value>\t<no value>\t<no value>\n", stderr: "" };
            return { stdout: "", stderr: "" };
          });
          const error = await controller.start({ name: "api", spec: { adapter: "compose", service: "api", projectName: "shared" }, root,
            runtimeDir: path.join(root, "runtime"), instanceId: "owner", ports: {}, environment: { DEVFN_PROFILE: "default" } }).then(() => "", (failure: Error) => failure.message);
          expect(error).toMatch(/stale startup environment/);
          expect(error).not.toContain("synthetic-sentinel");
          expect(calls.some((args) => args.includes("up") || args[0] === "stop" || args[0] === "rm")).toBe(false);
        }
      }
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it("refuses removed literal startup keys while allowing image defaults", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "devfn-compose-literal-env-"));
    try {
      for (const running of [true, false]) {
        for (const literal of ["MODE", "PROFILE_MODE"]) {
          const calls: string[][] = [];
          const controller = new ComposeController(async (_file, args) => {
            calls.push([...args]);
            if (args.includes("version")) return { stdout: "2.24.4", stderr: "" };
            if (args.includes("ps")) return { stdout: args.includes("-a") || running ? "old-id\n" : "", stderr: "" };
            if (args.includes("config")) return { stdout: JSON.stringify({ services: { api: { environment: { CURRENT: "yes" } } } }), stderr: "" };
            if (args[0] === "image") return { stdout: JSON.stringify(["PATH=/bin"]) + "\n", stderr: "" };
            if (args[0] === "inspect") {
              if (args.includes("{{json .Config.Env}}")) return { stdout: JSON.stringify(["CURRENT=yes", "PATH=/bin", `${literal}=synthetic-sentinel`]) + "\n", stderr: "" };
              if (args.includes("{{.Image}}")) return { stdout: "image-id\n", stderr: "" };
              return { stdout: "<no value>\t<no value>\t<no value>\n", stderr: "" };
            }
            return { stdout: "", stderr: "" };
          });
          const error = await controller.start({ name: "api", spec: { adapter: "compose", service: "api", projectName: "shared" }, root,
            runtimeDir: path.join(root, "runtime"), instanceId: "owner", ports: {}, environment: { CURRENT: "yes" } }).then(() => "", (failure: Error) => failure.message);
          expect(error).toMatch(/stale startup environment/);
          expect(error).not.toContain("synthetic-sentinel");
          expect(calls.some((args) => args.includes("up") || args[0] === "stop" || args[0] === "rm")).toBe(false);
        }
      }
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it.skipIf(process.env.DEVFN_REAL_COMPOSE !== "1")("preserves a real unmanaged container with an old leased value", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "devfn-compose-stale-real-"));
    const file = path.join(root, "compose.yaml");
    const projectPrefix = path.basename(root).toLowerCase().replace(/[^a-z0-9_-]+/g, "-").slice(0, 42);
    const projectName = composeProjectName(projectPrefix, "owner");
    await writeFile(file, 'services:\n  api:\n    image: node:22-alpine\n    command: ["node", "-e", "setInterval(() => {}, 1000)"]\n    environment:\n      DEVFN_PORT_API: "${DEVFN_PORT_API}"\n');
    try {
      await execFileAsync("docker", ["compose", "-p", projectName, "-f", file, "up", "-d", "api"], { cwd: root, env: { ...process.env, DEVFN_PORT_API: "4101" } });
      const controller = new ComposeController();
      await expect(controller.start({ name: "api", spec: { adapter: "compose", service: "api", projectName: projectPrefix }, root,
        runtimeDir: path.join(root, "runtime"), instanceId: "owner", ports: {}, environment: { DEVFN_PORT_API: "4102" } })).rejects.toThrow(/stale startup environment/);
      const { stdout: id } = await execFileAsync("docker", ["compose", "-p", projectName, "-f", file, "ps", "-q", "api"], { cwd: root, env: { ...process.env, DEVFN_PORT_API: "4101" } });
      expect(id.trim()).not.toBe("");
      const { stdout: current } = await execFileAsync("docker", ["inspect", "--format", "{{json .Config.Env}}", id.trim()]);
      expect(JSON.parse(current) as string[]).toContain("DEVFN_PORT_API=4101");
    } finally {
      await execFileAsync("docker", ["compose", "-p", projectName, "-f", file, "down"], { cwd: root, env: { ...process.env, DEVFN_PORT_API: "4101" } }).catch(() => undefined);
      await rm(root, { recursive: true, force: true });
    }
  }, 40_000);

  it.skipIf(process.env.DEVFN_REAL_COMPOSE !== "1")("refuses a removed DevFn URL in a real stopped unmanaged container", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "devfn-compose-removed-real-"));
    const file = path.join(root, "compose.yaml");
    const projectPrefix = path.basename(root).toLowerCase().replace(/[^a-z0-9_-]+/g, "-").slice(0, 42);
    const projectName = composeProjectName(projectPrefix, "owner");
    await writeFile(file, 'services:\n  api:\n    image: node:22-alpine\n    command: ["node", "-e", "setInterval(() => {}, 1000)"]\n    environment:\n      DEVFN_URL_API: "http://api:4101"\n');
    try {
      await execFileAsync("docker", ["compose", "-p", projectName, "-f", file, "up", "-d", "api"], { cwd: root });
      await execFileAsync("docker", ["compose", "-p", projectName, "-f", file, "stop", "api"], { cwd: root });
      await writeFile(file, 'services:\n  api:\n    image: node:22-alpine\n    command: ["node", "-e", "setInterval(() => {}, 1000)"]\n');
      const controller = new ComposeController();
      await expect(controller.start({ name: "api", spec: { adapter: "compose", service: "api", projectName: projectPrefix }, root,
        runtimeDir: path.join(root, "runtime"), instanceId: "owner", ports: {}, environment: { DEVFN_PROFILE: "default" } })).rejects.toThrow(/stale startup environment/);
      const { stdout: id } = await execFileAsync("docker", ["compose", "-p", projectName, "-f", file, "ps", "-a", "-q", "api"], { cwd: root });
      expect(id.trim()).not.toBe("");
      const { stdout: state } = await execFileAsync("docker", ["inspect", "--format", "{{.State.Running}}", id.trim()]);
      expect(state.trim()).toBe("false");
    } finally {
      await execFileAsync("docker", ["compose", "-p", projectName, "-f", file, "down"], { cwd: root }).catch(() => undefined);
      await rm(root, { recursive: true, force: true });
    }
  }, 40_000);

  it.skipIf(process.env.DEVFN_REAL_COMPOSE !== "1")("refuses removed literal environment in real running and stopped unmanaged containers", async () => {
    for (const running of [true, false]) {
      const root = await mkdtemp(path.join(tmpdir(), "devfn-compose-literal-real-"));
      const file = path.join(root, "compose.yaml");
      const projectPrefix = path.basename(root).toLowerCase().replace(/[^a-z0-9_-]+/g, "-").slice(0, 42);
      const projectName = composeProjectName(projectPrefix, "owner");
      await writeFile(file, 'services:\n  api:\n    image: node:22-alpine\n    command: ["node", "-e", "setInterval(() => {}, 1000)"]\n    environment:\n      MODE: "stale-literal"\n');
      try {
        await execFileAsync("docker", ["compose", "-p", projectName, "-f", file, "up", "-d", "api"], { cwd: root });
        if (!running) await execFileAsync("docker", ["compose", "-p", projectName, "-f", file, "stop", "api"], { cwd: root });
        await writeFile(file, 'services:\n  api:\n    image: node:22-alpine\n    command: ["node", "-e", "setInterval(() => {}, 1000)"]\n');
        const controller = new ComposeController();
        const failure = await controller.start({ name: "api", spec: { adapter: "compose", service: "api", projectName: projectPrefix }, root,
          runtimeDir: path.join(root, "runtime"), instanceId: "owner", ports: {}, environment: { DEVFN_PROFILE: "default" } }).then(() => "", (error: Error) => error.message);
        expect(failure).toMatch(/stale startup environment/);
        expect(failure).not.toContain("stale-literal");
        const { stdout: id } = await execFileAsync("docker", ["compose", "-p", projectName, "-f", file, "ps", "-a", "-q", "api"], { cwd: root });
        const { stdout: state } = await execFileAsync("docker", ["inspect", "--format", "{{.State.Running}}", id.trim()]);
        expect(state.trim()).toBe(String(running));
      } finally {
        await execFileAsync("docker", ["compose", "-p", projectName, "-f", file, "down"], { cwd: root }).catch(() => undefined);
        await rm(root, { recursive: true, force: true });
      }
    }
  }, 90_000);

  it("restores only user-owned containers that DevFn started", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "devfn-compose-mixed-"));
    const calls: string[][] = [];
    let allCalls = 0;
    const controller = new ComposeController(async (_file, args) => {
      calls.push([...args]);
      if (args.includes("version")) return { stdout: "2.24.4", stderr: "" };
      if (args.includes("ps") && args.includes("-a")) { allCalls += 1; return { stdout: allCalls === 1 ? "running-id\nstopped-id\n" : "running-id\nstopped-id\ncreated-id\n", stderr: "" }; }
      if (args.includes("ps")) return { stdout: "running-id\n", stderr: "" };
      if (args.includes("config")) return { stdout: JSON.stringify({ services: { api: { environment: {} } } }), stderr: "" };
      if (args.includes("{{json .Config.Env}}")) return { stdout: "[]\n[]\n", stderr: "" };
      if (args[0] === "inspect") return { stdout: args.some((arg) => arg.includes("devfn.managed")) ? "<no value>\t<no value>\t<no value>\n<no value>\t<no value>\t<no value>\n" : "true\ntrue\ntrue\n", stderr: "" };
      return { stdout: "", stderr: "" };
    });
    const managed = await controller.start({
      name: "api", spec: { adapter: "compose", service: "api", projectName: "shared" }, root,
      runtimeDir: path.join(root, ".devfn", "instances", "current"), instanceId: "current", ports: {},
    });
    expect(managed).toMatchObject({ preExisting: true, wasRunning: false, startedContainerIds: ["stopped-id"], createdContainerIds: ["created-id"] });
    await controller.stop(managed);
    expect(calls.find((args) => args[0] === "stop")).toEqual(["stop", "stopped-id", "created-id"]);
    expect(calls.find((args) => args[0] === "rm")).toEqual(["rm", "-f", "created-id"]);
  });

  it("treats already-removed containers as an idempotent cleanup", async () => {
    let present = true;
    const controller = new ComposeController(async (_file, args) => {
      if ((args[0] === "stop" || args[0] === "rm") && !present) throw Object.assign(new Error("container missing"), { stderr: "Error: No such container: created-id" });
      if (args[0] === "rm") present = false;
      return { stdout: "", stderr: "" };
    });
    const managed = { name: "api", composeService: "api", projectName: "shared", files: [], containerIds: ["created-id"], preExisting: true, wasRunning: false, startedContainerIds: [], createdContainerIds: ["created-id"], startedAt: new Date().toISOString() };
    await expect(controller.stop(managed)).resolves.toBeUndefined();
    await expect(controller.stop(managed)).resolves.toBeUndefined();
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
    await expect(controller.start({
      name: "api", spec: { adapter: "compose", service: "api", projectName: "shared" }, root,
      runtimeDir: path.join(root, ".devfn", "instances", "current"), instanceId: "current", ports: {},
    })).rejects.toThrow(/another DevFn lifecycle/);
    expect(calls.some((args) => args.includes("up"))).toBe(false);
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

  it("journals Compose recovery when startup cleanup fails before container IDs are known", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "devfn-compose-recovery-"));
    const calls: string[][] = [];
    let psCalls = 0;
    let cleanupFails = true;
    let recovery: ManagedComposeService | undefined;
    const controller = new ComposeController(async (_file, args) => {
      calls.push([...args]);
      if (args.includes("version")) return { stdout: "2.24.4", stderr: "" };
      if (args.includes("ps")) {
        psCalls += 1;
        if (psCalls === 3) throw new Error("container query failed");
        return { stdout: "", stderr: "" };
      }
      if (args.includes("stop") && cleanupFails) throw new Error("compose cleanup failed");
      return { stdout: "", stderr: "" };
    });
    await expect(controller.start({
      name: "api", spec: { adapter: "compose", service: "api" }, root,
      runtimeDir: path.join(root, ".devfn", "instances", "recovery"), instanceId: "recovery", ports: {},
      onStarted: async (managed) => { recovery = managed; },
    })).rejects.toMatchObject({ code: "DEVFN_COMPOSE_START_FAILED", details: { cleanupCause: "compose cleanup failed" } });
    expect(recovery).toMatchObject({ containerIds: [], composeCwd: root, preExisting: false });
    cleanupFails = false;
    await controller.stop(recovery!);
    expect(calls.filter((args) => args.includes("stop"))).toHaveLength(2);
    expect(calls.some((args) => args.includes("rm"))).toBe(true);
  });
});
