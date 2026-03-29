/**
 * Phase 02: Auto-discovery tests
 * Covers FR-DISC-001, FR-PATH-001, FR-COMPAT-001, TV-TS-DISC-001/002/003/004, TV-TS-ERR-003
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { execSync } from "node:child_process";
import {
  writeFileSync,
  unlinkSync,
  readFileSync,
  mkdtempSync,
  rmSync,
  mkdirSync,
  existsSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const CLI_PATH = join(process.cwd(), "dist", "cli.js");
const TSX_PATH = join(process.cwd(), "..", "..", "node_modules", ".bin", "tsx");
const CLI_CMD =
  typeof (globalThis as any).Bun !== "undefined"
    ? "bun"
    : existsSync(TSX_PATH)
      ? TSX_PATH
      : "npx tsx";

const DEFAULT_GENERATE_ARGS = "generate --adapter drizzle --database postgres";

const runCliInDir = (cwd: string, args: string = DEFAULT_GENERATE_ARGS) =>
  execSync(`${CLI_CMD} "${CLI_PATH}" ${args}`, {
    encoding: "utf-8",
    cwd,
  });

describe("Phase 02: Auto-Discovery", () => {
  let workDir: string;

  beforeAll(() => {
    workDir = mkdtempSync(join(tmpdir(), "datafn-auto-discovery-"));
  });

  const cleanSchemaFiles = () => {
    for (const f of [
      "schema.datafn.ts",
      "schema.json",
      "datafn-types.ts",
      "custom-types.ts",
    ]) {
      const p = join(workDir, f);
      if (existsSync(p)) unlinkSync(p);
    }
    const srcDir = join(workDir, "src");
    if (existsSync(srcDir)) rmSync(srcDir, { recursive: true });
    const configDir = join(workDir, "config");
    if (existsSync(configDir)) rmSync(configDir, { recursive: true });
  };

  beforeEach(() => {
    cleanSchemaFiles();
  });

  afterAll(() => {
    try {
      rmSync(workDir, { recursive: true });
    } catch (_) {}
  });

  it("discovers schema.datafn.ts in root", () => {
    writeFileSync(
      join(workDir, "schema.datafn.ts"),
      `
export default {
  resources: [{ name: 'test', version: 1, fields: [] }],
  relations: [],
};
`
    );

    const result = runCliInDir(workDir);
    expect(result).toContain("Found schema: ./schema.datafn.ts");
    expect(result).toContain("Types written to");

    const output = readFileSync(join(workDir, "datafn-types.ts"), "utf-8");
    expect(output).toContain("export interface Test");
  });

  it("discovers schema.datafn.ts in src/ directory", () => {
    const srcDir = join(workDir, "src");
    mkdirSync(srcDir, { recursive: true });
    writeFileSync(
      join(srcDir, "schema.datafn.ts"),
      `
export default {
  resources: [{ name: 'src_test', version: 1, fields: [] }],
  relations: [],
};
`
    );

    const result = runCliInDir(workDir);
    expect(result).toContain("Found schema: ./src/schema.datafn.ts");

    const output = readFileSync(join(workDir, "datafn-types.ts"), "utf-8");
    expect(output).toContain("SrcTest");
  });

  it("falls back to schema.json when no .datafn.ts exists", () => {
    writeFileSync(
      join(workDir, "schema.json"),
      JSON.stringify({
        resources: [{ name: "json_test", version: 1, fields: [] }],
        relations: [],
      })
    );

    const result = runCliInDir(workDir);
    expect(result).toContain("Found schema: ./schema.json");

    const output = readFileSync(join(workDir, "datafn-types.ts"), "utf-8");
    expect(output).toContain("JsonTest");
  });

  it("prefers TypeScript over JSON when both exist", () => {
    writeFileSync(
      join(workDir, "schema.datafn.ts"),
      `
export default {
  resources: [{ name: 'ts_file', version: 1, fields: [] }],
  relations: [],
};
`
    );
    writeFileSync(
      join(workDir, "schema.json"),
      JSON.stringify({
        resources: [{ name: "json_file", version: 1, fields: [] }],
        relations: [],
      })
    );

    const result = runCliInDir(workDir);
    expect(result).toContain("Found schema: ./schema.datafn.ts");

    const output = readFileSync(join(workDir, "datafn-types.ts"), "utf-8");
    expect(output).toContain("TsFile");
    expect(output).not.toContain("JsonFile");
  });

  it("throws error when no schema files found", () => {
    expect(() => runCliInDir(workDir)).toThrow();

    try {
      runCliInDir(workDir);
    } catch (err: any) {
      const output = String(err.stderr ?? err.stdout ?? err.message);
      expect(output).toContain("No schema file found");
      expect(output).toContain("./schema.datafn.ts");
      expect(output).toContain("./src/schema.datafn.ts");
      expect(output).toContain("./schema.json");
      expect(output).toContain("--schema");
    }
  });

  it("explicit --schema skips auto-discovery and uses given path", () => {
    const configDir = join(workDir, "config");
    mkdirSync(configDir, { recursive: true });
    writeFileSync(
      join(configDir, "my-schema.datafn.ts"),
      `
export default {
  resources: [{ name: 'custom', version: 1, fields: [] }],
  relations: [],
};
`
    );
    writeFileSync(
      join(workDir, "schema.datafn.ts"),
      `
export default {
  resources: [{ name: 'root_ts', version: 1, fields: [] }],
  relations: [],
};
`
    );

    const result = runCliInDir(
      workDir,
      "generate --adapter drizzle --database postgres --schema ./config/my-schema.datafn.ts --output ./generated"
    );
    expect(result).not.toContain("Found schema: ./schema.datafn.ts");
    expect(result).toContain("Types written to");

    const output = readFileSync(join(workDir, "generated", "datafn-types.ts"), "utf-8");
    expect(output).toContain("Custom");
    expect(output).not.toContain("RootTs");
  });
});
