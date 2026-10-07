import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SEARCH_ADAPTER_DISPOSED, SearchAdapterError } from "../src/index";
import {
  compareSearchAllResults,
  CONFORMANCE_ASSERTIONS,
  runConformanceSuite,
} from "../src/testing";
import { searchfnAdapterVitestConfig } from "../adapter-vitest.config";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
  exports: { "./testing": { types?: string; import?: string; require?: string } };
};

describe("adapter contracts scaffolding", () => {
  it("exports constants and errors", () => {
    expect(SEARCH_ADAPTER_DISPOSED).toBe("SEARCH_ADAPTER_DISPOSED");
    const err = new SearchAdapterError("X", "msg");
    expect(err.code).toBe("X");
  });

  it("exports the shared conformance harness", () => {
    expect(typeof runConformanceSuite).toBe("function");
    expect(CONFORMANCE_ASSERTIONS.length).toBeGreaterThan(0);
  });

  it("uses resource and id tie-breakers for invalid and infinite scores", () => {
    const results = [
      { resource: "notes", id: "b", score: Number.NaN },
      { resource: "items", id: "b", score: Number.NaN },
      { resource: "items", id: "a", score: Number.NaN },
      { resource: "notes", id: "b", score: Number.POSITIVE_INFINITY },
      { resource: "items", id: "b", score: Number.POSITIVE_INFINITY },
      { resource: "items", id: "a", score: Number.POSITIVE_INFINITY },
    ];

    expect([...results].sort(compareSearchAllResults)).toEqual([
      { resource: "items", id: "a", score: Number.POSITIVE_INFINITY },
      { resource: "items", id: "b", score: Number.POSITIVE_INFINITY },
      { resource: "notes", id: "b", score: Number.POSITIVE_INFINITY },
      { resource: "items", id: "a", score: Number.NaN },
      { resource: "items", id: "b", score: Number.NaN },
      { resource: "notes", id: "b", score: Number.NaN },
    ]);
  });

  it("advertises the testing subpath as ESM-only", () => {
    expect(pkg.exports["./testing"].import).toBe("./dist/testing.js");
    expect(pkg.exports["./testing"].require).toBeUndefined();
  });

  it("preserves object-form aliases in shared adapter Vitest config", () => {
    const config = searchfnAdapterVitestConfig({
      resolve: { alias: { "@fixture": "/tmp/fixture.ts" } }
    });

    expect(config.resolve?.alias).toMatchObject({
      "@fixture": "/tmp/fixture.ts",
      "@searchfn/adapter-contracts": expect.stringContaining("src/index.ts"),
      "@searchfn/adapter-contracts/testing": expect.stringContaining("src/testing.ts")
    });
  });

  it("preserves array-form aliases in shared adapter Vitest config", () => {
    const config = searchfnAdapterVitestConfig({
      resolve: { alias: [{ find: "@fixture", replacement: "/tmp/fixture.ts" }] }
    });

    expect(config.resolve?.alias).toEqual([
      {
        find: "@searchfn/adapter-contracts/testing",
        replacement: expect.stringContaining("src/testing.ts")
      },
      {
        find: "@searchfn/adapter-contracts",
        replacement: expect.stringContaining("src/index.ts")
      },
      { find: "@fixture", replacement: "/tmp/fixture.ts" }
    ]);
  });
});
