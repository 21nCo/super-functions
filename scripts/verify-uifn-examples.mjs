import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const rootDir = process.cwd();
const scopeArg = process.argv.find((arg) => arg.startsWith("--scope="));
const scopeIndex = process.argv.indexOf("--scope");
const scope = scopeArg?.split("=")[1] ?? (scopeIndex >= 0 ? process.argv[scopeIndex + 1] : undefined) ?? "all";
const scopes = new Set(scope === "all" ? ["contracts", "workspaces", "components", "patterns", "sf", "docs", "offline", "build"] : [scope]);

const frameworks = [
  { id: "react", name: "@uifn/example-react-workbench", dir: "uifn/examples/react-workbench", port: 6111 },
  { id: "svelte", name: "@uifn/example-svelte-workbench", dir: "uifn/examples/svelte-workbench", port: 6112 },
  { id: "solid", name: "@uifn/example-solid-workbench", dir: "uifn/examples/solid-workbench", port: 6114 },
];

const result = {
  ok: true,
  command: "verify:uifn-examples",
  schemaVersion: 1,
  scope,
  checks: [],
  counts: {
    frameworks: frameworks.length,
    components: 0,
    scenarios: 0,
    patterns: 0,
    sfPanels: 0,
    routes: 0,
  },
  failures: [],
};

function fail(code, message, evidence = {}) {
  result.ok = false;
  result.failures.push({ code, message, evidence });
}

function pass(id, evidence = {}) {
  result.checks.push({ id, status: "passed", evidence });
}

function readJson(relPath) {
  return JSON.parse(readFileSync(path.join(rootDir, relPath), "utf8"));
}

function readText(relPath) {
  return readFileSync(path.join(rootDir, relPath), "utf8");
}

function run(command, args, checkId) {
  const child = spawnSync(command, args, {
    cwd: rootDir,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      PATH: `/opt/homebrew/opt/node@22/bin:/opt/homebrew/bin:${process.env.PATH ?? ""}`,
    },
  });
  if (child.status !== 0) {
    fail("UIFN_EXAMPLES_COMMAND_FAILED", `${command} ${args.join(" ")} failed`, {
      checkId,
      status: child.status,
      stderr: child.stderr.trim().split("\n").slice(-8),
      stdout: child.stdout.trim().split("\n").slice(-8),
    });
  } else {
    pass(checkId, { command: `${command} ${args.join(" ")}` });
  }
  return child;
}

function listFiles(startDir, accumulator = []) {
  for (const entry of readdirSync(startDir)) {
    if (["node_modules", "dist", ".vite", ".svelte-kit"].includes(entry)) continue;
    const fullPath = path.join(startDir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) listFiles(fullPath, accumulator);
    else accumulator.push(fullPath);
  }
  return accumulator;
}

function workspaceManifest(relPath) {
  return readJson(path.join(relPath, "package.json"));
}

async function loadShared() {
  for (const workspace of [
    "@uifn/tokens",
    "@uifn/theme",
    "@uifn/recipes",
    "@uifn/components",
    "@uifn/patterns",
    "@uifn/sf",
  ]) {
    run("npm", ["--workspace", workspace, "run", "build"], `build:${workspace}`);
  }
  run("npm", ["--workspace", "@uifn/examples-shared", "run", "build"], "build:examples-shared");
  return await import(path.join(rootDir, "uifn/examples/shared/dist/index.js"));
}

const shared = await loadShared();
result.counts = {
  frameworks: shared.workbenchFrameworks.length,
  components: shared.workbenchComponents.length,
  scenarios: shared.workbenchScenarios.length,
  patterns: shared.workbenchPatterns.length,
  sfPanels: shared.workbenchSfPanels.length,
  routes: shared.workbenchRoutes.length,
};

