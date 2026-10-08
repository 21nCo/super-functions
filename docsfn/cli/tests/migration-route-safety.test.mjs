import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile, access, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { loadDocsConfig } from "@docsfn/core";

const execute = promisify(execFile);
const cli = fileURLToPath(new URL("../dist/index.js", import.meta.url));
test("migration publishes referenced media and leaves docs-local private files behind", async () => {
  const root = await mkdtemp(join(tmpdir(), "docsfn-migration-assets-"));
  try {
    const source = join(root, "source"), target = join(root, "target");
    await mkdir(join(source, "docs/guide"), { recursive: true });
    await mkdir(join(source, "static"));
    await writeFile(
      join(source, "docs/index.md"),
      '# Docs\n![Diagram](guide/diagram.png)\n[Data](secrets.json)\n![Flow][flow]\n[Clip][clip]\n[Voice][voice]\n[Leak][leak]\n\n[flow]: ./guide/flow.png "Flow"\n[clip]: <guide/demo clip.mov>\n  [voice]: guide/note.m4a\n[leak]: ./secrets.json\n'
    );
    await writeFile(join(source, "docs/guide/flow.png"), "reference media");
    await writeFile(join(source, "docs/guide/demo clip.mov"), "video");
    await writeFile(join(source, "docs/guide/note.m4a"), "audio");
    await writeFile(join(source, "docs/guide/diagram.png"), "intended media");
    await writeFile(join(source, "docs/secrets.json"), "private data");
    await writeFile(join(source, "docs/.env"), "private settings");
    await writeFile(join(source, "docs/unused.png"), "unreferenced media");
    await writeFile(join(source, "static/public.json"), "explicit public asset");
    await execute(process.execPath, [cli, "migrate", "docusaurus", source, "--out-dir", target]);
    assert.equal(await readFile(join(target, "static/docs-assets/guide/diagram.png"), "utf8"), "intended media");
    const migrated = await readFile(join(target, "content/docs/index.md"), "utf8");
    assert.match(migrated, /\/docs-assets\/guide\/diagram.png/);
    assert.match(migrated, /^\[flow\]: \/docs-assets\/guide\/flow\.png "Flow"$/m);
    assert.match(migrated, /^\[clip\]: <\/docs-assets\/guide\/demo%20clip\.mov>$/m);
    assert.match(migrated, /^  \[voice\]: \/docs-assets\/guide\/note\.m4a$/m);
    assert.match(migrated, /^\[leak\]: \.\/secrets\.json$/m);
    for (const [file, content] of [["flow.png", "reference media"], ["demo clip.mov", "video"], ["note.m4a", "audio"]])
      assert.equal(await readFile(join(target, "static/docs-assets/guide", file), "utf8"), content);
    for (const file of ["secrets.json", ".env", "unused.png"])
      await assert.rejects(access(join(target, "static/docs-assets", file)));
    assert.equal(await readFile(join(target, "static/public.json"), "utf8"), "explicit public asset");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("migration serializes accepted route bases as config data", async () => {
  const root = await mkdtemp(join(tmpdir(), "docsfn-migration-config-"));
  try {
    const source = join(root, "source"), target = join(root, "target");
    await mkdir(join(source, "docs"), { recursive: true });
    await writeFile(join(source, "docs/index.md"), "# Docs");
    const docs = '/docs"quote', changelog = '/changes"quote';
    await execute(process.execPath, [cli, "migrate", "docusaurus", source, "--out-dir", target,
      "--docs-base-path", docs, "--changelog-base-path", changelog]);
    const config = await loadDocsConfig({ cwd: target, configPath: "docsfn.config.migration.ts" });
    assert.equal(config.site.basePath, docs);
    assert.equal(config.navigation.topNav[0].href, docs);
    assert.equal(config.collections.changelog.routeBase, changelog);
    assert.equal(config.collections.changelog.feedPath, changelog + "/rss.xml");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("migration rejects parent routes before creating output or overwriting outside files", async () => {
  const root = await mkdtemp(join(tmpdir(), "docsfn-migration-safety-"));
  try {
    const source = join(root, "source");
    const target = join(root, "target");
    const outside = join(root, "outside");
    await mkdir(join(source, "docs"), { recursive: true });
    await mkdir(join(source, "pages"));
    await mkdir(outside);
    await writeFile(join(source, "docs/index.md"), "# Docs");
    await writeFile(join(source, "pages/page.md"), "# Replacement");
    await writeFile(join(outside, "page.md"), "Keep this file");
    for (const route of ["/../../../outside", "/%2e%2e/%2e%2e/%2e%2e/outside", "/docs/./pages"]) {
      await assert.rejects(execute(process.execPath, [cli, "migrate", "docusaurus", source,
        "--out-dir", target, "--pages-dir", "pages", "--pages-base-path", route], { timeout: 30000 }),
        error => /without dot segments/.test(error.stdout + error.stderr));
      assert.equal(await readFile(join(outside, "page.md"), "utf8"), "Keep this file");
      await assert.rejects(access(target));
    }
    await execute(process.execPath, [cli, "migrate", "docusaurus", source,
      "--out-dir", target, "--pages-dir", "pages", "--pages-base-path", "/product"], { timeout: 30000 });
    assert.match(await readFile(join(target, "content/pages/product/page.md"), "utf8"), /Replacement/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

for (const placement of ["page-directory", "page-file", "static-file", "report-file"]) {
  test(`migration rejects an existing ${placement} symlink without overwriting its target`, async (t) => {
    const root = await mkdtemp(join(tmpdir(), "docsfn-migration-link-"));
    try {
      const source = join(root, "source");
      const target = join(root, "target");
      const outside = join(root, "outside");
      await mkdir(join(source, "docs"), { recursive: true });
      await mkdir(join(source, "pages"));
      await mkdir(join(source, "static"));
      await mkdir(join(target, "content/pages/product"), { recursive: true });
      await mkdir(join(target, "static"));
      await mkdir(join(target, ".docsfn-migration"));
      await mkdir(outside);
      await writeFile(join(source, "docs/index.md"), "# Docs");
      await writeFile(join(source, "pages/page.md"), "# Replacement");
      await writeFile(join(source, "static/asset.txt"), "Replacement asset");
      const sentinel = join(outside, "page.md");
      await writeFile(sentinel, "Keep outside content");
      if (placement === "page-directory") {
        await rm(join(target, "content/pages/product"), { recursive: true });
        await symlink(outside, join(target, "content/pages/product"), process.platform === "win32" ? "junction" : "dir");
      } else {
        const destination = placement === "page-file" ? "content/pages/product/page.md"
          : placement === "static-file" ? "static/asset.txt" : ".docsfn-migration/report.md";
        try { await symlink(sentinel, join(target, destination), "file"); }
        catch (error) {
          if (process.platform !== "win32" || error.code !== "EPERM") throw error;
          t.skip("File symlinks require Windows elevation or Developer Mode");
          return;
        }
      }
      await assert.rejects(execute(process.execPath, [cli, "migrate", "docusaurus", source,
        "--out-dir", target, "--pages-dir", "pages", "--pages-base-path", "/product"], { timeout: 30000 }),
        error => /symlinks or junctions/.test(error.stdout + error.stderr));
      assert.equal(await readFile(sentinel, "utf8"), "Keep outside content");
    } finally { await rm(root, { recursive: true, force: true }); }
  });
}


test("migration accepts an ancestor alias while confining outputs to the selected root", async () => {
  const root = await mkdtemp(join(tmpdir(), "docsfn-migration-parent-"));
  try {
    const source = join(root, "source");
    const actual = join(root, "actual");
    const alias = join(root, "alias");
    await mkdir(join(source, "docs"), { recursive: true });
    await mkdir(actual);
    await writeFile(join(source, "docs/index.md"), "# Docs");
    await writeFile(join(actual, "sentinel.txt"), "Keep parent content");
    await symlink(actual, alias, process.platform === "win32" ? "junction" : "dir");
    await execute(process.execPath, [cli, "migrate", "docusaurus", source,
      "--out-dir", join(alias, "target")], { timeout: 30000 });
    assert.match(await readFile(join(actual, "target/content/docs/index.md"), "utf8"), /Docs/);
    assert.equal(await readFile(join(actual, "sentinel.txt"), "utf8"), "Keep parent content");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("migration evaluates TypeScript sidebars without Node globals", async () => {
  const root = await mkdtemp(join(tmpdir(), "docsfn-migration-sidebars-"));
  try {
    const source = join(root, "source");
    await mkdir(join(source, "docs"), { recursive: true });
    for (const page of ["intro", "guide", "zeta"]) await writeFile(join(source, `docs/${page}.md`), `# ${page}\n`);
    // The extensionless import makes native import() fail, exercising text evaluation.
    await writeFile(join(source, "sidebar-extra.ts"), 'export const guide = "guide";\n');
    const sidebars = (body) =>
      `import { guide } from "./sidebar-extra";\nconst sidebars: Record<string, string[]> = ${body};\nexport default sidebars;\n`;
    await writeFile(join(source, "sidebars.ts"), sidebars('{ docs: ["zeta", guide, "intro"] }'));
    const migrate = async (target) => {
      await execute(process.execPath, [cli, "migrate", "docusaurus", source, "--out-dir", target]);
      return readFile(join(target, ".docsfn-migration/report.md"), "utf8");
    };
    const ordered = join(root, "ordered");
    await migrate(ordered);
    assert.deepEqual(JSON.parse(await readFile(join(ordered, "content/docs/meta.json"), "utf8")).pages, ["zeta", "guide", "intro"]);

    await writeFile(join(source, "sidebars.ts"), sidebars('{ docs: [process.env.HOME ? "zeta" : "intro", guide] }'));
    assert.match(await migrate(join(root, "isolated")), /Sidebar load error: process is not defined/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("migration leaves asset references in code examples literal and unpublished", async () => {
  const root = await mkdtemp(join(tmpdir(), "docsfn-migration-code-assets-"));
  try {
    const source = join(root, "source"), target = join(root, "target");
    await mkdir(join(source, "docs"), { recursive: true });
    for (const file of ["internal.pdf", "tilde.png", "inline.png", "quoted.png", "public.png"])
      await writeFile(join(source, "docs", file), file);
    const examples = [
      "# Example",
      "",
      "```md",
      "[example]: ./internal.pdf",
      "```",
      "",
      "~~~~md",
      "~~~",
      "![Tilde](./tilde.png)",
      "~~~~",
      "",
      "Use `![Inline](./inline.png)` in prose.",
      "",
      "> ```html",
      '> <img src="./quoted.png">',
      "> ```",
      "",
      "![Public][public]",
      "",
      "[public]: ./public.png",
      "",
    ].join("\n");
    await writeFile(join(source, "docs/index.md"), examples);
    await execute(process.execPath, [cli, "migrate", "docusaurus", source, "--out-dir", target]);
    const migrated = await readFile(join(target, "content/docs/index.md"), "utf8");
    assert.equal(migrated, examples.replace("[public]: ./public.png", "[public]: /docs-assets/public.png"));
    assert.equal(await readFile(join(target, "static/docs-assets/public.png"), "utf8"), "public.png");
    for (const file of ["internal.pdf", "tilde.png", "inline.png", "quoted.png"])
      await assert.rejects(access(join(target, "static/docs-assets", file)));
  } finally { await rm(root, { recursive: true, force: true }); }
});
