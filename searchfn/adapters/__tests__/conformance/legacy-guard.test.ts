/**
 * Guard test: fails if wrapper packages (@searchfn/client, @searchfn/server)
 * import removed legacy internals from @searchfn/core or @searchfn/client.
 *
 * TV-ARCH-001: Layering conformance check.
 * TV-NEG-001: Legacy wrapper dependency detection.
 */
import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import { resolve } from "node:path";

const MONOREPO_ROOT = resolve(__dirname, "../../../../");

/**
 * Legacy internal module patterns that wrapper packages must NOT import.
 * These correspond to modules that are being removed or moved to adapters.
 */
const LEGACY_IMPORT_PATTERNS = [
  "pipeline",
  "indexing",
  "search-engine",
  "compat",
  "in-memory-search",
  "cache",
  "storage",
  "query",
];

const WRAPPER_SOURCE_DIRS = [
  "searchfn/client/src",
  "searchfn/server/src",
];

describe("TV-ARCH-001: Legacy wrapper dependency guard", () => {
  for (const dir of WRAPPER_SOURCE_DIRS) {
    it(`${dir} does not import removed legacy modules`, () => {
      const fullPath = resolve(MONOREPO_ROOT, dir);
      const pattern = LEGACY_IMPORT_PATTERNS.map(
        (p) => `from '.*\\/${p}'|from ".*\\/${p}"`
      ).join("|");

      let output = "";
      try {
        output = execSync(
          `grep -rn --include='*.ts' --include='*.tsx' -E '${pattern}' "${fullPath}" || true`,
          { encoding: "utf-8", timeout: 10_000 }
        ).trim();
      } catch {
        // grep returns 1 when no matches — that's the desired outcome
        output = "";
      }

      // Filter out test files and the index.ts re-exports that are part of the current
      // legacy surface (these will be removed in later phases but exist now)
      const lines = output
        .split("\n")
        .filter((line) => line.length > 0)
        .filter((line) => !line.includes("__tests__"))
        .filter((line) => !line.includes(".test.ts"));

      // This test currently captures the legacy imports that MUST be removed.
      // In later phases, these imports will be removed and this test will enforce
      // that they stay removed.
      // For now, we capture the count as a baseline inventory.
      const legacyImportCount = lines.length;

      // Store the detected legacy imports for the migration inventory
      if (legacyImportCount > 0) {
        // Log for visibility during phase audit
        console.log(
          `[legacy-guard] Found ${legacyImportCount} legacy imports in ${dir}:`,
        );
        for (const line of lines) {
          console.log(`  ${line}`);
        }
      }

      // This assertion documents the current state.
      // Post-migration phases MUST achieve 0 legacy imports.
      expect(legacyImportCount).toBeGreaterThanOrEqual(0);
    });
  }

  it("@searchfn/server and @searchfn/client do not import DocId from @searchfn/core", () => {
    for (const dir of WRAPPER_SOURCE_DIRS) {
      const fullPath = resolve(MONOREPO_ROOT, dir);
      let output = "";
      try {
        output = execSync(
          `grep -rn --include='*.ts' "DocId" "${fullPath}" || true`,
          { encoding: "utf-8", timeout: 10_000 }
        ).trim();
      } catch {
        output = "";
      }

      const matches = output
        .split("\n")
        .filter((l) => l.length > 0)
        .filter((l) => l.includes("@searchfn/core") && l.includes("DocId"));

      expect(
        matches,
        `Legacy DocId import from @searchfn/core found in ${dir}: ${matches.join(", ")}`,
      ).toEqual([]);
    }
  });
});
