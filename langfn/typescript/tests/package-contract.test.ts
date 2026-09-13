import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
const langfnRoot = resolve(repoRoot, "langfn");

function read(path: string): string {
  return readFileSync(path, "utf8");
}

describe("package contract", () => {
  it("publishes the canonical package identity and subpath exports", () => {
    const manifest = JSON.parse(read(resolve(langfnRoot, "typescript/package.json")));

    expect(manifest.name).toBe("langfn");
    expect(manifest.version).toBe("0.1.0");
    expect(manifest.exports).toMatchObject({
      ".": expect.any(Object),
      "./models": expect.any(Object),
      "./prompts": expect.any(Object),
      "./tools": expect.any(Object),
      "./orchestration": expect.any(Object),
      "./graph": expect.any(Object),
      "./agents": expect.any(Object),
      "./observability": expect.any(Object),
      "./http": expect.any(Object),
      "./structured": expect.any(Object),
      "./rag": expect.any(Object),
      "./memory": expect.any(Object),
      "./evaluation": expect.any(Object),
      "./mcp": expect.any(Object),
      "./utils": expect.any(Object)
    });
  });

  it("ships first-class build and test configuration files", () => {
    expect(read(resolve(langfnRoot, "typescript/tsup.config.ts"))).toContain("export default");
    expect(read(resolve(langfnRoot, "typescript/vitest.config.ts"))).toContain("export default");
    expect(JSON.parse(read(resolve(langfnRoot, "typescript/package.json"))).dependencies["@superfunctions/http"]).toBe("0.2.0");
  });

  it("keeps version and health metadata synchronized", () => {
    const tsManifest = JSON.parse(read(resolve(langfnRoot, "typescript/package.json")));
    const tsRoutes = read(resolve(langfnRoot, "typescript/src/http/routes.ts"));
    expect(tsRoutes).toContain('version: "0.1.0"');
    expect(tsManifest.version).toBe("0.1.0");
  });

  it("documents the same release version and install story across readmes", () => {
    const rootReadme = read(resolve(langfnRoot, "README.md"));
    const tsReadme = read(resolve(langfnRoot, "typescript/README.md"));

    for (const content of [rootReadme, tsReadme]) {
      expect(content).toContain("0.1.0");
      expect(content).toContain("npm install langfn@0.1.0");
      expect(content).toContain("pip install langfn==0.1.0");
    }
  });
});
