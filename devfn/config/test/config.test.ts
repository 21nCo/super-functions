import { describe, expect, it } from "vitest";

import { validateDevFnConfig, validateDevFnPolicy } from "../src/index.js";

describe("DevFn configuration", () => {
  it("validates named ports, processes, services, profiles, and hostnames", () => {
    const config = validateDevFnConfig({
      version: 1,
      project: { id: "sample" },
      ports: { app: { preferred: 3200, range: [3200, 3299], env: "PORT" }, db: { preferred: 5432, exact: true, internal: 5432 } },
      processes: { app: { adapter: "npm", script: "dev", ports: ["app"], dependsOn: ["db"], health: { type: "http", port: "app", path: "/health" } } },
      services: { db: { adapter: "compose", service: "postgres", ports: { db: 5432 }, persistent: true } },
      profiles: { default: { processes: ["app"], services: ["db"] } },
      hostnames: { app: { target: "app" } },
    });
    expect(config.project.id).toBe("sample");
    expect(config.services?.db.persistent).toBe(true);
  });

  it("rejects unsafe paths and dangling references", () => {
    expect(() => validateDevFnConfig({ version: 1, project: { id: "x" }, runtimeDir: "../outside", profiles: { default: {} } })).toThrow(/inside the repository/);
    expect(() => validateDevFnConfig({ version: 1, project: { id: "x" }, profiles: { default: { processes: ["missing"] } } })).toThrow(/unknown process/);
  });

  it("validates structured organization policy", () => {
    expect(validateDevFnPolicy({ version: 1, fallbackRange: [4000, 4999], ports: [{ name: "postgres", port: 5432, kind: "protected" }] }).ports).toHaveLength(1);
  });

  it("requires explicit redaction metadata for inherited secrets", () => {
    const base = { version: 1, project: { id: "x" }, profiles: { default: { processes: ["app"] } } };
    expect(() => validateDevFnConfig({ ...base, processes: { app: { adapter: "command", command: ["node"], envAllowlist: ["API_TOKEN"] } } })).toThrow(/secretEnv/);
    expect(validateDevFnConfig({ ...base, processes: { app: { adapter: "command", command: ["node"], envAllowlist: ["API_TOKEN"], secretEnv: ["API_TOKEN"] } } }).processes?.app.secretEnv).toEqual(["API_TOKEN"]);
  });
});
