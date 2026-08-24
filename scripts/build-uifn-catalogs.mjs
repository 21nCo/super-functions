import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const repoRoot = path.resolve(import.meta.dirname, "..");
const catalogsRoot = path.join(repoRoot, "uifn", "catalogs");
const stageRoot = path.join(catalogsRoot, "dist");
const canonicalCatalog = JSON.parse(
  fs.readFileSync(path.join(repoRoot, "uifn", "catalog", "generated", "catalog.json"), "utf8")
);
const npmBin = path.join(path.dirname(process.execPath), "npm");
const commandEnv = {
  ...process.env,
  PATH: `${path.dirname(process.execPath)}:${process.env.PATH ?? ""}`,
  NEXT_TELEMETRY_DISABLED: "1",
  NUXT_TELEMETRY_DISABLED: "1",
  CI: "1",
};
const skipBuild = process.argv.includes("--skip-build");
const cropFixturePath = path.join(catalogsRoot, "landing", "crop-landscape.svg");
const catalogDevCropFixturePaths = [
  path.join(catalogsRoot, "react", "public", "components", "crop-landscape.svg"),
  path.join(catalogsRoot, "svelte", "static", "components", "crop-landscape.svg"),
  path.join(catalogsRoot, "solid", "public", "components", "crop-landscape.svg"),
];

for (const fixturePath of catalogDevCropFixturePaths) {
  assertFile(fixturePath, `Catalog development fixture is missing: ${fixturePath}`);
  if (!fs.readFileSync(fixturePath).equals(fs.readFileSync(cropFixturePath))) {
    throw new Error(`Catalog development fixture must match ${cropFixturePath}: ${fixturePath}`);
  }
}

const dependencyWorkspaces = [
  "@uifn/core",
  "@uifn/dom",
  "@uifn/adapter-kit",
  "@uifn/react",
  "@uifn/svelte",
  "@uifn/solid",
  "@uifn/tokens",
  "@uifn/theme",
  "@uifn/recipes",
  "@uifn/components",
  "@uifn/components-react",
  "@uifn/components-svelte",
  "@uifn/components-solid",
  "@uifn/patterns",
  "@uifn/sf",
  "@uifn/examples-shared",
];

const catalogs = [
  { id: "react", workspace: "@uifn/catalog-react", output: "uifn/catalogs/react/out" },
  { id: "svelte", workspace: "@uifn/catalog-svelte", output: "uifn/catalogs/svelte/build" },
  { id: "solid", workspace: "@uifn/catalog-solid", output: "uifn/catalogs/solid/.output/public" },
];

if (!skipBuild) {
  for (const workspace of dependencyWorkspaces) {
    run(npmBin, ["--workspace", workspace, "run", "build"]);
  }

  for (const catalog of catalogs) {
    run(npmBin, ["--workspace", catalog.workspace, "run", "build"]);
  }
}

const sharedModulePath = path.join(repoRoot, "uifn", "examples", "shared", "dist", "index.js");
assertFile(sharedModulePath, "Build @uifn/examples-shared before staging catalog routes");
run(process.execPath, [path.join(repoRoot, "scripts", "verify-uifn-catalog-snippets.mjs")]);
const shared = await import(`${pathToFileURL(sharedModulePath).href}?catalog-build=${Date.now()}`);
const frameworkRoutes = uniqueRoutes([
  ...shared.workbenchRoutes,
  { id: "hooks", path: "/hooks", family: "hook", title: "Hooks" },
  ...shared.catalogHooks.map((hook) => ({
    id: `hook-${hook.slug}`,
    path: `/hooks/${hook.slug}`,
    family: "hook",
    slug: hook.slug,
    title: hook.displayName,
    hook,
  })),
]);

fs.rmSync(stageRoot, { recursive: true, force: true });
fs.mkdirSync(path.join(stageRoot, "components"), { recursive: true });
fs.copyFileSync(
  path.join(catalogsRoot, "landing", "index.html"),
  path.join(stageRoot, "components", "index.html")
);
fs.copyFileSync(
  path.join(catalogsRoot, "landing", "og.png"),
  path.join(stageRoot, "components", "og.png")
);
fs.copyFileSync(
  cropFixturePath,
  path.join(stageRoot, "components", "crop-landscape.svg")
);

