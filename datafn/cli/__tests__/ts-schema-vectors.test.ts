/**
 * Phase 03: All 14 test vectors from TEST_VECTORS.md (TC-VEC-001)
 * Plus TV-TS-HELP-001 for FR-HELP-001
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { execSync } from "node:child_process";
import {
  writeFileSync,
  readFileSync,
  mkdtempSync,
  rmSync,
  mkdirSync,
  existsSync,
  unlinkSync,
  readdirSync,
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

const runCli = (args: string, cwd = process.cwd(), useNode = false) => {
  const cmd = useNode ? "node" : CLI_CMD;
  return execSync(`${cmd} "${CLI_PATH}" ${args}`, { encoding: "utf-8", cwd });
};
const runCliStderr = (args: string, cwd = process.cwd(), useNode = false) => {
  try {
    const cmd = useNode ? "node" : CLI_CMD;
    execSync(`${cmd} "${CLI_PATH}" ${args}`, { encoding: "utf-8", cwd });
    return "";
  } catch (err: any) {
    return String(err.stderr ?? err.stdout ?? err.message ?? "");
  }
};

describe("Test Vectors: TypeScript schema support (14 vectors)", () => {
  let workDir: string;

  beforeAll(() => {
    workDir = mkdtempSync(join(tmpdir(), "datafn-ts-vectors-"));
  });

  beforeEach(() => {
    const entries = readdirSync(workDir, { withFileTypes: true });
    for (const e of entries) {
      const p = join(workDir, e.name);
      try {
        if (e.isDirectory()) rmSync(p, { recursive: true });
        else unlinkSync(p);
      } catch (_) {}
    }
  });

  afterAll(() => {
    try {
      rmSync(workDir, { recursive: true });
    } catch (_) {}
  });

  it("TV-TS-LOAD-001: Load schema from .datafn.ts with default export", () => {
    const schemaPath = join(workDir, "test-schema.datafn.ts");
    const outputDir = join(workDir, "output");
    writeFileSync(
      schemaPath,
      `
export default {
  resources: [
    { name: 'task', version: 1, fields: [{ name: 'id', type: 'string', required: true }, { name: 'title', type: 'string', required: true }] },
  ],
  relations: [],
};
`
    );
    const result = runCli(`generate --adapter drizzle --database postgres --schema "${schemaPath}" --output "${outputDir}"`);
    expect(result).toContain("Types written to");
    const out = readFileSync(join(outputDir, "datafn-types.ts"), "utf-8");
    expect(out).toContain("export interface Task");
    expect(out).toContain("id: string;");
    expect(out).toContain("title: string;");
  });

  it("TV-TS-LOAD-002: Load schema from .datafn.ts with named export", () => {
    const schemaPath = join(workDir, "named.datafn.ts");
    const outputDir = join(workDir, "output");
    writeFileSync(
      schemaPath,
      `
export const schema = {
  resources: [
    { name: 'goal', version: 1, fields: [{ name: 'id', type: 'string', required: true }, { name: 'target', type: 'number', required: true }] },
  ],
  relations: [],
};
`
    );
    const result = runCli(`generate --adapter drizzle --database postgres --schema "${schemaPath}" --output "${outputDir}"`);
    expect(result).toContain("Types written to");
    const out = readFileSync(join(outputDir, "datafn-types.ts"), "utf-8");
    expect(out).toContain("export interface Goal");
    expect(out).toContain("target: number;");
  });

  it("TV-TS-DISC-001: Auto-discover schema.datafn.ts in root", () => {
    writeFileSync(
      join(workDir, "schema.datafn.ts"),
      "export default { resources: [{ name: 'user', version: 1, fields: [{ name: 'id', type: 'string', required: true }] }], relations: [] };"
    );
    const result = runCli("generate --adapter drizzle --database postgres", workDir);
    expect(result).toContain("Found schema: ./schema.datafn.ts");
    expect(result).toContain("Types written to");
    expect(readFileSync(join(workDir, "datafn-types.ts"), "utf-8")).toContain("User");
  });

  it("TV-TS-DISC-002: Auto-discover schema.datafn.ts in src/", () => {
    mkdirSync(join(workDir, "src"), { recursive: true });
    writeFileSync(
      join(workDir, "src", "schema.datafn.ts"),
      "export default { resources: [{ name: 'post', version: 1, fields: [{ name: 'id', type: 'string', required: true }] }], relations: [] };"
    );
    const result = runCli("generate --adapter drizzle --database postgres", workDir);
    expect(result).toContain("Found schema: ./src/schema.datafn.ts");
    expect(readFileSync(join(workDir, "datafn-types.ts"), "utf-8")).toContain("Post");
  });

  it("TV-TS-DISC-003: Auto-discover fallback to JSON", () => {
    writeFileSync(
      join(workDir, "schema.json"),
      JSON.stringify({
        resources: [{ name: "comment", version: 1, fields: [{ name: "id", type: "string", required: true }] }],
        relations: [],
      })
    );
    const result = runCli("generate --adapter drizzle --database postgres", workDir, true);
    expect(result).toContain("Found schema: ./schema.json");
    expect(readFileSync(join(workDir, "datafn-types.ts"), "utf-8")).toContain("Comment");
  });

  it("TV-TS-DISC-004: Auto-discover prefers TypeScript over JSON", () => {
    writeFileSync(
      join(workDir, "schema.datafn.ts"),
      "export default { resources: [{ name: 'ts_resource', version: 1, fields: [] }], relations: [] };"
    );
    writeFileSync(
      join(workDir, "schema.json"),
      JSON.stringify({ resources: [{ name: "json_resource", version: 1, fields: [] }], relations: [] })
    );
    const result = runCli("generate --adapter drizzle --database postgres", workDir);
    expect(result).toContain("Found schema: ./schema.datafn.ts");
    const out = readFileSync(join(workDir, "datafn-types.ts"), "utf-8");
    expect(out).toContain("TsResource");
    expect(out).not.toContain("JsonResource");
  });

  it("TV-TS-CONS-001: TypeScript vs JSON output consistency", () => {
    const taskSchema = {
      resources: [
        {
          name: "task",
          version: 1,
          fields: [
            { name: "id", type: "string", required: true },
            { name: "title", type: "string", required: true },
            { name: "done", type: "boolean", required: false },
          ],
        },
      ],
      relations: [] as any[],
    };
    writeFileSync(
      join(workDir, "schema.datafn.ts"),
      `export default ${JSON.stringify(taskSchema)};`
    );
    writeFileSync(join(workDir, "schema.json"), JSON.stringify(taskSchema));
    runCli(`generate --adapter drizzle --database postgres --schema "${join(workDir, "schema.datafn.ts")}" --output "${join(workDir, "output-ts")}"`);
    runCli(`generate --adapter drizzle --database postgres --schema "${join(workDir, "schema.json")}" --output "${join(workDir, "output-json")}"`);
    const tsOut = readFileSync(join(workDir, "output-ts", "datafn-types.ts"), "utf-8");
    const jsonOut = readFileSync(join(workDir, "output-json", "datafn-types.ts"), "utf-8");
    expect(tsOut).toBe(jsonOut);
  });

  it("TV-TS-LOAD-003: Load an explicitly selected plain .ts schema", () => {
    const schemaPath = join(workDir, "schema.ts");
    const outputDir = join(workDir, "output-plain-ts");
    writeFileSync(
      schemaPath,
      "export default { resources: [{ name: 'note', version: 1, fields: [{ name: 'id', type: 'string', required: true }] }], relations: [] };"
    );

    const result = runCli(
      `generate --adapter drizzle --database postgres --schema "${schemaPath}" --output "${outputDir}"`
    );

    expect(result).toContain("Types written to");
    expect(readFileSync(join(outputDir, "datafn-types.ts"), "utf-8")).toContain(
      "export interface Note"
    );
  });

  it("TV-TS-ERR-002: Reject missing schema export", () => {
    const noExportPath = join(workDir, "no-export.datafn.ts");
    writeFileSync(
      noExportPath,
      `
const mySchema = { resources: [], relations: [] };
`
    );
    expect(() => runCli(`generate --adapter drizzle --database postgres --schema "${noExportPath}"`)).toThrow();
    const stderr = runCliStderr(`generate --adapter drizzle --database postgres --schema "${noExportPath}"`);
    expect(stderr).toMatch(/No schema export found|Invalid schema|Expected/);
  });

  it("TV-TS-ERR-003: Auto-discovery failure error", () => {
    expect(() => runCli("generate --adapter drizzle --database postgres", workDir, true)).toThrow();
    const stderr = runCliStderr("generate --adapter drizzle --database postgres", workDir, true);
    expect(stderr).toContain("No schema file found");
    expect(stderr).toContain("schema.datafn.ts");
    expect(stderr).toContain("schema.json");
    expect(stderr).toContain("--schema");
  });

  it("TV-TS-ERR-004: Invalid TypeScript syntax error", () => {
    const badPath = join(workDir, "invalid-syntax.datafn.ts");
    writeFileSync(badPath, "export default { resources: [ { name: 'broken' version: 1 } ], relations: [] };");
    expect(() => runCli(`generate --adapter drizzle --database postgres --schema "${badPath}"`)).toThrow();
    const stderr = runCliStderr(`generate --adapter drizzle --database postgres --schema "${badPath}"`);
    expect(stderr).toContain("invalid-syntax.datafn.ts");
  });

  it("TV-TS-ERR-005: Schema validation failure from TypeScript", () => {
    const badPath = join(workDir, "invalid-schema.datafn.ts");
    writeFileSync(
      badPath,
      "export default { resources: [ { name: 'invalid', version: 1 } ], relations: [] };"
    );
    expect(() => runCli(`generate --adapter drizzle --database postgres --schema "${badPath}"`)).toThrow();
    const stderr = runCliStderr(`generate --adapter drizzle --database postgres --schema "${badPath}"`);
    expect(stderr).toMatch(/invalid|validation|SCHEMA|fields/i);
  });

  it("TV-TS-PATH-001: Explicit path with relative directory", () => {
    mkdirSync(join(workDir, "config"), { recursive: true });
    writeFileSync(
      join(workDir, "config", "custom-schema.datafn.ts"),
      "export default { resources: [{ name: 'item', version: 1, fields: [] }], relations: [] };"
    );
    const result = runCli(
      `generate --adapter drizzle --database postgres --schema "${join(workDir, "config", "custom-schema.datafn.ts")}" --output "${join(workDir, "types")}"`
    );
    expect(result).toContain("Types written to");
    expect(readFileSync(join(workDir, "types", "datafn-types.ts"), "utf-8")).toContain("Item");
  });

  it("TV-TS-HELP-001: Help text includes TypeScript documentation", () => {
    const help = runCli("generate --help", process.cwd(), true);
    expect(help).toContain(".datafn.ts");
    expect(help).toContain("schema.datafn.ts");
    expect(help).toContain("datafn generate");
    expect(help).toContain("--schema <path>");
  });
});
