import { describe, expect, it } from "vitest";
import { validateDevFnConfig } from "@devfn/config";
import { createFakeListener, fixtureConfig } from "../src/index.js";

describe("DevFn testing helpers", () => {
  it("creates closeable ephemeral listeners", async () => {
    const listener = await createFakeListener();
    expect(listener.port).toBeGreaterThan(0);
    await listener.close();
  });

  it("creates a complete schema-valid fixture manifest", () => {
    const config = validateDevFnConfig(fixtureConfig());
    expect(config).toMatchObject({
      project: { id: "fixture" },
      ports: { app: { range: [44000, 44100], env: "PORT" } },
      processes: { app: { adapter: "command", ports: ["app"], health: { type: "tcp", port: "app" } } },
      profiles: { default: { processes: ["app"] } },
    });
  });
});