for (const catalog of catalogs) {
  const outputRoot = path.join(repoRoot, catalog.output);
  const nestedRoot = path.join(outputRoot, "components", catalog.id);
  const copyRoot = fs.existsSync(path.join(nestedRoot, "index.html")) ? nestedRoot : outputRoot;
  assertFile(path.join(copyRoot, "index.html"), `${catalog.id} catalog did not produce index.html`);
  fs.cpSync(copyRoot, path.join(stageRoot, "components", catalog.id), { recursive: true });
  if (catalog.id === "solid") {
    const solidIndex = path.join(stageRoot, "components", "solid", "index.html");
    const solidHtml = fs.readFileSync(solidIndex, "utf8")
      .replaceAll('"/_build/', '"/components/solid/_build/');
    fs.writeFileSync(solidIndex, solidHtml);
  }
  const frameworkRoot = path.join(stageRoot, "components", catalog.id);
  const templateHtml = fs.readFileSync(path.join(frameworkRoot, "index.html"), "utf8");
  for (const route of frameworkRoutes) {
    const metadata = routeMetadata(route, catalog.id, shared);
    const outputDirectory = route.path === "/"
      ? frameworkRoot
      : path.join(frameworkRoot, route.path.replace(/^\/+/, ""));
    const routeIndex = path.join(outputDirectory, "index.html");
    const routeTemplateHtml = fs.existsSync(routeIndex)
      ? fs.readFileSync(routeIndex, "utf8")
      : templateHtml;
    fs.mkdirSync(outputDirectory, { recursive: true });
    fs.writeFileSync(
      routeIndex,
      decorateRouteHtml(routeTemplateHtml, metadata)
    );
  }
  fs.copyFileSync(
    path.join(frameworkRoot, "index.html"),
    path.join(frameworkRoot, "__catalog.html")
  );
}

const publicRoutes = frameworkRoutes.filter((route) => (
  route.family !== "qa" &&
  !route.path.includes("/qa") &&
  !route.path.endsWith("/states") &&
  !route.fixtureId
));
const sitemapUrls = [
  "https://uifn.dev/components/",
  ...catalogs.flatMap((catalog) => publicRoutes.map((route) => (
    `https://uifn.dev/components/${catalog.id}${route.path === "/" ? "/" : route.path}`
  ))),
];
fs.writeFileSync(
  path.join(stageRoot, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemapUrls.map((url) => `  <url><loc>${escapeXml(url)}</loc></url>`).join("\n")}\n</urlset>\n`
);
fs.writeFileSync(
  path.join(stageRoot, "robots.txt"),
  "User-agent: *\nAllow: /\nSitemap: https://uifn.dev/sitemap.xml\n"
);
fs.writeFileSync(
  path.join(stageRoot, "components", "llms.txt"),
  buildLlmsIndex(shared)
);
fs.writeFileSync(
  path.join(stageRoot, "components", "llms-full.txt"),
  buildLlmsFull(shared)
);
fs.writeFileSync(
  path.join(stageRoot, "components", "404.html"),
  buildNotFoundHtml()
);

const manifest = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  basePath: "/components",
  frameworks: catalogs.map((catalog) => ({
    id: catalog.id,
    path: `/components/${catalog.id}/`,
  })),
  inventory: {
    components: canonicalCatalog.primitiveCount,
    hooks: 2,
    patterns: 14,
    sfPanels: 14,
  },
  routes: {
    perFramework: frameworkRoutes.length,
    publicPerFramework: publicRoutes.length,
    staticallyAddressable: frameworkRoutes.length * catalogs.length,
  },
  resources: [
    "/robots.txt",
    "/sitemap.xml",
    "/components/llms.txt",
    "/components/llms-full.txt",
    "/components/og.png",
    "/components/crop-landscape.svg",
  ],
};

fs.writeFileSync(
  path.join(stageRoot, "catalog-manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`
);

run(process.execPath, [
  path.join(repoRoot, "scripts", "verify-uifn-catalog-performance.mjs"),
]);

console.log(JSON.stringify({ ok: true, command: "build:uifn-catalogs", stageRoot, ...manifest }, null, 2));

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: "inherit",
    env: commandEnv,
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function assertFile(filePath, message) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    throw new Error(message);
  }
}

function uniqueRoutes(routes) {
  return [...new Map(routes.map((route) => [route.path, route])).values()];
}

function routeMetadata(route, framework, shared) {
  const fallbackTitle = route.title ?? "uifn catalog";
  const title = shared.catalogPageTitle(route.path, fallbackTitle);
  const description = route.hook?.description
    ?? shared.catalogPageDescription(route.path, route, framework);
  const canonicalPath = route.path === "/" ? "/" : route.path;
  const canonical = `https://uifn.dev/components/${framework}${canonicalPath}`;
  const noindex = route.family === "qa" || route.path.includes("/qa") || Boolean(route.fixtureId);
  return {
    title: `${title} – uifn ${shared.catalogFrameworkLabel(framework).split(" + ")[0]}`,
    description,
    canonical,
    noindex,
  };
}

