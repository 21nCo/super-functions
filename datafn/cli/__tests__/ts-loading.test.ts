/**
 * Phase 01: TypeScript schema loading tests
 * Covers FR-EXT-001, FR-TS-001, FR-EXPORT-001 (explicit path), TV-TS-LOAD-001, TV-TS-ERR-001
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "node:child_process";
import { writeFileSync, unlinkSync, readFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const CLI_PATH = join(process.cwd(), "dist", "cli.js");
// Use tsx to run CLI when loading .datafn.ts so TypeScript schema can be imported under Node
const CLI_CMD = typeof (globalThis as any).Bun !== "undefined" ? "bun" : "npx tsx";
const runCli = (args: string) =>
  execSync(`${CLI_CMD} "${CLI_PATH}" ${args}`, {
    encoding: "utf-8",
    cwd: process.cwd(),
  });

describe("Phase 01: TypeScript Loading", () => {
  let workDir: string;

  beforeAll(() => {
    workDir = mkdtempSync(join(tmpdir(), "datafn-ts-loading-"));
  });

  afterAll(() => {
    try {
      rmSync(workDir, { recursive: true });
    } catch (_) {}
  });

  it("loads schema from .datafn.ts with default export", () => {
    const schemaPath = join(workDir, "test.datafn.ts");
    const outputDir = join(workDir, "output");
    writeFileSync(
      schemaPath,
      `
export default {
  resources: [{ name: 'test', version: 1, fields: [{ name: 'id', type: 'string', required: true }] }],
  relations: [],
};
`
    );

    const result = runCli(
      `generate --adapter drizzle --database postgres --schema "${schemaPath}" --output "${outputDir}"`
    );
    expect(result).toContain("Types written to");

    const output = readFileSync(join(outputDir, "datafn-types.ts"), "utf-8");
    expect(output).toContain("export interface Test");
    expect(output).toContain("id: string;");
  });

  it("rejects .ts files without .datafn extension", () => {
    const schemaPath = join(workDir, "plain.ts");
    writeFileSync(schemaPath, "export default { resources: [], relations: [] };");

    expect(() => {
      execSync(`node "${CLI_PATH}" generate --adapter drizzle --database postgres --schema "${schemaPath}"`, {
        encoding: "utf-8",
        cwd: process.cwd(),
      });
    }).toThrow();

    try {
      unlinkSync(schemaPath);
    } catch (_) {}
  });

  it("extracts schema from named 'schema' export", () => {
    const schemaPath = join(workDir, "named.datafn.ts");
    const outputDir = join(workDir, "named-output");
    writeFileSync(
      schemaPath,
      `
export const schema = {
  resources: [{ name: 'item', version: 1, fields: [{ name: 'id', type: 'string', required: true }] }],
  relations: [],
};
`
    );

    const result = runCli(
      `generate --adapter drizzle --database postgres --schema "${schemaPath}" --output "${outputDir}"`
    );
    expect(result).toContain("Types written to");

    const output = readFileSync(join(outputDir, "datafn-types.ts"), "utf-8");
    expect(output).toContain("export interface Item");
  });

  it("JSON schema still works (backward compatibility)", () => {
    const schemaPath = join(workDir, "schema.json");
    const outputDir = join(workDir, "json-output");
    writeFileSync(
      schemaPath,
      JSON.stringify({
        resources: [
          {
            name: "task",
            version: 1,
            fields: [{ name: "id", type: "string", required: true }],
          },
        ],
        relations: [],
      })
    );

    const result = execSync(
      `node "${CLI_PATH}" generate --adapter drizzle --database postgres --schema "${schemaPath}" --output "${outputDir}"`,
      { encoding: "utf-8", cwd: process.cwd() }
    );
    expect(result).toContain("Types written to");

    const output = readFileSync(join(outputDir, "datafn-types.ts"), "utf-8");
    expect(output).toContain("export interface Task");
  });
});
