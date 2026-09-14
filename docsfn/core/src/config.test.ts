import { chmod, mkdir, mkdtemp, realpath, readdir, rm, unlink, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { getDocsConfigDependencies, isDocsConfigError, loadDocsConfig, validateDocsConfig } from "./config";

const tempDirs: string[] = [];

// Load the compiler once outside per-case timing; production import remains lazy.
beforeAll(async () => { await import("typescript"); }, 60_000);

afterEach(async () => {
  await Promise.all(
    tempDirs.map(async (dirPath) => {
      for (const entry of await readdir(dirPath).catch(() => [] as string[])) {
        if (entry.startsWith(".docsfn.") && entry.endsWith(".mjs")) {
          await unlink(join(dirPath, entry)).catch(() => undefined);
        }
      }
      await rm(dirPath, { recursive: true, force: true });
    })
  );
  tempDirs.length = 0;
});

async function createTempDir(): Promise<string> {
  const dirPath = await realpath(await mkdtemp(join(tmpdir(), "docsfn-config-test-")));
  tempDirs.push(dirPath);
  return dirPath;
}

function serializeConfig(config: unknown): string {
  return `export default ${JSON.stringify(config, null, 2)};\n`;
}

describe("loadDocsConfig", () => {
  it("loads explicit configPath before default config file", async () => {
    const cwd = await createTempDir();
    const explicitConfigPath = join(cwd, "custom.config.mjs");

    await writeFile(
      join(cwd, "docsfn.config.mjs"),
      serializeConfig({
        schemaVersion: 1,
        site: { title: "Default Config", basePath: "/docs" },
        compat: { preset: "none" },
        content: { root: cwd, docsDir: "content/docs" },
      })
    );

    await writeFile(
      explicitConfigPath,
      serializeConfig({
        schemaVersion: 1,
        site: { title: "Explicit Config", basePath: "/docs" },
        compat: { preset: "none" },
        content: { root: cwd, docsDir: "content/docs" },
      })
    );

    const loaded = await loadDocsConfig({
      cwd,
      configPath: explicitConfigPath,
    });

    expect(loaded.site.title).toBe("Explicit Config");
  });

  it("loads docsfn.config.ts when present", async () => {
    const cwd = await createTempDir();

    await writeFile(
      join(cwd, "docsfn.config.ts"),
      serializeConfig({
        schemaVersion: 1,
        site: { title: "TypeScript Config", basePath: "/docs" },
        compat: { preset: "fumadocs-v15" },
        content: { root: cwd, docsDir: "content/docs", apiDir: "api" },
      })
    );

    const loaded = await loadDocsConfig({ cwd });
    expect(loaded.site.title).toBe("TypeScript Config");
    expect(loaded.compat?.preset).toBe("fumadocs-v15");
  });

  it("loads a TypeScript config that imports a sibling module", async () => {
    const cwd = await createTempDir();

    await writeFile(join(cwd, "theme.js"), "export const title = 'Imported Theme';\n");
    await writeFile(
      join(cwd, "docsfn.config.ts"),
      [
        'import { title } from "./theme.js";',
        "namespace DocsfnForceTranspile { export const marker = 1; }",
        "void DocsfnForceTranspile.marker;",
        "export default {",
        "  schemaVersion: 1,",
        "  site: { title, basePath: '/docs' },",
        "  compat: { preset: 'none' },",
        `  content: { root: ${JSON.stringify(cwd)}, docsDir: 'content/docs' },`,
        "};",
        "",
      ].join("\n")
    );

    const [first, second] = await Promise.all([loadDocsConfig({ cwd }), loadDocsConfig({ cwd })]);
    expect(first.site.title).toBe("Imported Theme");
    expect(second.site.title).toBe("Imported Theme");
  });

  it("reloads an edited JavaScript config instead of returning the module cache", async () => {
    const cwd = await createTempDir();
    const configPath = join(cwd, "docsfn.config.mjs");
    const createConfig = (title: string) =>
      serializeConfig({
        schemaVersion: 1,
        site: { title, basePath: "/docs" },
        compat: { preset: "none" },
        content: { root: cwd, docsDir: "content/docs" },
      });

    await writeFile(configPath, createConfig("Before"));
    expect((await loadDocsConfig({ cwd })).site.title).toBe("Before");

    await writeFile(configPath, createConfig("After"));
    const changedAt = new Date(Date.now() + 1_000);
    await utimes(configPath, changedAt, changedAt);

    expect((await loadDocsConfig({ cwd })).site.title).toBe("After");
  });

  it("fails closed with DOCS_CONFIG_INVALID when config shape is invalid", async () => {
    const cwd = await createTempDir();

    await writeFile(
      join(cwd, "docsfn.config.mjs"),
      serializeConfig({
        site: { title: "Invalid Config", basePath: "docs" },
        compat: { preset: "none" },
        content: { root: cwd },
      })
    );

    try {
      await loadDocsConfig({ cwd });
      throw new Error("expected loadDocsConfig to throw");
    } catch (error) {
      expect(isDocsConfigError(error)).toBe(true);
      expect((error as { code: string }).code).toBe("DOCS_CONFIG_INVALID");
      expect((error as Error).message).toContain("site.basePath must start with '/'");
      expect((error as Error).message).toContain("schemaVersion must be 1");
    }
  });

  it("rejects unsupported compatibility presets", async () => {
    const cwd = await createTempDir();

    await writeFile(
      join(cwd, "docsfn.config.mjs"),
      serializeConfig({
        schemaVersion: 1,
        site: { title: "Invalid Compat", basePath: "/docs" },
        compat: { preset: "unsupported-preset" },
        content: { root: cwd, docsDir: "content/docs" },
      })
    );

    await expect(loadDocsConfig({ cwd })).rejects.toMatchObject({
      code: "DOCS_CONFIG_INVALID",
    });
  });

  it("rejects invalid versions config with multiple defaults", async () => {
    const cwd = await createTempDir();

    await writeFile(
      join(cwd, "docsfn.config.mjs"),
      serializeConfig({
        schemaVersion: 1,
        site: { title: "Invalid Versions", basePath: "/docs" },
        compat: { preset: "none" },
        content: { root: cwd, docsDir: "content/docs" },
        versions: {
          mode: "path-prefix",
          versions: [
            { slug: "v1", label: "Version 1", default: true },
            { slug: "v2", label: "Version 2", default: true },
          ],
        },
      })
    );

    await expect(loadDocsConfig({ cwd })).rejects.toMatchObject({
      code: "DOCS_CONFIG_INVALID",
    });
  });

  it("loads blog route config for changelog-style sections", async () => {
    const cwd = await createTempDir();

    await writeFile(
      join(cwd, "docsfn.config.mjs"),
      serializeConfig({
        schemaVersion: 1,
        site: { title: "Changelog Config", basePath: "/docs" },
        compat: { preset: "none" },
        content: {
          root: cwd,
          docsDir: "content/docs",
          blogDir: "content/changelog",
        },
        blog: {
          routeBase: "/changelog",
          feedPath: "/changelog/rss.xml",
        },
      })
    );

    const loaded = await loadDocsConfig({ cwd });

    expect(loaded.content.blogDir).toBe("content/changelog");
    expect(loaded.blog?.routeBase).toBe("/changelog");
    expect(loaded.blog?.feedPath).toBe("/changelog/rss.xml");
  });

  it("loads dated collection config for first-class changelog sections", async () => {
    const cwd = await createTempDir();

    await writeFile(
      join(cwd, "docsfn.config.mjs"),
      serializeConfig({
        schemaVersion: 1,
        site: { title: "Collections Config", basePath: "/docs" },
        compat: { preset: "none" },
        content: {
          root: cwd,
          docsDir: "content/docs",
        },
        collections: {
          changelog: {
            type: "dated",
            dir: "content/changelog",
            routeBase: "/changelog",
            feedPath: "/changelog/rss.xml",
            label: "Changelog",
            scope: "changelog",
          },
        },
      })
    );

    const loaded = await loadDocsConfig({ cwd });

    expect(loaded.collections?.changelog?.dir).toBe("content/changelog");
    expect(loaded.collections?.changelog?.routeBase).toBe("/changelog");
    expect(loaded.collections?.changelog?.feedPath).toBe("/changelog/rss.xml");
    expect(loaded.collections?.changelog?.label).toBe("Changelog");
    expect(loaded.collections?.changelog?.scope).toBe("changelog");
  });

  it("loads multiple docs directories for shared and product-specific docs", async () => {
    const cwd = await createTempDir();

    await writeFile(
      join(cwd, "docsfn.config.mjs"),
      serializeConfig({
        schemaVersion: 1,
        site: { title: "Multi Root Config", basePath: "/docs" },
        compat: { preset: "none" },
        content: {
          root: cwd,
          docsDir: ["../common/content/docs", "content/docs"],
        },
      })
    );

    const loaded = await loadDocsConfig({ cwd });

    expect(loaded.content.docsDir).toEqual(["../common/content/docs", "content/docs"]);
  });

  it("rejects blog route config that does not start with a slash", async () => {
    const cwd = await createTempDir();

    await writeFile(
      join(cwd, "docsfn.config.mjs"),
      serializeConfig({
        schemaVersion: 1,
        site: { title: "Invalid Blog Route", basePath: "/docs" },
        compat: { preset: "none" },
        content: { root: cwd, docsDir: "content/docs" },
        blog: {
          routeBase: "changelog",
        },
      })
    );

    await expect(loadDocsConfig({ cwd })).rejects.toMatchObject({
      code: "DOCS_CONFIG_INVALID",
    });
  });

  it("rejects dated collection routes that do not start with a slash", async () => {
    const cwd = await createTempDir();

    await writeFile(
      join(cwd, "docsfn.config.mjs"),
      serializeConfig({
        schemaVersion: 1,
        site: { title: "Invalid Collection Route", basePath: "/docs" },
        compat: { preset: "none" },
        content: { root: cwd, docsDir: "content/docs" },
        collections: {
          changelog: {
            dir: "content/changelog",
            routeBase: "changelog",
          },
        },
      })
    );

    await expect(loadDocsConfig({ cwd })).rejects.toMatchObject({
      code: "DOCS_CONFIG_INVALID",
    });
  });

  it("rejects collection ids that normalize to the legacy blog surface", async () => {
    const cwd = await createTempDir();

    await writeFile(
      join(cwd, "docsfn.config.mjs"),
      serializeConfig({
        schemaVersion: 1,
        site: { title: "Reserved Collection", basePath: "/docs" },
        compat: { preset: "none" },
        content: { root: cwd, docsDir: "content/docs" },
        collections: {
          Blog: {
            dir: "content/blog-v2",
            routeBase: "/blog-v2",
            feedPath: "/blog-v2/rss.xml",
          },
        },
      })
    );

    await expect(loadDocsConfig({ cwd })).rejects.toThrowError(
      /reserved for the legacy blog surface/
    );
  });

  it("rejects collection ids that collide after normalization", async () => {
    const cwd = await createTempDir();

    await writeFile(
      join(cwd, "docsfn.config.mjs"),
      serializeConfig({
        schemaVersion: 1,
        site: { title: "Colliding Collections", basePath: "/docs" },
        compat: { preset: "none" },
        content: { root: cwd, docsDir: "content/docs" },
        collections: {
          Changelog: {
            dir: "content/changelog",
            routeBase: "/changelog",
          },
          changelog: {
            dir: "content/changelog-alt",
            routeBase: "/changelog-alt",
          },
        },
      })
    );

    await expect(loadDocsConfig({ cwd })).rejects.toThrowError(/collides with 'Changelog'/);
  });

  it("rejects collection ids that normalize to an empty identifier", async () => {
    const cwd = await createTempDir();

    await writeFile(
      join(cwd, "docsfn.config.mjs"),
      serializeConfig({
        schemaVersion: 1,
        site: { title: "Empty Collection", basePath: "/docs" },
        compat: { preset: "none" },
        content: { root: cwd, docsDir: "content/docs" },
        collections: {
          "/": {
            dir: "content/slash",
            routeBase: "/slash",
          },
        },
      })
    );

    await expect(loadDocsConfig({ cwd })).rejects.toThrowError(
      /must normalize to a nonempty identifier/
    );
  });

  it("returns deterministic defaults only when no config file exists", async () => {
    const cwd = await createTempDir();

    const loaded = await loadDocsConfig({ cwd });

    expect(loaded).toMatchObject({
      schemaVersion: 1,
      site: {
        title: "Docs",
        basePath: "/docs",
      },
      compat: {
        preset: "none",
      },
      content: {
        root: cwd,
        docsDir: "content/docs",
        pagesDir: "pages",
        blogDir: "blog",
        apiDir: "api",
        assetsDir: "public",
        metaFileName: "meta.json",
      },
      auth: {
        enabled: false,
        mode: "public",
      },
      analytics: {
        enabled: false,
        provider: "watchfn",
        respectDnt: true,
      },
    });
  });
});

it("reloads transitive ESM config imports and cleans temporary modules", async () => {
  const cwd = await createTempDir();
  await writeFile(join(cwd, "docsfn.config.mjs"), 'import { title } from "./theme.mjs"; export default { schemaVersion: 1, site: { title }, content: { root: "." } };');
  await writeFile(join(cwd, "theme.mjs"), 'export { title } from "./title.mjs";');
  await writeFile(join(cwd, "title.mjs"), 'export const title = "Before";');
  expect((await loadDocsConfig({ cwd })).site.title).toBe("Before");
  await writeFile(join(cwd, "title.mjs"), 'export const title = "After";');
  expect((await loadDocsConfig({ cwd })).site.title).toBe("After");
  expect((await readdir(cwd)).filter((name) => name.startsWith(".docsfn."))).toEqual([]);
});
it.each([["/"], ["v1", "v1"]])("rejects ambiguous version slugs %j", async (...values) => {
  const slugs = values.flat() as string[];
  const cwd = await createTempDir();
  await writeFile(join(cwd, "docsfn.config.mjs"), serializeConfig({ schemaVersion: 1, site: { title: "Test" }, content: { root: "." }, versions: { mode: "path-prefix", versions: slugs.map((slug) => ({ slug, label: slug })) } }));
  await expect(loadDocsConfig({ cwd })).rejects.toMatchObject({ code: "DOCS_CONFIG_INVALID" });
});

it("reloads local CommonJS and JSON dependencies without retaining files", async () => {
  const cwd = await createTempDir();
  await writeFile(join(cwd, "docsfn.config.js"), 'const title = require("./theme.cjs"); module.exports = { schemaVersion: 1, site: { title }, content: { root: "." } };');
  await writeFile(join(cwd, "theme.cjs"), 'module.exports = require("./title.json").title;');
  await writeFile(join(cwd, "title.json"), '{"title":"Before"}');
  expect((await loadDocsConfig({ cwd })).site.title).toBe("Before");
  await writeFile(join(cwd, "title.json"), '{"title":"After"}');
  expect((await loadDocsConfig({ cwd })).site.title).toBe("After");
  expect((await readdir(cwd)).filter((name) => name.startsWith(".docsfn."))).toEqual([]);
});

it('loads extensionless TypeScript config dependencies concurrently', async () => {
  const cwd = await createTempDir();
  await writeFile(join(cwd, 'theme.ts'), 'export const title: string = "Theme";');
  await writeFile(join(cwd, 'docsfn.config.ts'), `import { title } from './theme'; export default { schemaVersion: 1, site: { title }, content: { root: ${JSON.stringify(cwd)} }, compat: { preset: 'none' } };`);
  const loaded = await Promise.all(Array.from({ length: 12 }, () => loadDocsConfig({ cwd })));
  expect(loaded.every(config => config.site.title === 'Theme')).toBe(true);
  expect((await readdir(cwd)).some(file => file.startsWith('.docsfn.'))).toBe(false);
});
it('respects CommonJS scope for side-effect-only require dependencies', async () => {
  const cwd = await createTempDir();
  await writeFile(join(cwd, 'package.json'), '{"type":"commonjs"}');
  await writeFile(join(cwd, 'side.js'), 'require("./values.json");');
  await writeFile(join(cwd, 'values.json'), '{}');
  await writeFile(join(cwd, 'docsfn.config.cjs'), `require('./side.js'); module.exports = { schemaVersion: 1, site: { title: 'CJS' }, content: { root: ${JSON.stringify(cwd)} }, compat: { preset: 'none' } };`);
  expect((await loadDocsConfig({ cwd, configPath: 'docsfn.config.cjs' })).site.title).toBe('CJS');
});

it("records missing extensionless dependency candidates and recovers when created", async () => {
  const cwd = await createTempDir();
  await writeFile(join(cwd, "docsfn.config.ts"), `import { title } from './missing'; export default { schemaVersion: 1, site: { title }, content: { root: ${JSON.stringify(cwd)} } };`);
  await expect(loadDocsConfig({ cwd })).rejects.toThrow();
  expect(getDocsConfigDependencies(join(cwd, "docsfn.config.ts"))).toContain(join(cwd, "missing.ts"));
  await writeFile(join(cwd, "missing.ts"), 'export const title = "Recovered";');
  expect((await loadDocsConfig({ cwd })).site.title).toBe("Recovered");
});

it.each(['theme', 'theme/index.js', 'theme/index.ts'])('reloads exact extensionless and directory dependencies: %s', async relative => {
  const cwd = await createTempDir();
  if (relative.includes('/')) await mkdir(join(cwd, 'theme'));
  await writeFile(join(cwd, relative), 'export const title = "Before";');
  await writeFile(join(cwd, 'docsfn.config.ts'), `import { title } from './theme'; export default { schemaVersion: 1, site: { title }, content: { root: '.' } };`);
  expect((await loadDocsConfig({ cwd })).site.title).toBe('Before');
  await writeFile(join(cwd, relative), 'export const title = "After";');
  expect((await loadDocsConfig({ cwd })).site.title).toBe('After');
});
it.each(['import values from "./values.json";', 'const { default: values } = await import("./values.json");', 'import values from "./values.json" with { type: "json" };', 'import values from "./values.json" assert { type: "json" };', 'const { default: values } = await import("./values.json", { with: { type: "json" } });'])('loads and refreshes ESM JSON config imports: %s', async statement => {
  const cwd = await createTempDir();
  await writeFile(join(cwd, 'values.json'), '{"title":"Before"}');
  await writeFile(join(cwd, 'docsfn.config.mjs'), `${statement} export default { schemaVersion: 1, site: { title: values.title }, content: { root: '.' } };`);
  expect((await loadDocsConfig({ cwd })).site.title).toBe('Before');
  await writeFile(join(cwd, 'values.json'), '{"title":"After"}');
  expect((await loadDocsConfig({ cwd })).site.title).toBe('After');
  expect((await readdir(cwd)).some(file => file.startsWith('.docsfn.'))).toBe(false);
});

it.each(['theme', 'theme/index.js'])('reloads CommonJS exact and directory modules: %s', async relative => {
  const cwd = await createTempDir();
  if (relative.includes('/')) await mkdir(join(cwd, 'theme'));
  await writeFile(join(cwd, relative), 'module.exports = "Before";');
  await writeFile(join(cwd, 'docsfn.config.cjs'), `const title = require('./theme'); module.exports = { schemaVersion: 1, site: { title }, content: { root: '.' } };`);
  expect((await loadDocsConfig({ cwd, configPath: 'docsfn.config.cjs' })).site.title).toBe('Before');
  await writeFile(join(cwd, relative), 'module.exports = "After";');
  expect((await loadDocsConfig({ cwd, configPath: 'docsfn.config.cjs' })).site.title).toBe('After');
});

it.each(['//outside.example', '/docs?x=1', '/docs#anchor', '/\\outside', '/docs/../internal', '/docs/./internal', '/docs/%2e%2e/internal', '/docs/.%2E/internal', '/docs/%2e/internal', '/docs/%2e%2f../internal', '/docs/%zz', '/docs/%3Fmanual', '/docs/v%31'])('rejects nonlocal route configuration %s', async route => {
  const cwd = await createTempDir();
  const base = { schemaVersion: 1, site: { title: 'Routes', basePath: '/docs' }, content: { root: cwd, docsDir: 'content/docs' } };
  for (const extra of [{ site: { ...base.site, basePath: route } }, { blog: { routeBase: route } }, { blog: { feedPath: route } }, { collections: { posts: { dir: 'posts', routeBase: route } } }]) {
    await writeFile(join(cwd, 'docsfn.config.mjs'), serializeConfig({ ...base, ...extra }));
    await expect(loadDocsConfig({ cwd })).rejects.toThrow();
  }
});

it.each(["path-prefix", "path-segment"])("requires one default for %s routing", (mode) => {
  const config = { schemaVersion: 1, site: { title: "Test" }, content: { root: "." }, versions: { mode, versions: [{ slug: "v1", label: "V1" }] } };
  expect(() => validateDocsConfig(config)).toThrow(/exactly one default/);
  expect(validateDocsConfig({ ...config, versions: { mode, versions: [{ slug: "v1", label: "V1", default: true }] } }).versions?.versions[0].default).toBe(true);
});
it.each(["//evil.test", "/docs?x=1", "/docs#x", "/docs\\bad", "/docs path"])("rejects invalid programmatic route %s", (basePath) => {
  expect(() => validateDocsConfig({ schemaVersion: 1, site: { title: "Test", basePath }, content: { root: "." } })).toThrow();
});


it("loads config from a read-only source tree with local modules and conditional package exports", async () => {
  const cwd = await createTempDir();
  const modules = join(cwd, "node_modules/fixture-package");
  await mkdir(modules, { recursive: true });
  await writeFile(join(modules, "package.json"), JSON.stringify({ name: "fixture-package", type: "module", exports: { import: "./esm.js", require: "./cjs.cjs" } }));
  await writeFile(join(modules, "esm.js"), 'export default "ESM package";');
  await writeFile(join(modules, "cjs.cjs"), 'module.exports = "CJS package";');
  await writeFile(join(cwd, "local.cjs"), 'module.exports = { title: require("fixture-package"), root: __dirname };');
  await writeFile(join(cwd, "docsfn.config.mjs"), `import title from 'fixture-package'; import direct from './node_modules/fixture-package/esm.js'; import { fileURLToPath } from 'node:url'; export default async () => { await Promise.resolve(); const {default: local} = await import('./local.cjs'); if (direct !== title || !fileURLToPath(import.meta.url).endsWith('docsfn.config.mjs')) throw new Error('Resolution changed'); return { schemaVersion: 1, site: { title: title + '/' + local.title }, content: { root: local.root } }; };`);
  const before = await readdir(cwd);
  await chmod(cwd, 0o555);
  await chmod(modules, 0o555);
  try {
    const config = await loadDocsConfig({ cwd });
    expect(config.site.title).toBe("ESM package/CJS package");
    expect(config.content.root).toBe(cwd);
    expect(await readdir(cwd)).toEqual(before);
    expect((await readdir(modules)).sort()).toEqual(["cjs.cjs", "esm.js", "package.json"]);
  } finally { await chmod(modules, 0o755); await chmod(cwd, 0o755); }
});

it("refreshes package-local aliases and self references with the correct import conditions", async () => {
  const cwd = await createTempDir();
  const manifest = join(cwd, "package.json");
  await writeFile(manifest, JSON.stringify({ name: "docsfn-config-fixture", type: "module", imports: { "#path": "path", "#theme": { import: "./theme.mjs", require: "./theme.cjs" } }, exports: { "./theme": "./theme.mjs" } }));
  await writeFile(join(cwd, "theme.mjs"), 'export default "Before";');
  await writeFile(join(cwd, "theme.cjs"), 'module.exports = "CommonJS";');
  await writeFile(join(cwd, "docsfn.config.mjs"), 'import {basename} from "#path"; if(basename("a/b")!=="b") throw new Error("alias failed"); import title from "#theme"; import self from "docsfn-config-fixture/theme"; export default {schemaVersion:1,site:{title:title+"/"+self},content:{root:"."}};');
  expect((await loadDocsConfig({ cwd })).site.title).toBe("Before/Before");
  expect(getDocsConfigDependencies(join(cwd, "docsfn.config.mjs"))).toContain(manifest);
  await writeFile(join(cwd, "theme.mjs"), 'export default "After";');
  expect((await loadDocsConfig({ cwd })).site.title).toBe("After/After");
  await writeFile(join(cwd, "docsfn.config.cjs"), 'module.exports={schemaVersion:1,site:{title:require("#theme")},content:{root:"."}};');
  expect((await loadDocsConfig({ cwd, configPath: "docsfn.config.cjs" })).site.title).toBe("CommonJS");
});

it.skipIf(process.platform === "win32" || process.getuid?.() === 0)("does not replace an inaccessible configuration with defaults", async () => {
  const cwd = await createTempDir();
  await writeFile(join(cwd, "docsfn.config.mjs"), 'export default {schemaVersion:1,site:{title:"Private"},content:{root:"."}};');
  await chmod(cwd, 0o000);
  try { await expect(loadDocsConfig({ cwd })).rejects.toThrow(); }
  finally { await chmod(cwd, 0o755); }
});

it("cleans staging after an async config export throws", async () => {
  const cwd = await createTempDir();
  const scratch = join(cwd, "scratch");
  await mkdir(scratch);
  await writeFile(join(cwd, "docsfn.config.mjs"), 'export default async () => { await Promise.resolve(); throw new Error("export failure"); };');
  const previous = process.env.TMPDIR;
  process.env.TMPDIR = scratch;
  try {
    await expect(loadDocsConfig({ cwd })).rejects.toThrow();
    expect(await readdir(scratch)).toEqual([]);
  } finally {
    if (previous === undefined) delete process.env.TMPDIR;
    else process.env.TMPDIR = previous;
  }
});

it("keeps module-relative location and resolver APIs bound to the original config", async () => {
  const cwd = await createTempDir();
  await writeFile(join(cwd, "asset.json"), '{}');
  await writeFile(join(cwd, "docsfn.config.mjs"), `import {fileURLToPath} from 'node:url'; import {realpathSync} from 'node:fs';
    if(import.meta.filename !== fileURLToPath(import.meta.url)) throw new Error('filename mismatch');
    if(fileURLToPath(import.meta.resolve('./asset.json')) !== realpathSync(import.meta.dirname + '/asset.json')) throw new Error('resolve mismatch');
    export default {schemaVersion:1,site:{title:"Test"},content:{root:import.meta.dirname}};`);
  expect((await loadDocsConfig({ cwd })).content.root).toBe(cwd);
  await writeFile(join(cwd, "docsfn.config.cjs"), `const path=require('node:path'); module.exports={schemaVersion:1,site:{title:"Test"},content:{root:path.dirname(require.resolve('./asset.json'))}};`);
  expect((await loadDocsConfig({ cwd, configPath: 'docsfn.config.cjs' })).content.root).toBe(await (await import('node:fs/promises')).realpath(cwd));
});
it("tracks an invalid package manifest and recovers after repair", async () => {
  const cwd = await createTempDir();
  const manifest = join(cwd, 'package.json');
  const config = join(cwd, 'docsfn.config.mjs');
  await writeFile(manifest, '{broken');
  await writeFile(config, "import title from '#title'; export default {schemaVersion:1,site:{title},content:{root:'.'}};");
  await expect(loadDocsConfig({ cwd })).rejects.toThrow();
  expect(getDocsConfigDependencies(config)).toContain(manifest);
  await writeFile(manifest, JSON.stringify({type:'module',imports:{'#title':'./title.mjs'}}));
  await writeFile(join(cwd,'title.mjs'), "export default 'repaired';");
  expect((await loadDocsConfig({ cwd })).site.title).toBe('repaired');
});
it("rejects file URL variants instead of collapsing distinct module identities", async () => {
  const cwd = await createTempDir();
  const {pathToFileURL} = await import('node:url');
  await writeFile(join(cwd,'theme.mjs'), "export default 'title';");
  await writeFile(join(cwd,'docsfn.config.mjs'), `import title from ${JSON.stringify(pathToFileURL(join(cwd,'theme.mjs')).href+'?variant=1')}; export default {schemaVersion:1,site:{title},content:{root:'.'}};`);
  await expect(loadDocsConfig({ cwd })).rejects.toMatchObject({cause:expect.objectContaining({message:expect.stringContaining('query or fragment')})});
});
it("rejects repeated separators in route bases", () => {
  expect(() => validateDocsConfig({schemaVersion:1,site:{title:'Test',basePath:'/docs//v1'},content:{root:'.'}})).toThrow();
});

it.each([['--conditions=development'], ['-C', 'development']])("preserves active custom resolver conditions: %s", async (...args) => {
  const cwd = await createTempDir();
  await writeFile(join(cwd,'package.json'), JSON.stringify({type:'module',imports:{'#theme':{development:'./dev.mjs',default:'./prod.mjs'}}}));
  await writeFile(join(cwd,'dev.mjs'), "export default 'development';");
  await writeFile(join(cwd,'prod.mjs'), "export default 'production';");
  await writeFile(join(cwd,'docsfn.config.mjs'), "import title from '#theme'; export default {schemaVersion:1,site:{title},content:{root:'.'}};");
  const previous = process.execArgv;
  process.execArgv = [...previous, ...args];
  try { expect((await loadDocsConfig({cwd})).site.title).toBe('development'); }
  finally { process.execArgv = previous; }
});

it.each(['mjs','cjs'])("preserves hashbangs and strict directives in %s configs", async extension => {
  const cwd = await createTempDir();
  await writeFile(join(cwd,'asset.json'), '{}');
  const source = extension === 'cjs'
    ? '#!/usr/bin/env node\n"use strict";\nif ((function(){return this})() !== undefined) throw new Error("strict mode lost"); require.resolve("./asset.json"); module.exports={schemaVersion:1,site:{title:"Strict"},content:{root:"."}};'
    : '#!/usr/bin/env node\nimport.meta.resolve("./asset.json"); export default {schemaVersion:1,site:{title:"Hashbang"},content:{root:"."}};';
  const configPath = `docsfn.config.${extension}`;
  await writeFile(join(cwd, configPath), source);
  expect((await loadDocsConfig({cwd,configPath})).site.title).toBe(extension==='cjs'?'Strict':'Hashbang');
});
it("honors the optional resolver parent when the Node feature is enabled", async () => {
  const cwd=await createTempDir(); const alternate=join(cwd,'alternate'); await mkdir(alternate);
  await writeFile(join(alternate,'asset.json'),'{}');
  const {pathToFileURL}=await import('node:url');
  const parent=pathToFileURL(join(alternate,'parent.mjs')).href;
  await writeFile(join(cwd,'docsfn.config.mjs'), `import {fileURLToPath} from 'node:url'; export default {schemaVersion:1,site:{title:fileURLToPath(import.meta.resolve('./asset.json',${JSON.stringify(parent)}))},content:{root:'.'}};`);
  const previous=process.execArgv; process.execArgv=[...previous,'--experimental-import-meta-resolve'];
  try { expect((await loadDocsConfig({cwd})).site.title).toBe(join(alternate,'asset.json')); }
  finally { process.execArgv=previous; }
});
it.each(['mjs','cjs'])("uses native source identity for a symlinked %s config", async (extension, context) => {
  const cwd=await createTempDir(); const source=join(cwd,'real'); const alias=join(cwd,'alias');
  await mkdir(source); await mkdir(alias); await writeFile(join(source,'theme.cjs'), 'module.exports="real-theme";');
  const file=`docsfn.config.${extension}`;
  const body=extension==='mjs' ? `import theme from './theme.cjs'; export default {schemaVersion:1,site:{title:theme},content:{root:import.meta.dirname}};`
    : `module.exports={schemaVersion:1,site:{title:require('./theme.cjs')},content:{root:__dirname}};`;
  await writeFile(join(source,file), body);
  const {symlink}=await import('node:fs/promises');
  try {await symlink(join(source,file),join(alias,file),'file');}
  catch(error) {if(process.platform==='win32' && (error as NodeJS.ErrnoException).code==='EPERM') {context.skip();return;} throw error;}
  const loaded=await loadDocsConfig({cwd:alias,configPath:file});
  expect(loaded.site.title).toBe('real-theme'); expect(loaded.content.root).toBe(source);
  expect(getDocsConfigDependencies(join(alias,file))).toContain(join(source,file));
  await writeFile(join(alias,'theme.cjs'), 'module.exports="alias-theme";');
  const previous=process.execArgv; process.execArgv=[...previous,'--preserve-symlinks'];
  try {
    const preserved=await loadDocsConfig({cwd:alias,configPath:file});
    expect(preserved.site.title).toBe('alias-theme'); expect(preserved.content.root).toBe(alias);
  } finally {process.execArgv=previous;}
});
