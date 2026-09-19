import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SEARCH_ADAPTER_DISPOSED, SearchAdapterError } from "../src/index";
import { CONFORMANCE_ASSERTIONS, runConformanceSuite } from "../src/testing";
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
      { find: "@fixture", replacement: "/tmp/fixture.ts" }
    ]);
  });
});
