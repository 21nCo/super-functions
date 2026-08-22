import { describe, expect, it } from "vitest";
import { createFakeListener, fixtureConfig } from "../src/index.js";

describe("DevFn testing helpers", () => {
  it("creates closeable ephemeral listeners", async () => {
    const listener = await createFakeListener();
    expect(listener.port).toBeGreaterThan(0);
    await listener.close();
  });

  it("creates a complete fixture manifest", () => expect(fixtureConfig().profiles.default.processes).toEqual(["app"]));
});
