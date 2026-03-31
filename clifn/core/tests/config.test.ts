import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createProjectConfig, InvalidConfigError } from "../src/config.js";

describe("config", () => {
  it("reads and writes json config", () => {
    const dir = mkdtempSync(join(tmpdir(), "clifn-config-"));
    const path = join(dir, "conduct.config.json");
    const store = createProjectConfig(path);

    store.set("profile", "default");
    store.set("projectId", "proj_123");

    expect(store.get("profile")).toBe("default");
    expect(store.read()).toEqual({
      profile: "default",
      projectId: "proj_123",
    });
  });

  it("throws typed error for invalid config json", () => {
    const dir = mkdtempSync(join(tmpdir(), "clifn-config-invalid-"));
    const path = join(dir, "conduct.config.json");
    writeFileSync(path, "{invalid-json", "utf8");
    const store = createProjectConfig(path);

    expect(() => store.read()).toThrow(InvalidConfigError);
  });
});
