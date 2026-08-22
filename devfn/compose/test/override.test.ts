import { describe, expect, it } from "vitest";
import { ComposeController, renderComposeOverride } from "../src/index.js";

describe("ComposeController", () => {
  it("exposes availability as a non-throwing diagnostic", async () => {
    expect(typeof await new ComposeController().available()).toBe("boolean");
  });

  it("keeps conventional container ports behind allocated loopback ports", () => {
    const output = renderComposeOverride({ adapter: "compose", service: "postgres", ports: { database: 5432 } }, { database: 55432 });
    expect(output).toContain("127.0.0.1:55432:5432");
  });
});