if (scopes.has("contracts")) {
  if (shared.workbenchComponents.length !== 69) fail("UIFN_EXAMPLES_COMPONENT_COUNT", "component inventory must contain 69 components", { actual: shared.workbenchComponents.length });
  if (!shared.workbenchScenarios.length) fail("UIFN_WORKBENCH_SCENARIO_MISSING", "at least one product scenario is required");
  if (shared.workbenchPatterns.length !== 14) fail("UIFN_EXAMPLES_PATTERN_COUNT", "pattern inventory must contain 14 patterns", { actual: shared.workbenchPatterns.length });
  if (shared.workbenchSfPanels.length !== 14) fail("UIFN_EXAMPLES_SF_COUNT", "SF inventory must contain 14 panels", { actual: shared.workbenchSfPanels.length });
  const knownSlugsByFamily = {
    component: new Set([
      ...shared.workbenchComponents.map((component) => component.slug),
      ...shared.primitiveOverlayContracts.map((contract) => contract.slug),
    ]),
    pattern: new Set(shared.workbenchPatterns.map((pattern) => pattern.slug)),
    sf: new Set(shared.workbenchSfPanels.map((panel) => panel.slug)),
  };
  const routeIds = new Set();
  const routePaths = new Set();
  for (const route of shared.workbenchRoutes) {
    if (routeIds.has(route.id)) fail("UIFN_WORKBENCH_ROUTE_DRIFT", `duplicate route id ${route.id}`, { route });
    if (routePaths.has(route.path)) fail("UIFN_WORKBENCH_ROUTE_DRIFT", `duplicate route path ${route.path}`, { route });
    routeIds.add(route.id);
    routePaths.add(route.path);
  }
  for (const contract of shared.allQaContracts) {
    const failures = shared.validateQaContract(contract, { knownSlugsByFamily });
    if (failures.length) fail("UIFN_QA_CONTRACT_INVALID", `invalid contract ${contract.slug}`, { failures });
  }
  const recognizedActions = new Set([
    "hover-root",
    "tab-root",
    "open-overlay",
    "tab-overlay",
    "escape-close",
    "reopen-overlay",
    "outside-click",
    "cycle-focus-forward",
    "cycle-focus-backward",
    "enter-form-value",
    "submit-form",
    "attempt-disabled-input",
    "inspect-invalid-state",
    "exercise-data-rich-workflow",
    "capture-visual",
    "activate-primary-action",
    "tab-through-actions",
    "type-filter",
    "keyboard-select",
  ]);
  for (const contract of shared.allQaContracts) {
    for (const fixture of contract.fixtures) {
      const unknownActions = fixture.actions.filter((action) => !recognizedActions.has(action));
      if (unknownActions.length) {
        fail("UIFN_QA_CONTRACT_ACTION_UNKNOWN", `${contract.slug}/${fixture.id} has unknown executable actions`, { unknownActions });
      }
    }
  }
  const baselineManifest = readJson("uifn/examples/browser-qa/baselines/visual-hashes.json");
  if (baselineManifest.schemaVersion !== 2) {
    fail("UIFN_VISUAL_BASELINE_SCHEMA_INVALID", "visual baseline manifest must use schema version 2", {
      expected: 2,
      actual: baselineManifest.schemaVersion,
    });
  }
  const viewportDimensions = ["390x844", "768x1024", "1280x900"];
  const missingVisualBaselines = [];
  const canonicalVisualTargets = shared.allQaContracts.map((contract) => {
    const fixture = contract.family === "component"
      ? contract.fixtures.find((entry) => entry.id === "themes") ?? contract.fixtures.find((entry) => entry.id === "default")
      : contract.fixtures.find((entry) => entry.id === "success");
    return fixture
      ? { family: contract.family, slug: contract.slug, route: fixture.route, state: fixture.id }
      : { family: contract.family, slug: contract.slug, route: undefined, state: "missing-canonical-fixture" };
  }).concat(
    shared.workbenchRoutes
      .filter((route) => route.family === "scenario" && route.slug)
      .map((route) => ({ family: route.family, slug: route.slug, route: route.path, state: "default" }))
  );
  for (const framework of shared.workbenchFrameworks) {
    for (const target of canonicalVisualTargets) {
      if (!target.route) {
        missingVisualBaselines.push(`${framework}|${target.family}|${target.slug}|${target.state}`);
        continue;
      }
      for (const theme of shared.workbenchThemes) {
        for (const viewport of viewportDimensions) {
          const key = `${framework}|${target.family}|${target.slug}|${target.route}|${target.state}|${theme}|${viewport}`;
          if (
            !baselineManifest.hashes?.[key] ||
            !Array.isArray(baselineManifest.robustHashes?.[key]) ||
            baselineManifest.robustHashes[key].length !== 4
          ) {
            missingVisualBaselines.push(key);
          }
        }
      }
    }
  }
  if (missingVisualBaselines.length) {
    fail("UIFN_VISUAL_BASELINE_MISSING", "canonical Workbench visual matrix is missing checked-in baselines", {
      expected: shared.workbenchFrameworks.length * canonicalVisualTargets.length * shared.workbenchThemes.length * viewportDimensions.length,
      actual: {
        exact: Object.keys(baselineManifest.hashes ?? {}).length,
        threshold: Object.keys(baselineManifest.robustHashes ?? {}).length,
      },
      missing: missingVisualBaselines.slice(0, 20),
      missingCount: missingVisualBaselines.length,
    });
  }
  for (const component of shared.workbenchComponents) {
    for (const profile of component.profiles) {
      const profileRoutes = shared.getQaRoutesByProfile(profile).filter((route) => route.slug === component.slug);
      if (!profileRoutes.length) {
        fail("UIFN_WORKBENCH_PROFILE_ROUTE_MISSING", `${component.slug} is missing ${profile} route coverage`, {
          slug: component.slug,
          profile,
          profiles: component.profiles,
        });
      }
    }
  }
  const uncoveredScenarioComponents = shared.getUncoveredScenarioComponents();
  if (uncoveredScenarioComponents.length) {
    fail("UIFN_WORKBENCH_SCENARIO_COMPONENT_MISSING", "product scenarios must cover every component", { uncoveredScenarioComponents });
  }
  const componentSlugs = new Set(shared.workbenchComponents.map((component) => component.slug));
  const patternSlugs = new Set(shared.workbenchPatterns.map((pattern) => pattern.slug));
  const sfSlugs = new Set(shared.workbenchSfPanels.map((panel) => panel.slug));
  for (const scenario of shared.workbenchScenarios) {
    if (!shared.workbenchRoutes.some((route) => route.path === `/scenarios/${scenario.slug}`)) {
      fail("UIFN_WORKBENCH_SCENARIO_ROUTE_MISSING", `missing scenario route /scenarios/${scenario.slug}`, { scenario: scenario.slug });
    }
    for (const slug of scenario.componentSlugs) {
      if (!componentSlugs.has(slug)) fail("UIFN_WORKBENCH_SCENARIO_COMPONENT_UNKNOWN", `${scenario.slug} references unknown component ${slug}`);
      if (!shared.workbenchRoutes.some((route) => route.path === `/components/${slug}/qa`)) {
        fail("UIFN_WORKBENCH_SCENARIO_QA_LINK_MISSING", `${scenario.slug} uses ${slug} without a QA route link`);
      }
    }
    for (const slug of scenario.patternSlugs) {
      if (!patternSlugs.has(slug)) fail("UIFN_WORKBENCH_SCENARIO_PATTERN_UNKNOWN", `${scenario.slug} references unknown pattern ${slug}`);
    }
    for (const slug of scenario.sfPanelSlugs) {
      if (!sfSlugs.has(slug)) fail("UIFN_WORKBENCH_SCENARIO_SF_UNKNOWN", `${scenario.slug} references unknown SF panel ${slug}`);
    }
  }
  pass("contracts", {
    contractCount: shared.allQaContracts.length,
    componentCount: shared.workbenchComponents.length,
    scenarioCount: shared.workbenchScenarios.length,
    patternCount: shared.workbenchPatterns.length,
    sfPanelCount: shared.workbenchSfPanels.length,
  });
}

