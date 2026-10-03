import { describe, expect, it } from "vitest";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

const root = fileURLToPath(new URL("../../", import.meta.url));
function put(base, file, text, mode) {
  const target = join(base, file);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, text, mode ? { mode } : undefined);
}
function execute(base, args, env = {}) {
  return execFileSync(process.execPath, args, {
    cwd: base, encoding: "utf8", env: { ...process.env, ...env },
  });
}

describe("public documentation origin ownership", () => {
  it.skipIf(process.platform === "win32")("deploy CLI forwards dev/live public targets independently of asset paths", () => {
    const base = mkdtempSync(join(tmpdir(), "docs-origin-cli-"));
    try {
      for (const file of ["scripts/cloudflare-docs/config.mjs", "scripts/cloudflare-docs/deploy.mjs", "clifn/docs/package.json"]) {
        put(base, file, readFileSync(join(root, file)));
      }
      put(base, "clifn/docs/.svelte-kit/cloudflare/_worker.js", "// stub built output\n");
      put(base, "bin/npx", '#!/usr/bin/env node\nrequire("node:fs").writeFileSync(process.env.BUILD_CAPTURE, JSON.stringify({public: process.env.CLOUDFLARE_DOCS_PUBLIC_ORIGIN, assets: process.env.CLOUDFLARE_DOCS_ASSETS_ORIGIN, args: process.argv.slice(2)}));\n', 0o755);
      put(base, "node_modules/.bin/wrangler", '#!/usr/bin/env node\nif (!process.argv.includes("--dry-run")) process.exit(99);\n', 0o755);
      for (const [environment, host] of [["dev", "dev.clifn.com"], ["live", "clifn.com"]]) {
        const capture = join(base, "capture.json");
        execute(base, ["scripts/cloudflare-docs/deploy.mjs", environment, "--products=clifn", "--dry-run"], {
          PATH: `${join(base, "bin")}:${process.env.PATH}`, BUILD_CAPTURE: capture,
        });
        const build = JSON.parse(readFileSync(capture, "utf8"));
        expect(build.public).toBe(`https://${host}`);
        expect(build.assets).toBe(`https://${host}`);
        expect(build.args).toContain("--filter=@clifn/docs...");
      }
    } finally { rmSync(base, { recursive: true, force: true }); }
  });

  it("actual generator uses public docs rather than a distinct assets host, and safely falls back without public origin", () => {
    const base = mkdtempSync(join(tmpdir(), "docs-origin-generator-"));
    try {
      for (const file of ["clifn/docs/package.json", "clifn/docs/docsfn.config.ts", "clifn/docs/scripts/generate-llms.mjs", "scripts/docs-site/llms.mjs"]) {
        put(base, file, readFileSync(join(root, file)));
      }
      cpSync(join(root, "clifn/docs/content"), join(base, "clifn/docs/content"), { recursive: true });
      mkdirSync(join(base, "clifn/docs/static"));
      const require = createRequire(join(root, "clifn/docs/package.json"));
      mkdirSync(join(base, "clifn/docs/node_modules/@docsfn"), { recursive: true });
      for (const dependency of ["core", "provider-fs"]) {
        // Resolve the actual consumer installation, including hoisted npm layouts.
        const packageDirectory = dirname(dirname(require.resolve(`@docsfn/${dependency}`)));
        expect(JSON.parse(readFileSync(join(packageDirectory, "package.json"), "utf8")).name).toBe(`@docsfn/${dependency}`);
        symlinkSync(packageDirectory, join(base, "clifn/docs/node_modules/@docsfn", dependency), "dir");
      }
      const generate = (publicOrigin) => {
        execute(join(base, "clifn/docs"), ["scripts/generate-llms.mjs"], {
          CLOUDFLARE_DOCS_DEPLOY: "1", CLOUDFLARE_DOCS_PUBLIC_ORIGIN: publicOrigin,
          CLOUDFLARE_DOCS_ASSETS_ORIGIN: "https://assets.example.test",
        });
        return ["llms.txt", "llms-full.txt"].map(file => readFileSync(join(base, "clifn/docs/static", file), "utf8"));
      };
      const published = generate("https://public.example.test");
      expect(published[0]).toContain("https://public.example.test/docs/");
      for (const output of published) expect(output).not.toContain("https://assets.example.test");
      for (const output of generate("")) {
        expect(output).toContain("https://github.com/21nCo/super-functions/blob/dev/clifn/docs/content/docs/");
        expect(output).not.toContain("https://assets.example.test");
      }
    } finally { rmSync(base, { recursive: true, force: true }); }
  });
});
