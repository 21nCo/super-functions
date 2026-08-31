import { describe, expect, it } from "vitest";
import { calloutExtension, commonmarkExtension } from "@mdfn/extensions";
import { createRegistry } from "./index";

describe("registry", () => {
  it("resolves registered profiles", () => {
    const registry = createRegistry({ extensions: [commonmarkExtension, calloutExtension] });
    registry.registerProfile({ name: "docs", version: "1", extensions: [calloutExtension.name] });
    expect(registry.profile("docs").registry.extensions.map((entry) => entry.name)).toEqual(["commonmark", "directive/callout"]);
  });

  it("accepts initial extensions before their dependencies", () => {
    const dependent = { ...calloutExtension, name: "dependent", dependencies: ["base"] };
    const base = { ...commonmarkExtension, name: "base" };
    const registry = createRegistry({ extensions: [dependent, base] });
    expect(registry.listExtensions().map((entry) => entry.name)).toEqual(["base", "dependent"]);
  });
});
