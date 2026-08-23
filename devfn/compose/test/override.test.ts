import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ComposeController, renderComposeOverride } from "../src/index.js";

describe("ComposeController", () => {
  it("exposes availability as a non-throwing diagnostic", async () => {
    const available = new ComposeController(async () => ({ stdout: "Docker Compose version v2", stderr: "" }));
    const unavailable = new ComposeController(async () => { throw new Error("missing"); });
    expect(await available.available()).toBe(true);
    expect(await unavailable.available()).toBe(false);
  });

  it("keeps conventional container ports behind allocated loopback ports", () => {
    const output = renderComposeOverride({ adapter: "compose", service: "postgres", ports: { database: 5432 } }, { database: 55432 });
    expect(output).toContain("127.0.0.1:55432:5432");
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
  });

  it("rejects a missing host allocation", () => {
    expect(() => renderComposeOverride({ adapter: "compose", service: "api", ports: { api: 8080 } }, {})).toThrow(/Missing allocation/);
  });

  it("passes the effective environment to every Compose query and lifecycle command", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "devfn-compose-"));
    const composeCalls: Array<{ args: readonly string[]; cwd?: string; appPort?: string }> = [];
    const controller = new ComposeController(async (_file, args, options) => {
      if (args[0] === "compose") composeCalls.push({ args, cwd: options.cwd, appPort: options.env?.APP_PORT });
      if (args.includes("version")) return { stdout: "Docker Compose version v2", stderr: "" };
      if (args.includes("ps")) return { stdout: composeCalls.filter((call) => call.args.includes("ps")).length === 3 ? "container-id\n" : "", stderr: "" };
      if (args[0] === "inspect") return { stdout: "true\n", stderr: "" };
      return { stdout: "", stderr: "" };
    });
    const managed = await controller.start({
      name: "api", spec: { adapter: "compose", service: "api", env: { APP_PORT: "4100" } }, root, runtimeDir: path.join(root, ".devfn", "instances", "test"), instanceId: "test",
      ports: {}, environment: { APP_PORT: "generated" },
    });
    expect(managed.containerIds).toEqual(["container-id"]);
    expect(composeCalls.filter((call) => call.args.includes("ps") || call.args.includes("up")).every((call) => call.cwd === root && call.appPort === "4100")).toBe(true);
  });
});