if (scopes.has("workspaces")) {
  const rootPackage = readJson("package.json");
  if (!rootPackage.workspaces.includes("uifn/examples/*")) {
    fail("UIFN_EXAMPLES_WORKSPACE_GLOB", "root package.json must include uifn/examples/*");
  }
  const hub = workspaceManifest("uifn/examples");
  for (const scriptName of ["dev:react", "dev:svelte", "dev:solid", "build", "verify"]) {
    if (!hub.scripts?.[scriptName]) fail("UIFN_EXAMPLES_HUB_SCRIPT", `missing hub script ${scriptName}`);
  }
  for (const framework of frameworks) {
    const manifest = workspaceManifest(framework.dir);
    if (manifest.name !== framework.name) fail("UIFN_EXAMPLES_MANIFEST_NAME", `manifest name mismatch for ${framework.id}`, { expected: framework.name, actual: manifest.name });
    if (manifest.private !== true) fail("UIFN_EXAMPLES_PUBLIC_WORKSPACE", `${framework.name} must be private`);
    for (const scriptName of ["dev", "build", "preview", "browser-test"]) {
      if (!manifest.scripts?.[scriptName]) fail("UIFN_EXAMPLES_APP_SCRIPT", `${framework.name} missing ${scriptName}`);
    }
    if (!manifest.scripts.dev.includes(`--port ${framework.port}`) || !manifest.scripts.preview.includes(`--port ${framework.port}`)) {
      fail("UIFN_EXAMPLES_PORT_DRIFT", `${framework.name} must use fixed port ${framework.port}`);
    }
  }
  pass("workspaces", { frameworks: frameworks.map((framework) => framework.name) });
}

