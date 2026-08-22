import { describe, expect, it } from "vitest";
import { createPlan } from "../src/index.js";

const config = {
  version: 1 as const,
  project: { id: "sample" },
  ports: { app: { preferred: 4100 }, db: { preferred: 55432 } },
  services: { db: { adapter: "compose" as const, service: "postgres", ports: { db: 5432 } } },
  processes: { app: { adapter: "npm" as const, script: "dev", ports: ["app"], dependsOn: ["db"] } },
  profiles: { default: { processes: ["app"] } },
};

describe("lifecycle planner", () => {
  it("includes dependencies and orders them first", () => {
    expect(createPlan(config).nodes.map((node) => node.name)).toEqual(["db", "app"]);
  });

  it("rejects dependency cycles", () => {
    const cyclic = { ...config, services: { db: { ...config.services.db, dependsOn: ["app"] } } };
    expect(() => createPlan(cyclic)).toThrow(/cycle/);
  });

  it("includes the lifecycle owner of a selected proxy hostname", () => {
    const proxied = { ...config, profiles: { default: { proxy: true } }, hostnames: { app: { target: "app" } } };
    expect(createPlan(proxied).nodes.map((node) => node.name)).toEqual(["db", "app"]);
  });
});
