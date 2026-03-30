import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(__dirname, "..");
const SRC_ROOT = resolve(ROOT, "src");

const REMOVED_DIR_PATTERNS = [
  "compat",
  "search-engine",
  "pipeline",
  "indexing",
  "cache",
  "storage",
  "query",
];

const REMOVED_SYMBOLS = ["SearchEngine", "migrateFlexStoreToSearchFn"];

function normalizePath(file: string): string {
  return file.replaceAll("\\", "/");
}

function walkFiles(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      walkFiles(full, files);
      continue;
    }
    if (st.isFile() && /\.(ts|tsx|js|md)$/i.test(entry)) {
      files.push(full);
    }
  }
  return files;
}

describe("legacy symbol guard", () => {
  it("does not reintroduce removed legacy source directories", () => {
    const sourceFiles = walkFiles(SRC_ROOT).map((f) =>
      normalizePath(f).replace(`${normalizePath(SRC_ROOT)}/`, ""),
    );
    const legacyMatches = sourceFiles.filter((file) =>
      REMOVED_DIR_PATTERNS.some((pattern) => file.includes(`${pattern}/`) || file.startsWith(`${pattern}.`)),
    );
    expect(legacyMatches).toEqual([]);
  });

  it("does not reference removed legacy symbols in client source", () => {
    const files = walkFiles(SRC_ROOT);
    const matches: Array<{ file: string; symbol: string }> = [];

    for (const file of files) {
      const text = readFileSync(file, "utf-8");
      for (const symbol of REMOVED_SYMBOLS) {
        if (text.includes(symbol)) {
          matches.push({ file: normalizePath(file).replace(`${normalizePath(ROOT)}/`, ""), symbol });
        }
      }
    }

    expect(matches).toEqual([]);
  });
});