if (scopes.has("components")) {
  const registrySlugs = readdirSync(path.join(rootDir, "uifn/components/registry/components"))
    .filter((entry) => entry.endsWith(".json"))
    .map((entry) => entry.replace(/\.json$/, ""))
    .sort();
  if (JSON.stringify(registrySlugs) !== JSON.stringify([...shared.workbenchComponentSlugs].sort())) {
    fail("UIFN_EXAMPLES_COMPONENT_DRIFT", "Workbench component inventory drifted from registry", {
      registrySlugs,
      workbenchSlugs: shared.workbenchComponentSlugs,
    });
  }
  for (const slug of registrySlugs) {
    for (const required of [`/components/${slug}`, `/components/${slug}/states`, `/components/${slug}/qa`]) {
      if (!shared.workbenchRoutes.some((route) => route.path === required)) {
        fail("UIFN_WORKBENCH_COMPONENT_ROUTE_MISSING", `missing component route ${required}`, { slug });
      }
    }
    if (!shared.workbenchRoutes.some((route) => route.path === `/components/${slug}/qa/default`)) {
      fail("UIFN_WORKBENCH_COMPONENT_ROUTE_MISSING", `missing product-like QA fixture route /components/${slug}/qa/default`, { slug });
    }
  }
  pass("components", { registryComponentCount: registrySlugs.length });
}

if (scopes.has("patterns")) {
  const storyCount = readdirSync(path.join(rootDir, "uifn/patterns/stories")).filter((entry) => entry.endsWith(".json")).length;
  if (storyCount !== shared.workbenchPatterns.length) fail("UIFN_EXAMPLES_PATTERN_DRIFT", "pattern inventory drifted from stories", { storyCount, workbenchCount: shared.workbenchPatterns.length });
  pass("patterns", { patternCount: storyCount });
}

if (scopes.has("sf")) {
  const storyCount = readdirSync(path.join(rootDir, "uifn/sf/stories")).filter((entry) => entry.endsWith(".json")).length;
  if (storyCount !== shared.workbenchSfPanels.length) fail("UIFN_EXAMPLES_SF_DRIFT", "SF inventory drifted from stories", { storyCount, workbenchCount: shared.workbenchSfPanels.length });
  pass("sf", { sfPanelCount: storyCount });
}

if (scopes.has("docs")) {
  const docChecks = [
    ["uifn/README.md", ["examples/README.md", "verify:uifn-workbench"]],
    ["uifn/react/README.md", ["react-workbench"]],
    ["uifn/svelte/README.md", ["svelte-workbench"]],
    ["uifn/solid/README.md", ["solid-workbench"]],
    ["uifn/examples/README.md", ["verify:uifn-browser", "verify:uifn-overlays", "6111", "6112", "6114", "/scenarios"]],
  ];
  for (const [docPath, needles] of docChecks) {
    const source = existsSync(path.join(rootDir, docPath)) ? readText(docPath) : "";
    for (const needle of needles) {
      if (!source.includes(needle)) fail("UIFN_EXAMPLES_DOC_LINK", `${docPath} missing ${needle}`);
    }
  }
  pass("docs", { docs: docChecks.map(([docPath]) => docPath) });
}

if (scopes.has("offline")) {
  const files = listFiles(path.join(rootDir, "uifn/examples"))
    .filter((filePath) => [".ts", ".tsx", ".js", ".mjs", ".svelte", ".md", ".json", ".html", ".css"].includes(path.extname(filePath)));
  const forbiddenPatterns = [
    { code: "UIFN_EXAMPLES_FETCH", pattern: /fetch\s*\(/ },
    { code: "UIFN_EXAMPLES_XHR", pattern: /XMLHttpRequest/ },
    { code: "UIFN_EXAMPLES_WS", pattern: /WebSocket\s*\(/ },
    { code: "UIFN_EXAMPLES_BEACON", pattern: /sendBeacon/ },
    { code: "UIFN_EXAMPLES_ENV", pattern: /(?:^|[/'"`])\.env(?:[.'"`/\s]|$)/m },
    { code: "UIFN_EXAMPLES_LOCAL_PATH", pattern: /\/Users\/|\/home\/|[A-Za-z]:\\/ },
    { code: "UIFN_EXAMPLES_SECRET", pattern: /(sk_live|ghp_|xox[baprs]-|AKIA[0-9A-Z]{16})/ },
  ];
  for (const filePath of files) {
    const rel = path.relative(rootDir, filePath);
    const source = readFileSync(filePath, "utf8");
    for (const forbidden of forbiddenPatterns) {
      const scannableSource = forbidden.code === "UIFN_EXAMPLES_SECRET"
        ? source.split("\n").filter((line) => !line.includes("REDACTED")).join("\n")
        : source;
      if (forbidden.pattern.test(scannableSource)) {
        fail(forbidden.code, `offline/security forbidden marker in ${rel}`);
      }
    }
  }
  pass("offline", { scannedFiles: files.length });
}

if (scopes.has("build")) {
  for (const framework of frameworks) {
    run("npm", ["--workspace", framework.name, "run", "build"], `build:${framework.id}`);
  }
}

if (!result.ok) {
  console.error(JSON.stringify(result, null, 2));
  process.exit(1);
}

console.log(JSON.stringify(result, null, 2));
