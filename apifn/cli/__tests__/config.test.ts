import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { defineConfig, loadConfig } from "../src/index.js";

describe("config loading", () => {
  it("TV-CORE-003: loads default apifn.config.ts", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "apifn-cli-config-"));
    await writeFile(
      path.join(cwd, "apifn.config.ts"),
      [
        "export default {",
        "  openapi: { info: { title: 'Test', version: '1.0.0' } },",
        "  router: './src/router.ts',",
        "};",
        "",
      ].join("\n"),
      "utf8"
    );

    const { config, path: loadedPath } = await loadConfig({ cwd });
    expect(loadedPath).toBe(path.join(cwd, "apifn.config.ts"));
    expect(config.openapi?.info?.title).toBe("Test");
    expect(config.router).toBe("./src/router.ts");
  });

  it("TV-CORE-003: config path is overridable", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "apifn-cli-config-"));
    const custom = path.join(cwd, "custom.config.ts");

    await writeFile(
      custom,
      [
        "export default { openapi: { info: { title: 'Custom', version: '2.0.0' } } };",
        "",
      ].join("\n"),
      "utf8"
    );

    const { config, path: loadedPath } = await loadConfig({ cwd, configPath: custom });
    expect(loadedPath).toBe(custom);
    expect(config.openapi?.info?.title).toBe("Custom");
  });

  it("NEG-TV-CORE-003: invalid config field type throws clear error", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "apifn-cli-config-"));
    await writeFile(
      path.join(cwd, "apifn.config.ts"),
      [
        "export default { openapi: { info: { title: 123 } } };",
        "",
      ].join("\n"),
      "utf8"
    );

    await expect(loadConfig({ cwd })).rejects.toThrow("info.title must be a string");
  });

  it("defineConfig is identity helper", () => {
    const cfg = defineConfig({ output: ".apifn" });
    expect(cfg.output).toBe(".apifn");
  });
});
