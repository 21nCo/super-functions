import { existsSync } from "node:fs";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { runCli } from "../src/index.js";

async function createRouterFixture(cwd: string): Promise<string> {
  const routerPath = path.join(cwd, "router.ts");
  await writeFile(
    routerPath,
    [
      "export default {",
      "  getRoutes() {",
      "    return [",
      "      {",
      "        method: 'GET',",
      "        path: '/users/:id',",
      "        handler: async () => Response.json({ id: '1' }),",
      "        meta: {",
      "          summary: 'Get User',",
      "          responses: { 200: { description: 'OK' } },",
      "          tags: ['users'],",
      "        },",
      "      },",
      "    ];",
      "  },",
      "};",
      "",
    ].join("\n"),
    "utf8"
  );
  return routerPath;
}

describe("cli commands", () => {
  it("apifn --help shows command list", async () => {
    const code = await runCli(["--help"]);
    expect(code).toBe(0);
  });

  it("TV-CLI-001: init --yes scaffolds collection", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "apifn-cli-init-"));
    const target = path.join(cwd, "test-col");
    const code = await runCli(["init", target, "--yes"], { cwd });

    expect(code).toBe(0);
    expect(existsSync(path.join(target, "opencollection.yml"))).toBe(true);
    expect(existsSync(path.join(target, "environments", "development.yml"))).toBe(true);
  });

  it("TV-CLI-002 + TV-CLI-003: generate and export OpenAPI", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "apifn-cli-generate-"));
    await createRouterFixture(cwd);

    await writeFile(
      path.join(cwd, "apifn.config.ts"),
      [
        "export default {",
        "  router: './router.ts',",
        "  output: './.apifn',",
        "  openapi: { info: { title: 'CLI API', version: '1.0.0' } },",
        "};",
        "",
      ].join("\n"),
      "utf8"
    );

    const genCode = await runCli(["generate"], { cwd });
    expect(genCode).toBe(0);
    expect(existsSync(path.join(cwd, ".apifn", "openapi.yml"))).toBe(true);

    const jsonOut = path.join(cwd, "api.json");
    const exportCode = await runCli(["export", "json", jsonOut], { cwd });
    expect(exportCode).toBe(0);

    const raw = await readFile(jsonOut, "utf8");
    const parsed = JSON.parse(raw);
    expect(parsed.openapi).toBe("3.1.0");
    expect(parsed.info.title).toBe("CLI API");
  });

  it("TV-CLI-009: validate returns 0 for valid spec and 1 for invalid spec", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "apifn-cli-validate-"));
    const validPath = path.join(cwd, "valid.yml");
    const invalidPath = path.join(cwd, "invalid.yml");

    await writeFile(
      validPath,
      [
        "openapi: '3.1.0'",
        "info:",
        "  title: Valid API",
        "  version: '1.0.0'",
        "paths:",
        "  /health:",
        "    get:",
        "      responses:",
        "        '200':",
        "          description: OK",
        "",
      ].join("\n"),
      "utf8"
    );

    await writeFile(
      invalidPath,
      [
        "openapi: '3.1.0'",
        "info:",
        "  version: '1.0.0'",
        "paths: {}",
        "",
      ].join("\n"),
      "utf8"
    );

    const okCode = await runCli(["validate", validPath], { cwd });
    const failCode = await runCli(["validate", invalidPath], { cwd });

    expect(okCode).toBe(0);
    expect(failCode).toBe(1);
  });

  it("CI-003: validate --format json returns parseable machine output", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "apifn-cli-validate-json-"));
    const validPath = path.join(cwd, "valid.yml");
    const invalidPath = path.join(cwd, "invalid.yml");

    await writeFile(
      validPath,
      [
        "openapi: '3.1.0'",
        "info:",
        "  title: Valid API",
        "  version: '1.0.0'",
        "paths: {}",
        "",
      ].join("\n"),
      "utf8"
    );
    await writeFile(invalidPath, "openapi: '3.1.0'\ninfo: {}\npaths: {}\n", "utf8");

    let validOut = "";
    const validCode = await runCli(["validate", validPath, "--format", "json"], {
      cwd,
      stdout: (t) => { validOut += t; },
    });
    expect(validCode).toBe(0);
    const validJson = JSON.parse(validOut) as { ok: boolean; errors: unknown[] };
    expect(validJson.ok).toBe(true);
    expect(Array.isArray(validJson.errors)).toBe(true);

    let invalidOut = "";
    const invalidCode = await runCli(["validate", invalidPath, "--format", "json"], {
      cwd,
      stdout: (t) => { invalidOut += t; },
    });
    expect(invalidCode).toBe(1);
    const invalidJson = JSON.parse(invalidOut) as { ok: boolean; errors: unknown[] };
    expect(invalidJson.ok).toBe(false);
    expect(invalidJson.errors.length).toBeGreaterThan(0);
  });

  it("imports an OpenAPI URL into an OpenCollection", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "apifn-cli-import-"));
    const spec = {
      openapi: "3.1.0",
      info: { title: "Import API", version: "1.0.0" },
      paths: {
        "/health": {
          get: {
            operationId: "getHealth",
            tags: ["system"],
            responses: { "200": { description: "OK" } },
          },
        },
      },
    };
    const server = createServer((_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(spec));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("server did not bind");
    }

    try {
      const outputDir = path.join(cwd, "collection");
      const code = await runCli([
        "import",
        "openapi",
        `http://127.0.0.1:${address.port}/openapi.json`,
        "--output",
        outputDir,
        "--base-url",
        "http://127.0.0.1:8787",
        "--env",
        "test",
      ], { cwd });

      expect(code).toBe(0);
      expect(existsSync(path.join(outputDir, "opencollection.yml"))).toBe(true);
      expect(existsSync(path.join(outputDir, "system", "gethealth.yml"))).toBe(true);
      const env = await readFile(path.join(outputDir, "environments", "test.yml"), "utf8");
      expect(env).toContain("http://127.0.0.1:8787");
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => error ? reject(error) : resolve())
      );
    }
  });

  it("import --force replaces generated collection files without deleting unrelated files", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "apifn-cli-import-force-"));
    const outputDir = path.join(cwd, "collection");
    const firstSpecPath = path.join(cwd, "first.json");
    const secondSpecPath = path.join(cwd, "second.json");

    await writeFile(firstSpecPath, JSON.stringify({
      openapi: "3.1.0",
      info: { title: "First API", version: "1.0.0" },
      paths: {
        "/old": {
          get: {
            operationId: "oldHealth",
            tags: ["system"],
            responses: { "200": { description: "OK" } },
          },
        },
      },
    }), "utf8");
    await writeFile(secondSpecPath, JSON.stringify({
      openapi: "3.1.0",
      info: { title: "Second API", version: "1.0.0" },
      paths: {
        "/new": {
          get: {
            operationId: "newHealth",
            tags: ["system"],
            responses: { "200": { description: "OK" } },
          },
        },
      },
    }), "utf8");

    expect(await runCli(["import", "openapi", firstSpecPath, "--output", outputDir], { cwd })).toBe(0);

    const unrelatedRootFile = path.join(outputDir, "README.md");
    const unrelatedNestedFile = path.join(outputDir, "system", "notes.txt");
    await writeFile(unrelatedRootFile, "keep me", "utf8");
    await writeFile(unrelatedNestedFile, "keep me too", "utf8");

    const code = await runCli(["import", "openapi", secondSpecPath, "--output", outputDir, "--force"], { cwd });

    expect(code).toBe(0);
    expect(existsSync(path.join(outputDir, "system", "oldhealth.yml"))).toBe(false);
    expect(existsSync(path.join(outputDir, "system", "newhealth.yml"))).toBe(true);
    expect(existsSync(unrelatedRootFile)).toBe(true);
    expect(existsSync(unrelatedNestedFile)).toBe(true);
  });
});
