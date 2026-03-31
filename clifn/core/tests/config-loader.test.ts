import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { defineConfig, loadConfig } from "../src/config-loader.js";

describe("loadConfig", () => {
  it("loads a TypeScript config deterministically and applies validation", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "clifn-config-loader-"));

    try {
      await writeFile(
        path.join(cwd, "tool.config.ts"),
        'export const config = { source: "ts", count: 2 };\n',
        "utf8"
      );
      await writeFile(
        path.join(cwd, "tool.config.js"),
        'export default { source: "js" };\n',
        "utf8"
      );

      const loaded = await loadConfig({
        cwd,
        candidates: ["tool.config.ts", "tool.config.js"],
        exportNames: ["config"],
        validate(value, resolvedPath) {
          const config = value as { source: string; count: number };
          return defineConfig({
            ...config,
            loadedFrom: path.basename(resolvedPath),
          });
        },
      });

      expect(path.basename(loaded.path)).toBe("tool.config.ts");
      expect(loaded.config).toEqual({
        source: "ts",
        count: 2,
        loadedFrom: "tool.config.ts",
      });
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("loads JSON configs through explicit configPath", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "clifn-config-loader-"));

    try {
      const configPath = path.join(cwd, "tool.config.json");
      await writeFile(configPath, JSON.stringify({ source: "json", ok: true }), "utf8");

      const loaded = await loadConfig({
        cwd,
        configPath,
      });

      expect(loaded.path).toBe(configPath);
      expect(loaded.config).toEqual({ source: "json", ok: true });
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("preserves plain json objects that happen to contain a default key", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "clifn-config-loader-"));

    try {
      const configPath = path.join(cwd, "tool.config.json");
      await writeFile(configPath, JSON.stringify({ default: "kept", ok: true }), "utf8");

      const loaded = await loadConfig({
        cwd,
        configPath,
      });

      expect(loaded.config).toEqual({ default: "kept", ok: true });
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("fails deterministically for remote explicit config paths", async () => {
    await expect(
      loadConfig({
        configPath: "https://example.com/tool.config.ts",
      })
    ).rejects.toMatchObject({
      code: "CLIFN_CONFIG_NOT_FOUND",
      message: "Remote config URLs are not supported.",
    });
  });

  it("fails deterministically for missing explicit config paths", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "clifn-config-loader-"));

    try {
      await expect(
        loadConfig({
          cwd,
          configPath: "missing.config.ts",
        })
      ).rejects.toMatchObject({
        code: "CLIFN_CONFIG_NOT_FOUND",
        message: "Config file not found: missing.config.ts",
      });
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("normalizes runtime loader failures into typed config errors", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "clifn-config-loader-"));

    try {
      const configPath = path.join(cwd, "tool.config.js");
      await writeFile(configPath, 'throw new Error("boom");\n', "utf8");

      await expect(
        loadConfig({
          cwd,
          configPath,
        })
      ).rejects.toMatchObject({
        code: "CLIFN_CONFIG_INVALID",
        message: "boom",
      });
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
});
