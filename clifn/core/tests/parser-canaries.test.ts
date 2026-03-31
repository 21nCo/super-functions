import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runCacFixture } from "./fixtures/cac/index.js";
import { runCommanderFixture } from "./fixtures/commander/index.js";
import { runParseArgsFixture } from "./fixtures/parse-args/index.js";

const packageJsonPath = fileURLToPath(new URL("../package.json", import.meta.url));

describe("parser canaries", () => {
  it("demonstrates runner and output integration through commander", async () => {
    const result = await runCommanderFixture(["--verbose", "greet", "--name", "Ada"]);

    expect(result).toEqual({
      exitCode: 0,
      stdout: "[d] parser commander\n[i] hello Ada from commander\n",
      stderr: "",
    });
  });

  it("demonstrates runner and output integration through cac", async () => {
    const result = await runCacFixture(["greet", "--name", "Grace", "--json"]);

    expect(result).toEqual({
      exitCode: 0,
      stdout: '{"ok":true,"parser":"cac","name":"Grace"}\n',
      stderr: "",
    });
  });

  it("demonstrates runner and output integration through raw parseArgs", async () => {
    const result = await runParseArgsFixture(["greet", "--name", "Linus"]);

    expect(result).toEqual({
      exitCode: 0,
      stdout: "[i] hello Linus from parseArgs\n",
      stderr: "",
    });
  });

  it("keeps parser libraries out of clifn runtime dependencies", async () => {
    const packageJson = JSON.parse(await fs.readFile(packageJsonPath, "utf8")) as {
      dependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
    };

    expect(packageJson.dependencies).not.toHaveProperty("cac");
    expect(packageJson.dependencies).not.toHaveProperty("commander");
    expect(packageJson.peerDependencies ?? {}).not.toHaveProperty("cac");
    expect(packageJson.peerDependencies ?? {}).not.toHaveProperty("commander");
  });

  it("keeps parser-specific imports out of the clifn runtime entrypoints", async () => {
    const runtimeFiles = [
      "src/index.ts",
      "src/output.ts",
      "src/runner.ts",
    ];

    const contents = await Promise.all(
      runtimeFiles.map((relativePath) =>
        fs.readFile(path.resolve(path.dirname(packageJsonPath), relativePath), "utf8")
      )
    );

    for (const content of contents) {
      expect(content).not.toMatch(/from ["']cac["']/);
      expect(content).not.toMatch(/from ["']commander["']/);
      expect(content).not.toMatch(/import\s*\{[^}]*\bparseArgs\b[^}]*\}\s*from ["']node:util["']/);
      expect(content).not.toMatch(/import\s+\*\s+as\s+(\w+)\s+from ["']node:util["'][\s\S]*?\b\1\.parseArgs\b/);
      expect(content).not.toMatch(/const\s*\{\s*parseArgs\s*\}\s*=\s*require\(["']node:util["']\)/);
      expect(content).not.toMatch(/require\(["']node:util["']\)\.parseArgs/);
    }
  });
});