function decorateRouteHtml(html, metadata) {
  const headEnd = html.indexOf("</head>");
  if (headEnd === -1) throw new Error("Catalog output is missing </head>");
  let head = html.slice(0, headEnd);
  const tail = html.slice(headEnd);
  head = head
    .replace(/<title>[\s\S]*?<\/title>/i, "")
    .replace(/<meta\s+(?:name|property)=["'](?:description|robots|og:[^"']+|twitter:[^"']+)["'][^>]*>/gi, "")
    .replace(/<link\s+rel=["']canonical["'][^>]*>/gi, "");
  const jsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: metadata.title,
    description: metadata.description,
    url: metadata.canonical,
    isPartOf: {
      "@type": "WebSite",
      name: "uifn component catalog",
      url: "https://uifn.dev/components/",
    },
  }).replaceAll("<", "\\u003c");
  const tags = [
    `<title>${escapeHtml(metadata.title)}</title>`,
    `<meta name="description" content="${escapeHtml(metadata.description)}">`,
    `<meta name="robots" content="${metadata.noindex ? "noindex,follow" : "index,follow"}">`,
    `<link rel="canonical" href="${escapeHtml(metadata.canonical)}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="uifn">`,
    `<meta property="og:title" content="${escapeHtml(metadata.title)}">`,
    `<meta property="og:description" content="${escapeHtml(metadata.description)}">`,
    `<meta property="og:url" content="${escapeHtml(metadata.canonical)}">`,
    `<meta property="og:image" content="https://uifn.dev/components/og.png">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${escapeHtml(metadata.title)}">`,
    `<meta name="twitter:description" content="${escapeHtml(metadata.description)}">`,
    `<meta name="twitter:image" content="https://uifn.dev/components/og.png">`,
    `<meta name="theme-color" content="#f7f8fb">`,
    `<script type="application/ld+json">${jsonLd}</script>`,
  ].join("");
  return `${head}${tags}${tail}`;
}

function buildLlmsIndex(shared) {
  const componentLinks = shared.workbenchComponents
    .map((component) => `- [${component.displayName}](https://uifn.dev/components/react/components/${component.slug}): ${shared.catalogComponentDescription(component.slug)}`)
    .join("\n");
  return `# uifn

> Framework-native accessible primitives, headless adapters, and styled components for React, Svelte, and Solid.

## Documentation

- [React catalog](https://uifn.dev/components/react/)
- [Svelte catalog](https://uifn.dev/components/svelte/)
- [Solid catalog](https://uifn.dev/components/solid/)
- [Getting started](https://uifn.dev/components/react/getting-started)
- [Styling](https://uifn.dev/components/react/styling)
- [Accessibility](https://uifn.dev/components/react/accessibility)
- [Registry and source installation](https://uifn.dev/components/react/registry)
- [Full catalog context](https://uifn.dev/components/llms-full.txt)

## Components

${componentLinks}
`;
}

function buildLlmsFull(shared) {
  const components = shared.workbenchComponents.map((component) => {
    const states = component.states.join(", ") || "default";
    const anatomy = component.anatomy.map((part) => `\`${part}\``).join(", ");
    return `## ${component.displayName}

Path: /components/{react|svelte|solid}/components/${component.slug}

${shared.catalogComponentDescription(component.slug)}

- States: ${states}
- Anatomy: ${anatomy}
`;
  }).join("\n");
  return `# uifn component catalog — full context

uifn has three permanent layers:

1. \`@uifn/core\` is unstyled and framework-independent.
2. \`@uifn/react\`, \`@uifn/svelte\`, and \`@uifn/solid\` are headless framework adapters.
3. \`@uifn/components-react\`, \`@uifn/components-svelte\`, and \`@uifn/components-solid\` are styled, precomposed components.

The catalog contains ${shared.workbenchComponents.length} canonical components and renders the actual styled framework packages.

Package install:

\`\`\`sh
npm install @uifn/components-react
\`\`\`

Source install:

\`\`\`sh
npx @uifn/registry add button --framework react --cwd .
\`\`\`

${components}
`;
}

function buildNotFoundHtml() {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Page not found – uifn</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f7f8fb;color:#111827;font:16px/1.6 Inter,system-ui,sans-serif}main{width:min(560px,calc(100% - 40px));padding:40px;border:1px solid #e2e7ef;border-radius:20px;background:#fff;box-shadow:0 18px 50px rgb(23 30 50 / 8%)}p{color:#667085}a{color:#554bd6;font-weight:700}</style></head><body><main><strong>uifn</strong><h1>That catalog page does not exist.</h1><p>The component, guide, or framework path may have changed.</p><a href="/components/">Return to the component catalog</a></main></body></html>`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeXml(value) {
  return escapeHtml(value);
}
