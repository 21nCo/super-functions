import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import process from "node:process";
import { createHash } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import axe from "axe-core";
import { chromium, firefox, webkit } from "playwright";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const stageRoot = path.join(repoRoot, "uifn", "catalogs", "dist");
const canonicalCatalog = JSON.parse(
  fs.readFileSync(path.join(repoRoot, "uifn", "catalog", "generated", "catalog.json"), "utf8")
);
const evidenceLabel = process.env.UIFN_CATALOG_EVIDENCE_LABEL ?? "catalog-sites";
const evidenceRoot = path.join(repoRoot, "uifn", ".conduct", "evidence", evidenceLabel);
const port = Number(process.env.UIFN_CATALOG_VERIFY_PORT ?? 6310);
const navigationTimeout = Number(process.env.UIFN_CATALOG_NAVIGATION_TIMEOUT ?? 30000);
const browserName = process.env.UIFN_CATALOG_BROWSER ?? "chromium";
const browserTypes = { chromium, firefox, webkit };
const browserType = browserTypes[browserName];
if (!browserType) throw new Error(`Unsupported UIFN_CATALOG_BROWSER: ${browserName}`);
const remoteBaseUrl = process.env.UIFN_CATALOG_BASE_URL?.replace(/\/+$/, "");
const baseUrl = remoteBaseUrl ?? `http://127.0.0.1:${port}`;
const catalogFrameworks = ["react", "svelte", "solid"];
const frameworks = process.env.UIFN_CATALOG_FRAMEWORKS
  ? process.env.UIFN_CATALOG_FRAMEWORKS.split(",").map((item) => item.trim()).filter((item) => catalogFrameworks.includes(item))
  : catalogFrameworks;
const catalogComponentSlugs = canonicalCatalog.primitives.map((primitive) => primitive.id);
const canonicalPrimitiveBySlug = new Map(
  canonicalCatalog.primitives.map((primitive) => [primitive.id, primitive])
);
const componentSlugs = process.env.UIFN_CATALOG_COMPONENTS
  ? process.env.UIFN_CATALOG_COMPONENTS.split(",").map((item) => item.trim()).filter((item) => catalogComponentSlugs.includes(item))
  : catalogComponentSlugs;
const checks = [];
const findings = [];
const navigationRetries = [];

if (!process.argv.includes("--skip-build")) {
  const { spawnSync } = await import("node:child_process");
  const result = spawnSync(process.execPath, [path.join(repoRoot, "scripts", "build-uifn-catalogs.mjs")], {
    cwd: repoRoot,
    stdio: "inherit",
    env: {
      ...process.env,
      PATH: `${path.dirname(process.execPath)}:${process.env.PATH ?? ""}`,
    },
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const stagedManifest = JSON.parse(
  fs.readFileSync(path.join(stageRoot, "catalog-manifest.json"), "utf8")
);
const expectedWorkerBuildHash = createHash("sha256")
  .update(fs.readFileSync(path.join(repoRoot, "uifn", "catalogs", "worker.ts")))
  .digest("hex");
const styledCatalogModule = await import(pathToFileURL(
  path.join(repoRoot, "uifn", "components", "dist", "index.mjs")
).href);
const styledComponentBySlug = new Map(
  styledCatalogModule.STYLED_COMPONENT_CATALOG.map((component) => [component.id, component])
);

fs.rmSync(evidenceRoot, { recursive: true, force: true });
fs.mkdirSync(evidenceRoot, { recursive: true });

const server = remoteBaseUrl
  ? undefined
  : http.createServer((request, response) => {
      const requestUrl = new URL(request.url ?? "/", baseUrl);
      let pathname = decodeURIComponent(requestUrl.pathname);
      if (pathname === "/") pathname = "/components/index.html";
      if (pathname === "/components" || catalogFrameworks.some((framework) => pathname === `/components/${framework}`)) {
        response.statusCode = 308;
        response.setHeader("location", `${requestUrl.pathname}/`);
        response.end();
        return;
      }

      let filePath = path.join(stageRoot, pathname.replace(/^\/+/, ""));
      if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
        filePath = path.join(filePath, "index.html");
      }
      if (!fs.existsSync(filePath)) {
        const framework = catalogFrameworks.find((id) => pathname.startsWith(`/components/${id}/`));
        if (framework) {
          response.statusCode = 404;
          response.setHeader("content-type", "text/html; charset=utf-8");
          response.end(fs.readFileSync(path.join(stageRoot, "components", "404.html")));
          return;
        }
      }
      if (!fs.existsSync(filePath)) {
        response.statusCode = 404;
        response.end("Not found");
        return;
      }

      response.statusCode = 200;
      response.setHeader("content-type", contentType(filePath));
      response.end(fs.readFileSync(filePath));
    });

if (server) {
  await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
}

await verifyStaticDelivery(baseUrl);

const browser = await browserType.launch(browserName === "chromium" ? {
  headless: true,
  args: ["--disable-gpu", "--disable-gpu-compositing"],
} : { headless: true });
try {
  const landingPage = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const landingErrors = [];
  landingPage.on("console", (message) => {
    if (message.type() === "error") landingErrors.push(message.text());
  });
  landingPage.on("pageerror", (error) => landingErrors.push(error.message));
  const landingResponse = await gotoWithTransientNetworkRetry(landingPage, `${baseUrl}/components/`, {
    waitUntil: "domcontentloaded",
    timeout: navigationTimeout,
  });
  await waitForVisualSettle(landingPage);
  const landingBody = (await landingPage.locator("body").innerText().catch(() => "")).trim();
  const frameworkLinkCount = await landingPage.locator('a.card[href^="/components/"]').count();
  if (frameworkLinkCount !== catalogFrameworks.length || landingErrors.length) {
    findings.push({
      severity: "high",
      framework: "all",
      route: "/components/",
      code: "UIFN_CATALOG_LANDING_INVALID",
      evidence: {
        frameworkLinkCount,
        consoleErrors: landingErrors.slice(0, 8),
      },
    });
  }
  checks.push({
    framework: "all",
    route: "/components/",
    status: landingResponse?.ok() && frameworkLinkCount === catalogFrameworks.length && landingErrors.length === 0
      ? "passed"
      : "failed",
    statusCode: landingResponse?.status(),
    title: await landingPage.title(),
    bodyLength: landingBody.length,
    componentCount: 0,
    consoleErrorCount: landingErrors.length,
  });
  await landingPage.screenshot({
    path: path.join(evidenceRoot, "landing.png"),
    fullPage: false,
  });
  await landingPage.close();

  for (const framework of frameworks) {
    let frameworkAvailable = true;
    const routes = [
      { id: "home", path: `/components/${framework}/` },
      { id: "guide-getting-started", path: `/components/${framework}/getting-started`, guide: "getting-started" },
      { id: "guide-styling", path: `/components/${framework}/styling`, guide: "styling" },
      { id: "guide-accessibility", path: `/components/${framework}/accessibility`, guide: "accessibility" },
      { id: "guide-registry", path: `/components/${framework}/registry`, guide: "registry" },
      ...componentSlugs.map((slug) => ({
        id: slug,
        path: `/components/${framework}/components/${slug}`,
      })),
      ...(componentSlugs.includes("dialog") ? [{
        id: "dialog-trailing-slash",
        componentId: "dialog",
        expectedTitle: "Dialog",
        path: `/components/${framework}/components/dialog/`,
      }] : []),
      { id: "accordion-qa", path: `/components/${framework}/components/accordion/qa` },
      { id: "hook", path: `/components/${framework}/hooks/use-media-query` },
      { id: "pattern", path: `/components/${framework}/patterns/auth-panel` },
      { id: "sf", path: `/components/${framework}/sf/authfn-auth-panel` },
    ];

    for (const route of routes) {
      const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
      const errors = [];
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text());
      });
      page.on("pageerror", (error) => errors.push(error.message));

      let response;
      try {
        response = await gotoWithTransientNetworkRetry(page, `${baseUrl}${route.path}`, {
          waitUntil: "commit",
          timeout: navigationTimeout,
        });
      } catch (error) {
        const bodyText = (await page.locator("body").innerText().catch(() => "")).trim();
        findings.push({
          severity: "high",
          framework,
          route: route.path,
          code: "UIFN_CATALOG_NAVIGATION_FAILED",
          evidence: {
            message: error instanceof Error ? error.message : String(error),
            consoleErrors: errors.slice(0, 12),
            bodyText: bodyText.slice(0, 500),
          },
        });
        checks.push({
          framework,
          route: route.path,
          status: "failed",
          title: "",
          bodyLength: bodyText.length,
          componentCount: 0,
          consoleErrorCount: errors.length,
        });
        await page.screenshot({
          path: path.join(evidenceRoot, `${framework}-${route.id}-navigation-failed.png`),
          fullPage: false,
        }).catch(() => {});
        if (route.id === "home") frameworkAvailable = false;
        await page.close();
        if (!frameworkAvailable) break;
        continue;
      }
      try {
        await page.waitForSelector(`[data-uifn-workbench="${framework}"][data-uifn-loaded="true"]`, { timeout: 15000 });
        await page.waitForSelector("#route-title", { timeout: 15000 });
        await waitForVisualSettle(page);
      } catch (error) {
        const bodyText = (await page.locator("body").innerText().catch(() => "")).trim();
        findings.push({
          severity: "high",
          framework,
          route: route.path,
          code: "UIFN_CATALOG_SHELL_NOT_LOADED",
          evidence: {
            message: error instanceof Error ? error.message : String(error),
            consoleErrors: errors.slice(0, 12),
            bodyText: bodyText.slice(0, 500),
          },
        });
        checks.push({
          framework,
          route: route.path,
          status: "failed",
          statusCode: response?.status(),
          title: "",
          bodyLength: bodyText.length,
          componentCount: 0,
          consoleErrorCount: errors.length,
        });
        await page.screenshot({
          path: path.join(evidenceRoot, `${framework}-${route.id}-failed.png`),
          fullPage: false,
        }).catch(() => {});
        if (route.id === "home") frameworkAvailable = false;
        await page.close();
        if (!frameworkAvailable) break;
        continue;
      }
      const title = (await page.locator("#route-title").textContent())?.trim() ?? "";
      const documentTitle = await page.title();
      const expectedDocumentTitle = `${title} – uifn ${framework[0].toUpperCase()}${framework.slice(1)}`;
      const documentTitleMatches = documentTitle === expectedDocumentTitle;
      const bodyText = (await page.locator("body").innerText()).trim();
      const componentCount = await page.locator("[data-uifn-component]").count();
      const catalogCardCount = await page.locator("[data-catalog-component-card]").count();
      const componentDetailsCount = await page.locator("[data-catalog-component-details]").count();
      const shell = {
        sidebarCount: await page.locator("[data-catalog-sidebar]").count(),
        componentNavCount: await page.locator("[data-catalog-sidebar] .catalog-component-nav a").count(),
        topbarCount: await page.locator("[data-catalog-topbar]").count(),
        searchCount: await page.locator("[data-catalog-search-dialog]").count(),
        themeToggleCount: await page.locator("[data-catalog-theme-toggle]").count(),
        desktopNavButtonVisible: await page.locator("[data-catalog-nav-open]").isVisible().catch(() => false),
      };
      const shellComplete = shell.sidebarCount === 1 &&
        shell.componentNavCount === canonicalCatalog.primitiveCount &&
        shell.topbarCount === 1 &&
        shell.searchCount === 1 &&
        shell.themeToggleCount === 1 &&
        shell.desktopNavButtonVisible === false;
      const guide = route.guide ? {
        count: await page.locator(`[data-catalog-guide="${route.guide}"]`).count(),
        sectionCount: await page.locator(`[data-catalog-guide="${route.guide}"] section`).count(),
        headingCount: await page.locator(`[data-catalog-guide="${route.guide}"] h2`).count(),
      } : null;
      const guideComplete = !guide || (
        guide.count === 1 &&
        guide.sectionCount >= 2 &&
        guide.headingCount >= 2
      );
      const componentId = route.componentId ?? route.id;
      const isPublicComponentRoute = componentSlugs.includes(componentId);
      const titleMatches = !route.expectedTitle || title === route.expectedTitle;
      const documentation = isPublicComponentRoute ? {
        installation: await page.locator("[data-catalog-doc-installation]").count(),
        usage: await page.locator("[data-catalog-doc-usage]").count(),
        api: await page.locator("[data-catalog-doc-api]").count(),
        accessibility: await page.locator("[data-catalog-doc-accessibility]").count(),
        examples: await page.locator("[data-catalog-doc-examples]").count(),
        installTabs: await page.locator("[data-catalog-install]").count(),
        previewTabs: await page.locator("[data-catalog-demo-tabs]").count(),
        snippetSource: await page.locator("[data-catalog-snippet-source]").count(),
        pagination: await page.locator(".catalog-pagination").count(),
        propRows: await page.locator(".catalog-api-table tbody tr").count(),
        propNames: await page.locator("[data-catalog-prop]").evaluateAll((rows) => (
          rows.map((row) => row.getAttribute("data-catalog-prop")).filter(Boolean)
        )),
        anatomyParts: await page.locator("[data-catalog-anatomy-part]").count(),
        accessibilityText: (await page.locator("[data-catalog-doc-accessibility]").innerText().catch(() => "")).trim(),
        usageCode: (await page.locator("[data-catalog-doc-usage] pre code").innerText().catch(() => "")).trim(),
      } : null;
      const expectedPrimitive = isPublicComponentRoute
        ? canonicalPrimitiveBySlug.get(componentId)
        : null;
      const expectedStyledComponent = isPublicComponentRoute
        ? styledComponentBySlug.get(componentId)
        : null;
      const documentationComplete = !documentation || Boolean(expectedPrimitive && expectedStyledComponent && (
        documentation.installation === 1 &&
        documentation.usage === 1 &&
        documentation.api === 1 &&
        documentation.accessibility === 1 &&
        documentation.examples === 1 &&
        documentation.installTabs === 1 &&
        documentation.previewTabs === 1 &&
        documentation.snippetSource === 1 &&
        documentation.pagination === 1 &&
        documentation.propRows >= expectedPrimitive.inputs.length + 2 &&
        expectedPrimitive.inputs.every((input) => documentation.propNames.includes(input.name)) &&
        documentation.anatomyParts === expectedPrimitive.anatomy.length &&
        documentation.accessibilityText.includes(expectedPrimitive.accessibility.rules.nativeSemantics) &&
        expectedPrimitive.accessibility.rules.keyboard.keys.every((key) => documentation.accessibilityText.includes(key)) &&
        expectedPrimitive.accessibility.rules.wcag.every((criterion) => documentation.accessibilityText.includes(criterion)) &&
        documentation.usageCode.includes(`@uifn/components-${framework}/${componentId}`) &&
        [
          expectedStyledComponent.demo.root.exportName,
          ...expectedStyledComponent.demo.parts.map((part) => part.exportName),
        ].every((exportName) => documentation.usageCode.includes(exportName))
      ));
      const composition = isPublicComponentRoute
        ? await verifyComponentComposition(page, componentId)
        : null;
      const visualQuality = isPublicComponentRoute
        ? await verifyVisualQuality(
            page,
            componentId,
            path.join(evidenceRoot, `${framework}-${route.id}-open.png`),
          )
        : null;
      let responsive = null;
      if (isPublicComponentRoute) {
        await waitForPostInteractionPaint(page);
        await page.screenshot({
          path: path.join(evidenceRoot, `${framework}-${route.id}.png`),
          fullPage: false,
        });
        await page.setViewportSize({ width: 390, height: 844 });
        await waitForPostInteractionPaint(page);
        responsive = await verifyResponsiveLayout(page, componentId);
        await page.screenshot({
          path: path.join(evidenceRoot, `${framework}-${route.id}-mobile.png`),
          fullPage: false,
        });
        await page.setViewportSize({ width: 1440, height: 1000 });
        await waitForPostInteractionPaint(page);
      }
      if (componentId === "color-picker") {
        await page.reload({ waitUntil: "domcontentloaded", timeout: navigationTimeout });
        await page.waitForSelector(
          `[data-uifn-workbench="${framework}"][data-uifn-loaded="true"]`,
          { timeout: 15000 },
        );
        await waitForVisualSettle(page);
      }
      const catalogChrome = route.id === "dialog"
        ? await verifyCatalogChromeInteractions(page, framework)
        : null;
      const behavior = await verifyInteractiveBehavior(page, framework, componentId);
      if (componentId === "combobox") {
        await page.reload({ waitUntil: "domcontentloaded", timeout: navigationTimeout });
        await page.waitForSelector(
          `[data-uifn-workbench="${framework}"][data-uifn-loaded="true"]`,
          { timeout: 15000 },
        );
        await waitForVisualSettle(page);
      }
      const openStateVisual = isPublicComponentRoute
        ? await verifyOpenStateVisualQuality(
            page,
            componentId,
            path.join(evidenceRoot, `${framework}-${route.id}-open.png`),
          )
        : null;
      const accessibility = isPublicComponentRoute ? await verifyAccessibility(page) : null;
      const navigationContinuity = route.id === "dialog"
        ? await verifyCatalogNavigationContinuity(page, framework)
        : null;

      if (errors.length) {
        findings.push({
          severity: "medium",
          framework,
          route: route.path,
          code: "UIFN_CATALOG_RUNTIME_CONSOLE_ERROR",
          evidence: errors.slice(0, 8),
        });
      }
      if (!titleMatches) {
        findings.push({
          severity: "high",
          framework,
          route: route.path,
          code: "UIFN_CATALOG_ROUTE_PARITY_FAILED",
          evidence: { expectedTitle: route.expectedTitle, title },
        });
      }
      if (!documentTitleMatches) {
        findings.push({
          severity: "high",
          framework,
          route: route.path,
          code: "UIFN_CATALOG_HYDRATED_TITLE_MISMATCH",
          evidence: { expectedDocumentTitle, documentTitle },
        });
      }
      if (componentId === "button" && componentCount === 0) {
        findings.push({
          severity: "high",
          framework,
          route: route.path,
          code: "UIFN_CATALOG_COMPONENT_ROOT_MISSING",
          evidence: {},
        });
      }
      if (route.id === "home" && catalogCardCount !== canonicalCatalog.primitiveCount) {
        findings.push({
          severity: "high",
          framework,
          route: route.path,
          code: "UIFN_PUBLIC_CATALOG_GALLERY_INCOMPLETE",
          evidence: { catalogCardCount },
        });
      }
      if (!shellComplete) {
        findings.push({
          severity: "high",
          framework,
          route: route.path,
          code: "UIFN_CATALOG_NAVIGATION_INCOMPLETE",
          evidence: shell,
        });
      }
      if (!guideComplete) {
        findings.push({
          severity: "high",
          framework,
          route: route.path,
          code: "UIFN_CATALOG_GUIDE_INCOMPLETE",
          evidence: guide,
        });
      }
      if (isPublicComponentRoute && (componentDetailsCount !== 1 || !documentationComplete)) {
        findings.push({
          severity: "high",
          framework,
          route: route.path,
          code: "UIFN_PUBLIC_COMPONENT_DOCUMENTATION_MISSING",
          evidence: { componentDetailsCount, documentation },
        });
      }
      if (composition && !composition.ok) {
        findings.push({
          severity: "high",
          framework,
          route: route.path,
          code: "UIFN_PUBLIC_COMPONENT_COMPOSITION_INCOMPLETE",
          evidence: composition,
        });
      }
      if (visualQuality && !visualQuality.ok) {
        findings.push({
          severity: "high",
          framework,
          route: route.path,
          code: "UIFN_PUBLIC_COMPONENT_VISUAL_QUALITY_FAILED",
          evidence: visualQuality,
        });
      }
      if (catalogChrome && !catalogChrome.ok) {
        findings.push({
          severity: "high",
          framework,
          route: route.path,
          code: "UIFN_CATALOG_DOCUMENTATION_INTERACTION_FAILED",
          evidence: catalogChrome,
        });
      }
      if (!behavior.ok) {
        findings.push({
          severity: "high",
          framework,
          route: route.path,
          code: "UIFN_PUBLIC_COMPONENT_INTERACTION_FAILED",
          evidence: behavior.evidence,
        });
      }
      if (openStateVisual && !openStateVisual.ok) {
        findings.push({
          severity: "high",
          framework,
          route: route.path,
          code: "UIFN_PUBLIC_COMPONENT_OPEN_STATE_VISUAL_QUALITY_FAILED",
          evidence: openStateVisual,
        });
      }
      if (accessibility && !accessibility.ok) {
        findings.push({
          severity: "high",
          framework,
          route: route.path,
          code: "UIFN_PUBLIC_COMPONENT_ACCESSIBILITY_FAILED",
          evidence: accessibility.violations,
        });
      }
      if (responsive && !responsive.ok) {
        findings.push({
          severity: "high",
          framework,
          route: route.path,
          code: "UIFN_PUBLIC_COMPONENT_RESPONSIVE_FAILED",
          evidence: responsive,
        });
      }
      if (navigationContinuity && !navigationContinuity.ok) {
        findings.push({
          severity: "high",
          framework,
          route: route.path,
          code: "UIFN_CATALOG_CLIENT_NAVIGATION_FAILED",
          evidence: navigationContinuity,
        });
      }

      checks.push({
        framework,
        route: route.path,
        status: response?.ok() && bodyText.length > 0 && title.length > 0 && titleMatches && documentTitleMatches && behavior.ok && shellComplete && guideComplete && documentationComplete && (composition?.ok ?? true) && (visualQuality?.ok ?? true) && (openStateVisual?.ok ?? true) && (catalogChrome?.ok ?? true) && (accessibility?.ok ?? true) && (responsive?.ok ?? true) && (navigationContinuity?.ok ?? true) ? "passed" : "failed",
        statusCode: response?.status(),
        title,
        documentTitle,
        bodyLength: bodyText.length,
        componentCount,
        catalogCardCount,
        componentDetailsCount,
        shell,
        guide,
        documentation,
        composition,
        visualQuality,
        openStateVisual,
        catalogChrome,
        consoleErrorCount: errors.length,
        behavior: behavior.evidence,
        accessibility,
        responsive,
        navigationContinuity,
      });

      if (route.id === "home" || route.id === "hook") {
        await waitForPostInteractionPaint(page);
        await page.screenshot({
          path: path.join(evidenceRoot, `${framework}-${route.id}.png`),
          fullPage: false,
        });
      }
      await page.close();
    }
  }
} finally {
  await browser.close();
  if (server) {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

const failures = checks.filter((check) => check.status === "failed");
const blockingFindings = findings;
const result = {
  ok: failures.length === 0 && blockingFindings.length === 0,
  command: "verify:uifn-catalog-sites",
  browser: browserName,
  baseUrl,
  checks,
  findings,
  blockingFindings,
  failures,
  navigationRetries,
  evidenceRoot,
};

fs.writeFileSync(
  path.join(evidenceRoot, "verification.json"),
  `${JSON.stringify(result, null, 2)}\n`
);
console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exit(1);

async function verifyStaticDelivery(origin) {
  const evidence = {
    manifest: stagedManifest,
    resources: {},
    metadata: {},
    redirects: {},
    notFound: {},
    security: {},
  };
  const problems = [];
  const expectedFrameworks = catalogFrameworks.join(",");
  if (
    stagedManifest.schemaVersion !== 1 ||
    stagedManifest.inventory?.components !== canonicalCatalog.primitiveCount ||
    stagedManifest.frameworks?.map((item) => item.id).join(",") !== expectedFrameworks ||
    stagedManifest.routes?.perFramework < canonicalCatalog.primitiveCount + 4 ||
    stagedManifest.routes?.staticallyAddressable !== stagedManifest.routes?.perFramework * catalogFrameworks.length
  ) {
    problems.push("staged-manifest-does-not-match-canonical-inventory");
  }

  const expectedResources = {
    "/robots.txt": ["User-agent: *", "Sitemap: https://uifn.dev/sitemap.xml"],
    "/sitemap.xml": [
      "https://uifn.dev/components/react/components/dialog",
      "https://uifn.dev/components/svelte/components/dialog",
      "https://uifn.dev/components/solid/components/dialog",
    ],
    "/components/llms.txt": ["# uifn", "## Components", "Full catalog context"],
    "/components/llms-full.txt": [
      "@uifn/core",
      "@uifn/components-react",
      `${canonicalCatalog.primitiveCount} canonical components`,
    ],
  };
  for (const [resourcePath, requiredText] of Object.entries(expectedResources)) {
    const response = await fetch(`${origin}${resourcePath}`);
    const body = await response.text();
    evidence.resources[resourcePath] = {
      status: response.status,
      contentType: response.headers.get("content-type"),
      bodyLength: body.length,
    };
    if (!response.ok || requiredText.some((text) => !body.includes(text))) {
      problems.push(`invalid-resource:${resourcePath}`);
    }
  }

  const ogResponse = await fetch(`${origin}/components/og.png`);
  const ogBytes = await ogResponse.arrayBuffer();
  evidence.resources["/components/og.png"] = {
    status: ogResponse.status,
    contentType: ogResponse.headers.get("content-type"),
    byteLength: ogBytes.byteLength,
  };
  if (
    !ogResponse.ok ||
    !ogResponse.headers.get("content-type")?.startsWith("image/png") ||
    ogBytes.byteLength < 10_000
  ) {
    problems.push("invalid-resource:/components/og.png");
  }

  const manifestResponse = await fetch(`${origin}/catalog-manifest.json`);
  const deliveredManifest = await manifestResponse.json().catch(() => null);
  evidence.resources["/catalog-manifest.json"] = {
    status: manifestResponse.status,
    inventory: deliveredManifest?.inventory,
    routes: deliveredManifest?.routes,
  };
  if (
    !manifestResponse.ok ||
    deliveredManifest?.inventory?.components !== canonicalCatalog.primitiveCount ||
    deliveredManifest?.routes?.staticallyAddressable !== stagedManifest.routes.staticallyAddressable
  ) {
    problems.push("delivered-manifest-invalid");
  }

  for (const framework of catalogFrameworks) {
    const routePath = `/components/${framework}/components/dialog`;
    const response = await fetch(`${origin}${routePath}`);
    const html = await response.text();
    const expectedCanonical = `https://uifn.dev${routePath}`;
    evidence.metadata[framework] = {
      status: response.status,
      hasTitle: html.includes(`<title>Dialog – uifn ${framework[0].toUpperCase()}${framework.slice(1)}</title>`),
      hasCanonical: html.includes(`<link rel="canonical" href="${expectedCanonical}">`),
      hasIndexRobots: html.includes('<meta name="robots" content="index,follow">'),
      hasOpenGraphImage: html.includes('content="https://uifn.dev/components/og.png"'),
      hasJsonLd: html.includes('type="application/ld+json"'),
    };
    if (!response.ok || Object.entries(evidence.metadata[framework])
      .some(([key, value]) => key !== "status" && value !== true)) {
      problems.push(`invalid-route-metadata:${framework}`);
    }

    const qaResponse = await fetch(`${origin}/components/${framework}/components/dialog/qa`);
    const qaHtml = await qaResponse.text();
    if (!qaResponse.ok || !qaHtml.includes('<meta name="robots" content="noindex,follow">')) {
      problems.push(`qa-route-not-noindex:${framework}`);
    }
  }

  if (remoteBaseUrl) {
    const securityResponse = await fetch(`${origin}/components/react/components/dialog`);
    const contentSecurityPolicy = securityResponse.headers.get("content-security-policy") ?? "";
    evidence.security = {
      catalogBuild: securityResponse.headers.get("x-uifn-catalog-build"),
      workerBuildHash: securityResponse.headers.get("x-uifn-catalog-worker"),
      contentSecurityPolicy,
      crossOriginOpenerPolicy: securityResponse.headers.get("cross-origin-opener-policy"),
      permissionsPolicy: securityResponse.headers.get("permissions-policy"),
      referrerPolicy: securityResponse.headers.get("referrer-policy"),
      xContentTypeOptions: securityResponse.headers.get("x-content-type-options"),
      xFrameOptions: securityResponse.headers.get("x-frame-options"),
    };
    if (
      evidence.security.catalogBuild !== stagedManifest.generatedAt ||
      evidence.security.workerBuildHash !== expectedWorkerBuildHash ||
      !contentSecurityPolicy.includes("object-src 'none'") ||
      !contentSecurityPolicy.includes("frame-ancestors 'none'") ||
      evidence.security.crossOriginOpenerPolicy !== "same-origin" ||
      evidence.security.permissionsPolicy !== "camera=(), geolocation=(), microphone=()" ||
      evidence.security.referrerPolicy !== "strict-origin-when-cross-origin" ||
      evidence.security.xContentTypeOptions !== "nosniff" ||
      evidence.security.xFrameOptions !== "DENY"
    ) {
      problems.push("production-security-headers-invalid");
    }
  }

  const slashResponse = await fetch(`${origin}/components`, { redirect: "manual" });
  evidence.redirects.components = {
    status: slashResponse.status,
    location: slashResponse.headers.get("location"),
  };
  if (slashResponse.status !== 308 || !slashResponse.headers.get("location")?.endsWith("/components/")) {
    problems.push("components-slash-redirect-invalid");
  }

  const missingResponse = await fetch(`${origin}/components/react/does-not-exist`);
  const missingBody = await missingResponse.text();
  evidence.notFound = {
    status: missingResponse.status,
    hasNoindex: missingBody.includes('name="robots" content="noindex"'),
    hasRecoveryLink: missingBody.includes('href="/components/"'),
  };
  if (
    missingResponse.status !== 404 ||
    !evidence.notFound.hasNoindex ||
    !evidence.notFound.hasRecoveryLink
  ) {
    problems.push("framework-unknown-route-does-not-return-useful-404");
  }

  checks.push({
    framework: "all",
    route: "delivery-contract",
    status: problems.length === 0 ? "passed" : "failed",
    evidence,
  });
  if (problems.length) {
    findings.push({
      severity: "high",
      framework: "all",
      route: "delivery-contract",
      code: "UIFN_CATALOG_STATIC_DELIVERY_INVALID",
      evidence: { problems, ...evidence },
    });
  }
}

async function verifyCatalogChromeInteractions(page, framework) {
  try {
    const previewTab = page.locator('[data-catalog-demo-tab="preview"]');
    const codeTab = page.locator('[data-catalog-demo-tab="code"]');
    const previewPanel = page.locator('[data-catalog-demo-panel="preview"]');
    const codePanel = page.locator('[data-catalog-demo-panel="code"]');
    await codeTab.click();
    const codeState = {
      codeSelected: await codeTab.getAttribute("aria-selected"),
      previewSelected: await previewTab.getAttribute("aria-selected"),
      codeVisible: await codePanel.isVisible(),
      previewVisible: await previewPanel.isVisible(),
    };
    await previewTab.click();
    const previewState = {
      codeSelected: await codeTab.getAttribute("aria-selected"),
      previewSelected: await previewTab.getAttribute("aria-selected"),
      codeVisible: await codePanel.isVisible(),
      previewVisible: await previewPanel.isVisible(),
    };

    await page.locator('[data-catalog-install-mode="source"]').click();
    await page.locator('[data-catalog-package-manager="pnpm"]').click();
    const sourceCommand = (await page.locator('[data-catalog-install-panel="source"] [data-catalog-install-command]').textContent())?.trim() ?? "";
    const sourcePanelVisible = await page.locator('[data-catalog-install-panel="source"]').isVisible();

    await page.locator("[data-catalog-search-open]").click();
    const searchDialog = page.locator("[data-catalog-search-dialog]");
    const searchInput = page.locator("[data-catalog-global-search]");
    await searchInput.fill("tree view");
    const visibleSearchResults = await page.locator("[data-catalog-search-item]:visible").count();
    const searchResultText = (await page.locator("[data-catalog-search-item]:visible").first().textContent())?.trim() ?? "";
    await page.locator("[data-catalog-search-close]").click();
    const searchClosed = !(await searchDialog.isVisible());

    const shell = page.locator(".workbench-shell");
    const themeBefore = await shell.getAttribute("data-uifn-theme");
    await page.locator("[data-catalog-theme-toggle]").click();
    const themeAfter = await shell.getAttribute("data-uifn-theme");

    const ok = codeState.codeSelected === "true" &&
      codeState.previewSelected === "false" &&
      codeState.codeVisible &&
      !codeState.previewVisible &&
      previewState.codeSelected === "false" &&
      previewState.previewSelected === "true" &&
      !previewState.codeVisible &&
      previewState.previewVisible &&
      sourcePanelVisible &&
      sourceCommand === `pnpm dlx @uifn/registry add dialog --framework ${framework} --cwd .` &&
      visibleSearchResults === 1 &&
      /tree view/i.test(searchResultText) &&
      searchClosed &&
      ["light", "dark"].includes(themeBefore ?? "") &&
      ["light", "dark"].includes(themeAfter ?? "") &&
      themeBefore !== themeAfter;
    return {
      ok,
      codeState,
      previewState,
      sourcePanelVisible,
      sourceCommand,
      visibleSearchResults,
      searchResultText,
      searchClosed,
      themeBefore,
      themeAfter,
    };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

async function verifyComponentComposition(page, routeId) {
  const primitive = canonicalPrimitiveBySlug.get(routeId);
  if (!primitive) {
    return {
      ok: false,
      rootCount: 0,
      compositionMarkerCount: 0,
      missingParts: ["root"],
      unexpectedParts: [],
      missingExports: ["unknown-canonical-primitive"],
      partCounts: {},
    };
  }
  return page.evaluate(({ componentSlug, expectedParts }) => {
    const nodes = Array.from(document.querySelectorAll(
      `[data-uifn-component="${CSS.escape(componentSlug)}"][data-uifn-part]`
    ));
    const partCounts = {};
    for (const node of nodes) {
      const part = node.getAttribute("data-uifn-part");
      if (part) partCounts[part] = (partCounts[part] ?? 0) + 1;
    }
    const expected = new Set(expectedParts);
    const actual = new Set(Object.keys(partCounts));
    const missingParts = expectedParts.filter((part) => !actual.has(part));
    const unexpectedParts = [...actual].filter((part) => !expected.has(part));
    const rootPart = componentSlug === "toast" ? "viewport" : "root";
    const rootCount = partCounts[rootPart] ?? 0;
    const compositionMarkerCount = document.querySelectorAll(
      `[data-uifn-component="${CSS.escape(componentSlug)}"][data-uifn-part="${rootPart}"][data-uifn-catalog-composition="complete"]`
    ).length;
    const missingExports = Array.from(document.querySelectorAll("[data-uifn-demo-missing]"))
      .map((node) => node.getAttribute("data-uifn-demo-missing"))
      .filter(Boolean);
    return {
      ok: rootCount === 1 &&
        missingParts.length === 0 &&
        unexpectedParts.length === 0 &&
        missingExports.length === 0,
      rootCount,
      compositionMarkerCount,
      missingParts,
      unexpectedParts,
      missingExports,
      partCounts,
    };
  }, {
    componentSlug: routeId,
    expectedParts: primitive.anatomy.map((part) => part.id),
  });
}

async function verifyAccessibility(page) {
  await page.addScriptTag({ content: axe.source });
  const violations = await page.evaluate(async () => {
    const result = await window.axe.run(document, {
      resultTypes: ["violations"],
      rules: {
        "color-contrast": { enabled: true },
        "region": { enabled: false },
      },
    });
    return result.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      help: violation.help,
      nodes: violation.nodes.slice(0, 5).map((node) => ({
        target: node.target,
        summary: node.failureSummary,
      })),
    }));
  });
  return { ok: violations.length === 0, violations };
}

async function verifyCatalogNavigationContinuity(page, framework) {
  const startPath = `/components/${framework}/components/dialog`;
  const targetPath = `/components/${framework}/components/tags-input`;
  const marker = `${framework}-${Date.now()}-${Math.random()}`;
  try {
    const before = await page.evaluate((documentMarker) => {
      const sidebar = document.querySelector("[data-catalog-sidebar]");
      const scroll = sidebar?.querySelector(".catalog-sidebar-scroll");
      if (!(sidebar instanceof HTMLElement) || !(scroll instanceof HTMLElement)) {
        return null;
      }
      window.__uifnCatalogDocumentMarker = documentMarker;
      window.__uifnCatalogSidebar = sidebar;
      scroll.scrollTop = Math.min(
        1200,
        Math.max(1, scroll.scrollHeight - scroll.clientHeight),
      );
      return {
        scrollTop: scroll.scrollTop,
        sidebarConnected: sidebar.isConnected,
      };
    }, marker);
    if (!before || before.scrollTop <= 0) {
      return { ok: false, reason: "sidebar-could-not-be-scrolled", before };
    }

    await page.locator(
      `[data-catalog-sidebar] a[href="${targetPath}"]`,
    ).click();
    await page.waitForFunction(
      ({ expectedPath, expectedTitle }) => (
        window.location.pathname === expectedPath &&
        document.querySelector("#route-title")?.textContent?.trim() === expectedTitle
      ),
      { expectedPath: targetPath, expectedTitle: "Tags Input" },
      { timeout: navigationTimeout },
    );
    await waitForPostInteractionPaint(page);

    const target = await page.evaluate(({ documentMarker, expectedPath }) => {
      const sidebar = document.querySelector("[data-catalog-sidebar]");
      const scroll = sidebar?.querySelector(".catalog-sidebar-scroll");
      const active = sidebar?.querySelector(
        `a[href="${expectedPath}"][aria-current="page"]`,
      );
      return {
        sameDocument: window.__uifnCatalogDocumentMarker === documentMarker,
        sameSidebar: window.__uifnCatalogSidebar === sidebar,
        scrollTop: scroll instanceof HTMLElement ? scroll.scrollTop : null,
        activeLink: Boolean(active),
      };
    }, { documentMarker: marker, expectedPath: targetPath });

    await page.evaluate(() => window.history.back());
    await page.waitForFunction(
      (expectedPath) => (
        window.location.pathname === expectedPath &&
        document.querySelector("#route-title")?.textContent?.trim() === "Dialog"
      ),
      startPath,
      { timeout: navigationTimeout },
    );
    const back = await page.evaluate(({ documentMarker, expectedPath }) => {
      const sidebar = document.querySelector("[data-catalog-sidebar]");
      const scroll = sidebar?.querySelector(".catalog-sidebar-scroll");
      return {
        sameDocument: window.__uifnCatalogDocumentMarker === documentMarker,
        sameSidebar: window.__uifnCatalogSidebar === sidebar,
        scrollTop: scroll instanceof HTMLElement ? scroll.scrollTop : null,
        activeLink: Boolean(sidebar?.querySelector(
          `a[href="${expectedPath}"][aria-current="page"]`,
        )),
      };
    }, { documentMarker: marker, expectedPath: startPath });

    await page.evaluate(() => window.history.forward());
    await page.waitForFunction(
      (expectedPath) => (
        window.location.pathname === expectedPath &&
        document.querySelector("#route-title")?.textContent?.trim() === "Tags Input"
      ),
      targetPath,
      { timeout: navigationTimeout },
    );
    const forward = await page.evaluate(({ documentMarker, expectedPath }) => {
      const sidebar = document.querySelector("[data-catalog-sidebar]");
      const scroll = sidebar?.querySelector(".catalog-sidebar-scroll");
      return {
        sameDocument: window.__uifnCatalogDocumentMarker === documentMarker,
        sameSidebar: window.__uifnCatalogSidebar === sidebar,
        scrollTop: scroll instanceof HTMLElement ? scroll.scrollTop : null,
        activeLink: Boolean(sidebar?.querySelector(
          `a[href="${expectedPath}"][aria-current="page"]`,
        )),
      };
    }, { documentMarker: marker, expectedPath: targetPath });

    await page.evaluate(() => window.history.back());
    await page.waitForFunction(
      (expectedPath) => (
        window.location.pathname === expectedPath &&
        document.querySelector("#route-title")?.textContent?.trim() === "Dialog"
      ),
      startPath,
      { timeout: navigationTimeout },
    );

    const states = [target, back, forward];
    const ok = states.every((state) => (
      state.sameDocument &&
      state.sameSidebar &&
      state.scrollTop === before.scrollTop &&
      state.activeLink
    ));
    return {
      ok,
      startPath,
      targetPath,
      before,
      target,
      back,
      forward,
    };
  } catch (error) {
    return {
      ok: false,
      startPath,
      targetPath,
      reason: error instanceof Error ? error.message : String(error),
    };
  } finally {
    await page.evaluate(() => {
      delete window.__uifnCatalogDocumentMarker;
      delete window.__uifnCatalogSidebar;
    }).catch(() => {});
  }
}

async function verifyVisualQuality(page, routeId, openStateScreenshotPath) {
  const generic = await page.evaluate((componentSlug) => {
    const root = document.querySelector(
      `[data-uifn-component="${CSS.escape(componentSlug)}"][data-catalog-preview="true"]`
    ) ?? document.querySelector(
      `[data-uifn-component="${CSS.escape(componentSlug)}"][data-uifn-part="root"]`
    );
    const isVisible = (element) => {
      if (!(element instanceof HTMLElement || element instanceof SVGElement)) return false;
      const style = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      return style.display !== "none" &&
        style.visibility !== "hidden" &&
        Number(style.opacity) > 0 &&
        box.width > 0 &&
        box.height > 0;
    };
    const rootBox = root?.getBoundingClientRect();
    const visibleText = root instanceof HTMLElement ? root.innerText.replace(/\s+/g, " ").trim() : "";
    const placeholderMatches = visibleText.match(
      /\b(?:component content|example label|example title|current value|control example|viewport example|[a-z]+ example)\b/gi
    ) ?? [];
    const visibleParts = root
      ? (root.matches("[data-uifn-part]") && isVisible(root) ? 1 : 0) +
        Array.from(root.querySelectorAll("[data-uifn-part]")).filter(isVisible).length
      : 0;
    const minimumHeight = componentSlug === "separator" ? 1 : 16;
    return {
      ok: Boolean(
        root &&
        rootBox &&
        rootBox.width >= 16 &&
        rootBox.height >= minimumHeight &&
        placeholderMatches.length === 0 &&
        visibleParts > 0
      ),
      rootBox: rootBox
        ? { x: rootBox.x, y: rootBox.y, width: rootBox.width, height: rootBox.height }
        : null,
      visibleText,
      placeholderMatches: [...new Set(placeholderMatches)],
      visibleParts,
    };
  }, routeId);

  let component = { ok: true };
  if (routeId === "angle-slider") {
    component = await page.evaluate(() => {
      const track = document.querySelector('[data-uifn-component="angle-slider"][data-uifn-part="track"]');
      const value = document.querySelector('[data-uifn-component="angle-slider"][data-uifn-part="valueText"]');
      const trackBox = track?.getBoundingClientRect();
      const valueStyle = value ? getComputedStyle(value) : null;
      const pseudoStyle = value ? getComputedStyle(value, "::after") : null;
      return {
        ok: Boolean(
          trackBox &&
          trackBox.width >= 180 &&
          trackBox.height >= 180 &&
          Math.abs(trackBox.width - trackBox.height) <= 2 &&
          Number.parseFloat(valueStyle?.fontSize ?? "1") === 0 &&
          pseudoStyle?.content &&
          pseudoStyle.content !== "none"
        ),
        trackBox: trackBox ? { width: trackBox.width, height: trackBox.height } : null,
        sourceTextFontSize: valueStyle?.fontSize ?? null,
        renderedValue: pseudoStyle?.content ?? null,
      };
    });
  } else if (routeId === "slider") {
    component = await page.evaluate(() => {
      const track = document.querySelector('[data-uifn-component="slider"][data-uifn-part="track"]');
      const thumb = document.querySelector('[data-uifn-component="slider"][data-uifn-part="thumb"]');
      const value = document.querySelector('[data-uifn-component="slider"][data-uifn-part="valueText"]');
      const trackBox = track?.getBoundingClientRect();
      const thumbBox = thumb?.getBoundingClientRect();
      const valueStyle = value ? getComputedStyle(value) : null;
      const pseudoStyle = value ? getComputedStyle(value, "::after") : null;
      return {
        ok: Boolean(
          trackBox &&
          trackBox.width >= 240 &&
          trackBox.height >= 6 &&
          thumbBox &&
          thumbBox.width >= 18 &&
          thumbBox.height >= 18 &&
          valueStyle?.color === "rgba(0, 0, 0, 0)" &&
          pseudoStyle?.content?.includes("%")
        ),
        trackBox: trackBox ? { width: trackBox.width, height: trackBox.height } : null,
        thumbBox: thumbBox ? { width: thumbBox.width, height: thumbBox.height } : null,
        sourceTextColor: valueStyle?.color ?? null,
        renderedValue: pseudoStyle?.content ?? null,
      };
    });
  } else if (routeId === "checkbox") {
    component = await page.evaluate(() => {
      const control = document.querySelector('[data-uifn-component="checkbox"][data-uifn-part="control"]');
      const indicator = document.querySelector('[data-uifn-component="checkbox"][data-uifn-part="indicator"]');
      const label = document.querySelector('[data-uifn-component="checkbox"][data-uifn-part="label"]');
      const controlBox = control?.getBoundingClientRect();
      const indicatorBox = indicator?.getBoundingClientRect();
      const indicatorStyle = indicator ? getComputedStyle(indicator) : null;
      const indicatorMarkStyle = indicator ? getComputedStyle(indicator, "::before") : null;
      const labelBox = label?.getBoundingClientRect();
      const overlap = controlBox && labelBox
        ? Math.max(0, Math.min(controlBox.right, labelBox.right) - Math.max(controlBox.left, labelBox.left)) *
          Math.max(0, Math.min(controlBox.bottom, labelBox.bottom) - Math.max(controlBox.top, labelBox.top))
        : Number.POSITIVE_INFINITY;
      return {
        ok: Boolean(
          controlBox &&
          labelBox &&
          controlBox.width >= 20 &&
          controlBox.height >= 20 &&
          indicatorBox &&
          indicatorBox.width > 0 &&
          indicatorBox.height > 0 &&
          indicatorStyle?.display !== "none" &&
          (
            (indicator?.textContent ?? "").trim().length > 0 ||
            (
              indicatorMarkStyle?.content === '""' &&
              Number.parseFloat(indicatorMarkStyle.width) >= 6 &&
              Number.parseFloat(indicatorMarkStyle.height) >= 2 &&
              (
                indicatorMarkStyle.borderInlineEndStyle === "solid" ||
                indicatorMarkStyle.backgroundColor !== "rgba(0, 0, 0, 0)"
              )
            )
          ) &&
          labelBox.width >= 80 &&
          overlap === 0
        ),
        controlBox: controlBox ? { x: controlBox.x, y: controlBox.y, width: controlBox.width, height: controlBox.height } : null,
        indicator: indicatorBox
          ? {
              width: indicatorBox.width,
              height: indicatorBox.height,
              display: indicatorStyle?.display ?? null,
              color: indicatorStyle?.color ?? null,
              text: (indicator?.textContent ?? "").trim(),
              mark: indicatorMarkStyle
                ? {
                    content: indicatorMarkStyle.content,
                    width: indicatorMarkStyle.width,
                    height: indicatorMarkStyle.height,
                    borderInlineEndStyle: indicatorMarkStyle.borderInlineEndStyle,
                    backgroundColor: indicatorMarkStyle.backgroundColor,
                  }
                : null,
            }
          : null,
        labelBox: labelBox ? { x: labelBox.x, y: labelBox.y, width: labelBox.width, height: labelBox.height } : null,
        overlap,
      };
    });
  } else if (routeId === "switch") {
    component = await page.evaluate(() => {
      const control = document.querySelector('[data-uifn-component="switch"][data-uifn-part="control"]');
      const thumb = document.querySelector('[data-uifn-component="switch"][data-uifn-part="thumb"]');
      const label = document.querySelector('[data-uifn-component="switch"][data-uifn-part="label"]');
      const controlBox = control?.getBoundingClientRect();
      const thumbBox = thumb?.getBoundingClientRect();
      const labelBox = label?.getBoundingClientRect();
      const ratio = controlBox ? controlBox.width / controlBox.height : 0;
      const thumbContained = Boolean(
        controlBox &&
        thumbBox &&
        thumbBox.left >= controlBox.left &&
        thumbBox.top >= controlBox.top &&
        thumbBox.right <= controlBox.right &&
        thumbBox.bottom <= controlBox.bottom
      );
      return {
        ok: Boolean(
          controlBox &&
          controlBox.width >= 42 &&
          controlBox.height >= 22 &&
          controlBox.height <= 26 &&
          ratio >= 1.7 &&
          thumbBox &&
          thumbBox.width >= 17 &&
          thumbBox.height >= 17 &&
          thumbContained &&
          labelBox &&
          labelBox.width >= 100
        ),
        controlBox: controlBox ? { x: controlBox.x, y: controlBox.y, width: controlBox.width, height: controlBox.height } : null,
        thumbBox: thumbBox ? { x: thumbBox.x, y: thumbBox.y, width: thumbBox.width, height: thumbBox.height } : null,
        labelBox: labelBox ? { x: labelBox.x, y: labelBox.y, width: labelBox.width, height: labelBox.height } : null,
        ratio,
        thumbContained,
      };
    });
  } else if (routeId === "timer") {
    component = await page.evaluate(() => {
      const root = document.querySelector('[data-uifn-component="timer"][data-uifn-part="root"]');
      const value = document.querySelector('[data-uifn-component="timer"][data-uifn-part="value"]');
      const controls = document.querySelectorAll(
        '[data-uifn-component="timer"][data-uifn-part="start"], ' +
        '[data-uifn-component="timer"][data-uifn-part="pause"], ' +
        '[data-uifn-component="timer"][data-uifn-part="reset"]',
      );
      const rootBox = root?.getBoundingClientRect();
      const valueBox = value?.getBoundingClientRect();
      const valueStyle = value ? getComputedStyle(value) : null;
      const fontSize = Number.parseFloat(valueStyle?.fontSize ?? "0");
      return {
        ok: Boolean(
          rootBox &&
          rootBox.width >= 300 &&
          valueBox &&
          valueBox.width >= 240 &&
          valueBox.height >= 36 &&
          fontSize >= 32 &&
          controls.length === 3
        ),
        rootBox: rootBox ? { width: rootBox.width, height: rootBox.height } : null,
        valueBox: valueBox ? { width: valueBox.width, height: valueBox.height } : null,
        valueFontSize: fontSize,
        controlCount: controls.length,
      };
    });
  } else if (routeId === "navigation-menu") {
    component = await page.evaluate(() => {
      const list = document.querySelector('[data-uifn-component="navigation-menu"][data-uifn-part="list"]');
      const contents = [...document.querySelectorAll(
        '[data-uifn-component="navigation-menu"][data-uifn-part="content"]',
      )];
      const links = [...document.querySelectorAll(
        '[data-uifn-component="navigation-menu"][data-uifn-part="link"]',
      )];
      const listBox = list?.getBoundingClientRect();
      const linksNestedInContent = links.every((link) => link.closest('[data-uifn-part="content"]'));
      const closedContentHidden = contents.every((content) => (
        content.hasAttribute("hidden") || getComputedStyle(content).display === "none"
      ));
      return {
        ok: Boolean(
          listBox &&
          listBox.width >= 280 &&
          listBox.height <= 64 &&
          contents.length === 3 &&
          links.length === 3 &&
          linksNestedInContent &&
          closedContentHidden
        ),
        listBox: listBox ? { width: listBox.width, height: listBox.height } : null,
        contentCount: contents.length,
        linkCount: links.length,
        linksNestedInContent,
        closedContentHidden,
      };
    });
  } else if (routeId === "image-cropper") {
    await page.waitForFunction(() => (
      document.querySelector('[data-uifn-component="image-cropper"][data-uifn-part="cropArea"]')
        ?.getAttribute("data-state") === "ready"
    ), { timeout: 3000 }).catch(() => {});
    component = await page.evaluate(() => {
      const viewport = document.querySelector('[data-uifn-component="image-cropper"][data-uifn-part="viewport"]');
      const image = document.querySelector('[data-uifn-component="image-cropper"][data-uifn-part="image"]');
      const crop = document.querySelector('[data-uifn-component="image-cropper"][data-uifn-part="cropArea"]');
      const handles = document.querySelectorAll('[data-uifn-component="image-cropper"][data-uifn-part="handle"]');
      const viewportBox = viewport?.getBoundingClientRect();
      const cropBox = crop?.getBoundingClientRect();
      const withinViewport = Boolean(
        viewportBox &&
        cropBox &&
        cropBox.left >= viewportBox.left - 2 &&
        cropBox.top >= viewportBox.top - 2 &&
        cropBox.right <= viewportBox.right + 2 &&
        cropBox.bottom <= viewportBox.bottom + 2
      );
      return {
        ok: Boolean(
          viewportBox &&
          viewportBox.width >= 480 &&
          viewportBox.height >= 280 &&
          image instanceof HTMLImageElement &&
          image.complete &&
          image.naturalWidth >= 640 &&
          crop?.getAttribute("data-state") === "ready" &&
          handles.length === 4 &&
          withinViewport
        ),
        viewportBox: viewportBox ? { width: viewportBox.width, height: viewportBox.height } : null,
        cropBox: cropBox ? { x: cropBox.x, y: cropBox.y, width: cropBox.width, height: cropBox.height } : null,
        image: image instanceof HTMLImageElement
          ? { complete: image.complete, naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight }
          : null,
        state: crop?.getAttribute("data-state") ?? null,
        handleCount: handles.length,
        withinViewport,
      };
    });
  } else if (routeId === "splitter") {
    component = await page.evaluate(() => {
      const root = document.querySelector('[data-uifn-component="splitter"][data-uifn-part="root"]');
      const panels = [...document.querySelectorAll(
        '[data-uifn-component="splitter"][data-uifn-part="panel"]',
      )];
      const trigger = document.querySelector(
        '[data-uifn-component="splitter"][data-uifn-part="resizeTrigger"]',
      );
      const handle = document.querySelector(
        '[data-uifn-component="splitter"][data-uifn-part="resizeHandle"]',
      );
      const rootBox = root?.getBoundingClientRect();
      const panelBoxes = panels.map((panel) => panel.getBoundingClientRect());
      const triggerBox = trigger?.getBoundingClientRect();
      const handleBox = handle?.getBoundingClientRect();
      const ordered = Boolean(
        panelBoxes.length === 2 &&
        triggerBox &&
        panelBoxes[0].right <= triggerBox.left + 1 &&
        triggerBox.right <= panelBoxes[1].left + 1
      );
      const contained = Boolean(
        rootBox &&
        [...panelBoxes, triggerBox].filter(Boolean).every((box) => (
          box.left >= rootBox.left - 1 &&
          box.top >= rootBox.top - 1 &&
          box.right <= rootBox.right + 1 &&
          box.bottom <= rootBox.bottom + 1
        ))
      );
      return {
        ok: Boolean(
          rootBox &&
          rootBox.width >= 480 &&
          rootBox.height >= 180 &&
          panels.length === 2 &&
          panelBoxes.every((box) => box.width >= 160 && box.height >= 170) &&
          triggerBox &&
          triggerBox.width >= 6 &&
          triggerBox.width <= 12 &&
          triggerBox.height >= 170 &&
          handle &&
          ordered &&
          contained &&
          root instanceof HTMLElement &&
          root.scrollWidth <= root.clientWidth + 1
        ),
        rootBox: rootBox ? { width: rootBox.width, height: rootBox.height } : null,
        panelBoxes: panelBoxes.map((box) => ({
          x: box.x,
          y: box.y,
          width: box.width,
          height: box.height,
        })),
        triggerBox: triggerBox
          ? { x: triggerBox.x, y: triggerBox.y, width: triggerBox.width, height: triggerBox.height }
          : null,
        handleBox: handleBox
          ? { x: handleBox.x, y: handleBox.y, width: handleBox.width, height: handleBox.height }
          : null,
        ordered,
        contained,
        scrollWidth: root instanceof HTMLElement ? root.scrollWidth : null,
        clientWidth: root instanceof HTMLElement ? root.clientWidth : null,
      };
    });
  } else if (routeId === "steps") {
    component = await page.evaluate(() => {
      const root = document.querySelector('[data-uifn-component="steps"][data-uifn-part="root"]');
      const list = document.querySelector('[data-uifn-component="steps"][data-uifn-part="list"]');
      const items = [...document.querySelectorAll(
        '[data-uifn-component="steps"][data-uifn-part="item"]',
      )];
      const triggers = [...document.querySelectorAll(
        '[data-uifn-component="steps"][data-uifn-part="trigger"]',
      )];
      const badges = [...document.querySelectorAll(
        '[data-uifn-component="steps"][data-uifn-part="indicator"], ' +
        '[data-uifn-component="steps"][data-uifn-part="completed"]',
      )].filter((element) => {
        const style = getComputedStyle(element);
        const box = element.getBoundingClientRect();
        return style.display !== "none" && box.width > 0 && box.height > 0;
      });
      const separators = [...document.querySelectorAll(
        '[data-uifn-component="steps"][data-uifn-part="separator"]',
      )].filter((element) => {
        const style = getComputedStyle(element);
        const box = element.getBoundingClientRect();
        return style.display !== "none" && box.width > 0 && box.height > 0;
      });
      const visibleContent = [...document.querySelectorAll(
        '[data-uifn-component="steps"][data-uifn-part="content"]',
      )].filter((element) => !element.hasAttribute("hidden") && getComputedStyle(element).display !== "none");
      const rootBox = root?.getBoundingClientRect();
      const listBox = list?.getBoundingClientRect();
      const itemBoxes = items.map((item) => item.getBoundingClientRect());
      const ordered = itemBoxes.every((box, index) => (
        index === 0 || itemBoxes[index - 1].right <= box.left + 1
      ));
      const labels = triggers.map((trigger) => (trigger.textContent ?? "").trim());
      return {
        ok: Boolean(
          rootBox &&
          rootBox.width >= 480 &&
          listBox &&
          listBox.width >= 480 &&
          items.length === 3 &&
          triggers.length === 3 &&
          badges.length === 3 &&
          separators.length === 2 &&
          visibleContent.length === 1 &&
          labels.every((label) => label.length >= 6) &&
          triggers.some((trigger) => trigger.getAttribute("aria-current") === "step") &&
          ordered &&
          root instanceof HTMLElement &&
          root.scrollWidth <= root.clientWidth + 1
        ),
        rootBox: rootBox ? { width: rootBox.width, height: rootBox.height } : null,
        listBox: listBox ? { width: listBox.width, height: listBox.height } : null,
        itemBoxes: itemBoxes.map((box) => ({ x: box.x, y: box.y, width: box.width, height: box.height })),
        triggerCount: triggers.length,
        labels,
        visibleBadgeCount: badges.length,
        visibleSeparatorCount: separators.length,
        visibleContentCount: visibleContent.length,
        ordered,
        scrollWidth: root instanceof HTMLElement ? root.scrollWidth : null,
        clientWidth: root instanceof HTMLElement ? root.clientWidth : null,
      };
    });
  } else if (routeId === "color-picker") {
    const root = page.locator('[data-uifn-component="color-picker"]').first();
    const trigger = root.locator('[data-uifn-part="trigger"]');
    const content = page.locator(
      '[data-uifn-component="color-picker"][data-uifn-part="content"][role="dialog"]'
    ).last();
    await trigger.click();
    await content.waitFor({ state: "visible", timeout: 3000 }).catch(() => {});
    await waitForPostInteractionPaint(page);
    await page.screenshot({ path: openStateScreenshotPath, fullPage: false }).catch(() => {});
    component = await page.evaluate(() => {
      const content = document.querySelector('[data-uifn-component="color-picker"][data-uifn-part="content"]');
      const area = document.querySelector('[data-uifn-component="color-picker"][data-uifn-part="area"]');
      const swatch = document.querySelector('[data-uifn-component="color-picker"][data-uifn-part="swatch"]');
      const channelInputs = document.querySelectorAll('[data-uifn-component="color-picker"][data-uifn-part="channelInput"]');
      const contentBox = content?.getBoundingClientRect();
      const areaBox = area?.getBoundingClientRect();
      const swatchBox = swatch?.getBoundingClientRect();
      return {
        ok: Boolean(
          contentBox &&
          contentBox.width >= 280 &&
          contentBox.height >= 220 &&
          areaBox &&
          areaBox.width >= 220 &&
          areaBox.height >= 140 &&
          swatchBox &&
          swatchBox.width >= 24 &&
          swatchBox.height >= 24 &&
          channelInputs.length >= 1
        ),
        contentBox: contentBox ? { width: contentBox.width, height: contentBox.height } : null,
        areaBox: areaBox ? { width: areaBox.width, height: areaBox.height } : null,
        swatchBox: swatchBox ? { width: swatchBox.width, height: swatchBox.height } : null,
        channelInputCount: channelInputs.length,
      };
    });
    await page.keyboard.press("Escape");
    await content.waitFor({ state: "hidden", timeout: 3000 }).catch(() => {});
  }

  return {
    ok: generic.ok && component.ok,
    generic,
    component,
  };
}

async function verifyOpenStateVisualQuality(page, routeId, screenshotPath) {
  if (![
    "alert-dialog",
    "color-picker",
    "combobox",
    "context-menu",
    "date-picker",
    "dialog",
    "drawer",
    "dropdown-menu",
    "floating-panel",
    "hover-card",
    "menu",
    "menubar",
    "navigation-menu",
    "popover",
    "select",
    "sheet",
    "tooltip",
  ].includes(routeId)) return null;

  const root = page.locator(`[data-uifn-component="${routeId}"]`).first();
  try {
    let content;
    if (routeId === "context-menu") {
      const trigger = root.locator('[data-uifn-part="trigger"]').first();
      await trigger.click({ button: "right", position: { x: 20, y: 20 } });
      content = page.locator(
        '[data-uifn-component="context-menu"][data-uifn-part="content"]',
      ).last();
    } else if (routeId === "hover-card" || routeId === "tooltip") {
      await root.locator('[data-uifn-part="trigger"]').first().focus();
      content = routeId === "tooltip"
        ? page.locator('[role="tooltip"]').last()
        : page.locator(
            '[data-uifn-component="hover-card"][data-uifn-part="content"]',
          ).last();
    } else if (routeId === "select") {
      await root.getByRole("combobox").first().focus();
      await page.keyboard.press("Enter");
      content = page.locator('[role="listbox"]').last();
    } else if (routeId === "menubar" || routeId === "navigation-menu") {
      const trigger = root.locator('[data-uifn-part="trigger"]').first();
      await trigger.focus();
      await page.keyboard.press("Enter");
      content = root.locator('[data-uifn-part="content"]:visible').first();
    } else if (routeId === "menu" || routeId === "dropdown-menu") {
      const trigger = root.locator('[data-uifn-part="trigger"]').first();
      await trigger.focus();
      await page.keyboard.press("Enter");
      content = page.locator('[role="menu"]:visible').first();
    } else {
      await root.locator('[data-uifn-part="trigger"]').first().click();
      if (routeId === "alert-dialog") {
        content = page.locator('[role="alertdialog"]').last();
      } else if (routeId === "dialog") {
        content = page.locator('[role="dialog"]').last();
      } else if (routeId === "sheet") {
        content = page.locator(".uifn-production-sheet").last();
      } else {
        content = page.locator(
          `[data-uifn-component="${routeId}"][data-uifn-part="content"]`,
        ).last();
      }
    }

    await content.waitFor({ state: "visible", timeout: 3000 });
    await waitForPostInteractionPaint(page);
    const metrics = await content.evaluate((node, componentSlug) => {
      const box = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      const isVisible = (element) => {
        if (!(element instanceof HTMLElement || element instanceof SVGElement)) return false;
        const elementStyle = getComputedStyle(element);
        const elementBox = element.getBoundingClientRect();
        return elementStyle.display !== "none" &&
          elementStyle.visibility !== "hidden" &&
          Number(elementStyle.opacity) > 0 &&
          elementBox.width > 0 &&
          elementBox.height > 0;
      };
      const minimumSize = {
        "alert-dialog": [360, 150],
        "color-picker": [280, 220],
        combobox: [220, 90],
        "context-menu": [180, 70],
        "date-picker": [280, 240],
        dialog: [360, 150],
        drawer: [320, 180],
        "dropdown-menu": [180, 90],
        "floating-panel": [280, 140],
        "hover-card": [220, 90],
        menu: [180, 70],
        menubar: [180, 70],
        "navigation-menu": [180, 70],
        popover: [220, 90],
        select: [220, 90],
        sheet: [280, 320],
        tooltip: [80, 24],
      }[componentSlug] ?? [160, 64];
      const minimumInteractiveCount = {
        "alert-dialog": 2,
        "color-picker": 2,
        combobox: 3,
        "context-menu": 2,
        "date-picker": 20,
        dialog: 1,
        drawer: 1,
        "dropdown-menu": 3,
        "floating-panel": 2,
        "hover-card": 0,
        menu: 2,
        menubar: 2,
        "navigation-menu": 1,
        popover: 1,
        select: 3,
        sheet: 1,
        tooltip: 0,
      }[componentSlug] ?? 1;
      const interactive = Array.from(node.querySelectorAll(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), ' +
        'textarea:not([disabled]), a[href], [role="menuitem"], [role="option"], ' +
        '[role="slider"], [role="spinbutton"], [role="application"], [role="separator"], ' +
        '[tabindex]:not([tabindex="-1"])',
      )).filter(isVisible);
      const overlapCandidates = Array.from(node.querySelectorAll(
        'button, input, select, textarea, a[href], [role="menuitem"], [role="option"], ' +
        '[data-uifn-part="title"], [data-uifn-part="description"]',
      )).filter(isVisible);
      const overlapPairs = [];
      for (let index = 0; index < overlapCandidates.length; index += 1) {
        const first = overlapCandidates[index];
        const firstBox = first.getBoundingClientRect();
        for (let otherIndex = index + 1; otherIndex < overlapCandidates.length; otherIndex += 1) {
          const second = overlapCandidates[otherIndex];
          if (first.contains(second) || second.contains(first)) continue;
          const secondBox = second.getBoundingClientRect();
          const intersectionWidth = Math.max(
            0,
            Math.min(firstBox.right, secondBox.right) - Math.max(firstBox.left, secondBox.left),
          );
          const intersectionHeight = Math.max(
            0,
            Math.min(firstBox.bottom, secondBox.bottom) - Math.max(firstBox.top, secondBox.top),
          );
          if (intersectionWidth * intersectionHeight > 4) {
            overlapPairs.push([
              first.getAttribute("data-uifn-part") ?? first.getAttribute("role") ?? first.tagName,
              second.getAttribute("data-uifn-part") ?? second.getAttribute("role") ?? second.tagName,
            ]);
          }
        }
      }
      const background = style.backgroundColor;
      const opaqueSurface = background !== "transparent" &&
        background !== "rgba(0, 0, 0, 0)";
      const treatedSurface = opaqueSurface && (
        Number.parseFloat(style.borderTopWidth) > 0 ||
        style.boxShadow !== "none"
      );
      const text = (node.textContent ?? "").replace(/\s+/g, " ").trim();
      const accessibleLabelText = interactive
        .map((element) => (
          element.getAttribute("aria-label") ??
          element.getAttribute("aria-valuetext") ??
          element.getAttribute("title") ??
          ""
        ))
        .join(" ")
        .trim();
      const placeholderMatches = text.match(
        /\b(?:component content|example label|example title|current value|control example|viewport example)\b/gi,
      ) ?? [];
      const viewportInset = {
        left: box.left,
        top: box.top,
        right: window.innerWidth - box.right,
        bottom: window.innerHeight - box.bottom,
      };
      const root = document.querySelector(
        `[data-uifn-component="${componentSlug}"][data-uifn-part="root"]`,
      );
      const reference = componentSlug === "date-picker"
        ? root?.querySelector('[data-uifn-part="input"]')
        : ["color-picker", "combobox", "select"].includes(componentSlug)
          ? root?.querySelector('[data-uifn-part="control"], [data-uifn-part="input"], [data-uifn-part="trigger"]')
          : root?.querySelector('[data-uifn-part="trigger"]');
      const referenceBox = reference?.getBoundingClientRect();
      const anchoredRoute = [
        "color-picker",
        "combobox",
        "date-picker",
        "dropdown-menu",
        "floating-panel",
        "hover-card",
        "menu",
        "popover",
        "select",
        "tooltip",
      ].includes(componentSlug);
      const horizontalIntersection = referenceBox
        ? Math.max(0, Math.min(box.right, referenceBox.right) - Math.max(box.left, referenceBox.left))
        : 0;
      const verticalGap = referenceBox
        ? Math.min(
            Math.abs(box.top - referenceBox.bottom),
            Math.abs(referenceBox.top - box.bottom),
          )
        : Number.POSITIVE_INFINITY;
      const anchored = !anchoredRoute || Boolean(
        referenceBox &&
        horizontalIntersection >= Math.min(24, referenceBox.width) &&
        verticalGap <= 18
      );
      const drawerEdgeAligned = componentSlug !== "drawer" || (
        Math.abs(window.innerWidth - box.right) <= 2 &&
        box.height >= window.innerHeight * .9
      );
      return {
        ok: Boolean(
          box.width >= minimumSize[0] &&
          box.height >= minimumSize[1] &&
          viewportInset.left >= -2 &&
          viewportInset.top >= -2 &&
          viewportInset.right >= -2 &&
          viewportInset.bottom >= -2 &&
          treatedSurface &&
          (text.length >= 8 || accessibleLabelText.length >= 8) &&
          placeholderMatches.length === 0 &&
          interactive.length >= minimumInteractiveCount &&
          overlapPairs.length === 0 &&
          anchored &&
          drawerEdgeAligned
        ),
        box: { x: box.x, y: box.y, width: box.width, height: box.height },
        minimumSize,
        viewportInset,
        background,
        borderWidth: style.borderTopWidth,
        boxShadow: style.boxShadow,
        treatedSurface,
        text,
        accessibleLabelText,
        placeholderMatches,
        interactiveCount: interactive.length,
        minimumInteractiveCount,
        overlapPairs,
        referenceBox: referenceBox
          ? { x: referenceBox.x, y: referenceBox.y, width: referenceBox.width, height: referenceBox.height }
          : null,
        horizontalIntersection,
        verticalGap,
        anchored,
        drawerEdgeAligned,
      };
    }, routeId);

    await page.screenshot({ path: screenshotPath, fullPage: false });
    const accessibility = await verifyAccessibility(page);

    if (routeId === "hover-card" || routeId === "tooltip") {
      await root.locator('[data-uifn-part="trigger"]').first().evaluate((node) => node.blur());
      await page.mouse.move(2, 2);
    } else if (routeId === "floating-panel") {
      await content.locator('[data-uifn-part="close"]').first().click();
    } else {
      await page.keyboard.press("Escape");
    }
    await content.waitFor({ state: "hidden", timeout: 3000 }).catch(() => {});

    return {
      ok: metrics.ok && accessibility.ok,
      metrics,
      accessibility,
      screenshotPath,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      screenshotPath,
    };
  }
}

async function verifyResponsiveLayout(page, routeId) {
  const layout = await page.evaluate((componentSlug) => {
    const documentWidth = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
    const root = document.querySelector(`[data-uifn-component="${componentSlug}"]`);
    const rootBox = root?.getBoundingClientRect();
    const visible = Boolean(rootBox && rootBox.width > 0 && rootBox.height > 0 && rootBox.right > 0 && rootBox.left < window.innerWidth);
    const horizontalOverflow = Math.max(0, documentWidth - window.innerWidth);
    return {
      viewportWidth: window.innerWidth,
      documentWidth,
      horizontalOverflow,
      visible,
      rootBox: rootBox ? { x: rootBox.x, y: rootBox.y, width: rootBox.width, height: rootBox.height } : null,
    };
  }, routeId);
  const openButton = page.locator("button[data-catalog-nav-open]");
  const closeButton = page.locator("button[data-catalog-nav-close]");
  const shell = page.locator(".workbench-shell");
  const sidebar = page.locator("[data-catalog-sidebar]");
  const openButtonVisible = await openButton.isVisible().catch(() => false);
  const blockedByOpenModal = await page.locator(
    '[role="dialog"][aria-modal="true"]:not([hidden]), [role="alertdialog"][aria-modal="true"]:not([hidden])',
  ).evaluateAll((nodes) => nodes.some((node) => {
    const box = node.getBoundingClientRect();
    const style = getComputedStyle(node);
    return box.width > 0 && box.height > 0 && style.display !== "none" && style.visibility !== "hidden";
  })).catch(() => false);
  let drawer = {
    opened: false,
    sidebarVisible: false,
    closed: false,
    focusReturned: false,
    activeElement: null,
    blockedByOpenModal,
  };
  if (openButtonVisible && !blockedByOpenModal) {
    await openButton.click();
    await waitForPostInteractionPaint(page);
    drawer.opened = await shell.getAttribute("data-catalog-nav-open") === "true";
    drawer.sidebarVisible = await sidebar.isVisible().catch(() => false);
    await closeButton.click();
    await waitForPostInteractionPaint(page);
    drawer.closed = await shell.getAttribute("data-catalog-nav-open") === null;
    drawer.focusReturned = await openButton.evaluate((node) => document.activeElement === node);
    drawer.activeElement = await page.evaluate(() => {
      const active = document.activeElement;
      if (!(active instanceof HTMLElement)) return null;
      return {
        id: active.id,
        component: active.dataset.uifnComponent ?? null,
        part: active.dataset.uifnPart ?? null,
        catalogControl: [...active.attributes]
          .map((attribute) => attribute.name)
          .find((name) => name.startsWith("data-catalog-")) ?? null,
        text: (active.textContent ?? "").trim().slice(0, 120),
      };
    });
  }
  return {
    ok: layout.visible &&
      layout.horizontalOverflow <= 2 &&
      openButtonVisible &&
      (blockedByOpenModal || (
        drawer.opened &&
        drawer.sidebarVisible &&
        drawer.closed &&
        drawer.focusReturned
      )),
    ...layout,
    openButtonVisible,
    drawer,
  };
}

async function verifyInteractiveBehavior(page, framework, routeId) {
  try {
    if (routeId === "button") {
      const button = page.locator('[data-uifn-component="button"]').first();
      const status = page.locator('[role="status"]');
      if (await status.count()) return { ok: false, evidence: { reason: "toast-visible-before-button-click" } };
      const beforeHover = await button.evaluate((node) => {
        const style = getComputedStyle(node);
        return [style.backgroundColor, style.borderColor, style.boxShadow, style.transform].join("|");
      });
      await button.hover();
      await page.waitForTimeout(80);
      const afterHover = await button.evaluate((node) => {
        const style = getComputedStyle(node);
        return [style.backgroundColor, style.borderColor, style.boxShadow, style.transform].join("|");
      });
      await button.click();
      await status.waitFor({ state: "visible", timeout: 3000 });
      const portalled = await status.evaluate((node) => !node.closest(".qa-edge-box"));
      return {
        ok: portalled && beforeHover !== afterHover,
        evidence: {
          action: "button-opens-toast",
          statusText: (await status.textContent())?.trim(),
          portalled,
          hoverChanged: beforeHover !== afterHover,
        },
      };
    }

    if (routeId === "toast") {
      const viewport = page.locator('[data-uifn-component="toast"][data-uifn-part="viewport"]').first();
      const status = viewport.locator('[data-uifn-part="root"]').first();
      const stateBefore = await status.getAttribute("data-state");
      const statusText = (await status.textContent())?.trim() ?? "";
      const close = status.getByRole("button", { name: /dismiss notification/i });
      const closeControls = await close.getAttribute("aria-controls");
      const statusId = await status.getAttribute("id");
      await close.click();
      await page.waitForFunction(
        ({ statusId }) => document.getElementById(statusId)?.getAttribute("data-state") === null,
        { statusId },
        { timeout: 3000 }
      );
      const stateAfter = await status.getAttribute("data-state");
      return {
        ok:
          stateBefore === "visible" &&
          stateAfter === null &&
          statusText.length > 20 &&
          closeControls === statusId &&
          !closeControls?.includes("[object"),
        evidence: {
          action: "toast-dismiss",
          stateBefore,
          stateAfter,
          statusText,
          statusId,
          closeControls,
        },
      };
    }

    if (routeId === "aspect-ratio") {
      const root = page.locator('[data-uifn-component="aspect-ratio"]').first();
      const box = await root.boundingBox();
      const ratio = box ? box.width / box.height : 0;
      const contentCount = await root.locator('[data-uifn-part="content"]').count();
      return {
        ok: Boolean(box && box.width >= 320 && ratio > 1.7 && ratio < 1.86 && contentCount === 1),
        evidence: { action: "aspect-ratio-layout", box, ratio, contentCount },
      };
    }

    if (routeId === "avatar") {
      const root = page.locator('[data-uifn-component="avatar"]').first();
      const box = await root.boundingBox();
      const borderRadius = await root.evaluate((node) => getComputedStyle(node).borderRadius);
      const fallback = (await root.locator('[data-uifn-part="fallback"]').textContent())?.trim() ?? "";
      const image = root.locator("img").first();
      const imageAlt = await image.getAttribute("alt");
      const imageHidden = await image.getAttribute("hidden");
      return {
        ok: Boolean(
          box &&
          box.width >= 63.5 &&
          box.height >= 63.5 &&
          Math.abs(box.width - box.height) < 0.5 &&
          imageAlt === "Example" &&
          imageHidden !== null &&
          fallback.length >= 2 &&
          borderRadius !== "0px"
        ),
        evidence: { action: "avatar-fallback-render", box, imageAlt, imageHidden, borderRadius, fallback },
      };
    }

    if (routeId === "badge") {
      const root = page.locator('[data-uifn-component="badge"]').first();
      const label = (await root.textContent())?.trim() ?? "";
      const box = await root.boundingBox();
      const borderRadius = await root.evaluate((node) => getComputedStyle(node).borderRadius);
      return {
        ok: label.length > 0 && Boolean(box && box.width >= 64 && box.height >= 22) && borderRadius !== "0px",
        evidence: { action: "badge-render", label, box, borderRadius },
      };
    }

    if (routeId === "card") {
      const root = page.locator('[data-uifn-component="card"]').first();
      const heading = (await root.locator('[data-uifn-part="title"]').textContent())?.trim() ?? "";
      const contentCount = await root.locator('[data-uifn-part="content"]').count();
      const actionCount = await root.locator('[data-uifn-part="action"]').count();
      const footerCount = await root.locator('[data-uifn-part="footer"]').count();
      return {
        ok: heading.length > 0 && contentCount === 1 && actionCount === 1 && footerCount === 1,
        evidence: { action: "card-composition", heading, contentCount, actionCount, footerCount },
      };
    }

    if (routeId === "label") {
      const root = page.locator('[data-uifn-component="label"]').first();
      const tagName = await root.evaluate((node) => node.tagName);
      const text = (await root.locator('[data-uifn-part="text"]').textContent())?.trim() ?? "";
      const requiredCount = await root.locator('[data-uifn-part="requiredIndicator"]').count();
      return {
        ok: tagName === "LABEL" && text.length > 0 && requiredCount === 1,
        evidence: { action: "label-render", tagName, text, requiredCount },
      };
    }

    if (routeId === "progress") {
      const root = page.locator('[data-uifn-component="progress"]').first();
      const track = root.locator('[data-uifn-part="track"]');
      const range = root.locator('[data-uifn-part="range"]');
      const trackBox = await track.boundingBox();
      const rangeBox = await range.boundingBox();
      const valueNow = await root.getAttribute("aria-valuenow");
      const role = await root.getAttribute("role");
      const fillRatio = trackBox && rangeBox ? rangeBox.width / trackBox.width : 0;
      return {
        ok: role === "progressbar" && valueNow === "72" && fillRatio > 0.68 && fillRatio < 0.76,
        evidence: { action: "progress-render", role, valueNow, fillRatio, trackBox, rangeBox },
      };
    }

    if (routeId === "separator") {
      const root = page.locator('[data-uifn-component="separator"]').first();
      const tagName = await root.evaluate((node) => node.tagName);
      const role = await root.getAttribute("role");
      const box = await root.boundingBox();
      return {
        ok: tagName === "DIV" && role === "separator" && Boolean(box && box.width >= 300 && box.height >= 1 && box.height <= 2),
        evidence: { action: "separator-render", tagName, role, box },
      };
    }

    if (routeId === "skeleton") {
      const root = page.locator('[data-uifn-component="skeleton"]').first();
      const lineCount = await root.locator(".catalog-production-skeleton-copy i").count();
      const avatarCount = await root.locator(".catalog-production-skeleton-avatar").count();
      const ariaHidden = await root.getAttribute("aria-hidden");
      return {
        ok: lineCount === 3 && avatarCount === 1 && ariaHidden === "true",
        evidence: { action: "skeleton-render", lineCount, avatarCount, ariaHidden },
      };
    }

    if (routeId === "table") {
      const root = page.locator('[data-uifn-component="table"]').first();
      const caption = (await root.locator("caption").textContent())?.trim() ?? "";
      const headerCount = await root.locator("thead th").count();
      const rowCount = await root.locator("tbody tr").count();
      const cellCount = await root.locator("tbody td").count();
      const footerCount = await root.locator("tfoot").count();
      return {
        ok: caption.length > 0 && headerCount >= 3 && rowCount >= 2 && cellCount >= rowCount * headerCount && footerCount === 1,
        evidence: { action: "table-render", caption, headerCount, rowCount, cellCount, footerCount },
      };
    }

    if (routeId === "typography") {
      const root = page.locator('[data-uifn-component="typography"]').first();
      const heading = (await root.locator("h2").textContent())?.trim() ?? "";
      const paragraphCount = await root.locator("p").count();
      const box = await root.boundingBox();
      return {
        ok: heading.length > 10 && paragraphCount >= 2 && Boolean(box && box.width >= 320),
        evidence: { action: "typography-render", heading, paragraphCount, box },
      };
    }

    if (routeId === "alert-dialog") {
      const root = page.locator('[data-uifn-component="alert-dialog"]').first();
      const trigger = root.locator('[data-uifn-part="trigger"]');
      const dialog = page.locator('[role="alertdialog"]').last();
      if (await dialog.isVisible().catch(() => false)) return { ok: false, evidence: { reason: "alert-dialog-visible-before-trigger" } };
      await trigger.click();
      await dialog.waitFor({ state: "visible", timeout: 3000 });
      const portalled = await dialog.evaluate(
        (node, rootNode) => rootNode instanceof Element && !rootNode.contains(node),
        await root.elementHandle(),
      );
      const bodyLocked = await page.evaluate(() => document.body.style.overflow === "hidden");
      await page.waitForFunction(
        (node) => node instanceof Element && node.contains(document.activeElement),
        await dialog.elementHandle(),
        { timeout: 3000 },
      );
      const focusInside = await dialog.evaluate((node) => node.contains(document.activeElement));
      const title = (await dialog.locator('[data-uifn-part="title"]').textContent())?.trim() ?? "";
      const focusable = dialog.locator('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])');
      const lastFocusable = focusable.last();
      await lastFocusable.focus();
      await page.keyboard.press("Tab");
      const trapped = await dialog.evaluate((node) => node.contains(document.activeElement));
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "hidden", timeout: 3000 });
      const bodyUnlocked = await page.evaluate(() => document.body.style.overflow !== "hidden");
      const focusReturned = await trigger.evaluate((node) => document.activeElement === node);
      return {
        ok: portalled && bodyLocked && bodyUnlocked && focusInside && trapped && focusReturned && title.length > 0,
        evidence: { action: "alert-dialog-modal-keyboard", portalled, bodyLocked, bodyUnlocked, focusInside, trapped, focusReturned, title },
      };
    }

    if (routeId === "breadcrumb") {
      const root = page.locator('[data-uifn-component="breadcrumb"]').first();
      const tagName = await root.evaluate((node) => node.tagName);
      const linkCount = await root.locator("a").count();
      const current = (await root.locator('[aria-current="page"]').textContent())?.trim() ?? "";
      return {
        ok: tagName === "NAV" && linkCount >= 2 && current.length > 0,
        evidence: { action: "breadcrumb-render", tagName, linkCount, current },
      };
    }

    if (routeId === "checkbox") {
      const control = page.locator('[data-uifn-component="checkbox"] [role="checkbox"]').first();
      const before = await control.getAttribute("aria-checked");
      await control.click();
      const after = await control.getAttribute("aria-checked");
      return {
        ok: ["true", "false"].includes(before ?? "") && ["true", "false"].includes(after ?? "") && before !== after,
        evidence: { action: "checkbox-toggle", before, after },
      };
    }

    if (routeId === "collapsible") {
      const root = page.locator('[data-uifn-component="collapsible"]').first();
      const trigger = root.locator('[data-uifn-part="trigger"], .uifn-production-disclosure-trigger').first();
      const content = root.locator('[data-uifn-part="content"], .uifn-production-disclosure-content').first();
      if (await content.isVisible().catch(() => false)) return { ok: false, evidence: { reason: "collapsible-open-before-trigger" } };
      await trigger.click();
      await content.waitFor({ state: "visible", timeout: 3000 });
      const expanded = await trigger.getAttribute("aria-expanded");
      return {
        ok: expanded === "true",
        evidence: { action: "collapsible-toggle", expanded, content: (await content.textContent())?.trim() },
      };
    }

    if (routeId === "dropdown-menu") {
      const root = page.locator('[data-uifn-component="dropdown-menu"]').first();
      const trigger = root.locator('[data-uifn-part="trigger"]');
      const menu = page.locator('[role="menu"]').last();
      if (await menu.count()) return { ok: false, evidence: { reason: "dropdown-visible-before-trigger" } };
      await trigger.focus();
      await page.keyboard.press("Enter");
      await menu.waitFor({ state: "visible", timeout: 3000 });
      const itemCount = await menu.getByRole("menuitem").count();
      const portalled = await menu.evaluate((node) => !node.closest('[data-uifn-component="dropdown-menu"]'));
      const itemFocused = await menu.evaluate((node) => node.contains(document.activeElement) && document.activeElement?.getAttribute("role") === "menuitem");
      await page.keyboard.press("Escape");
      await menu.waitFor({ state: "detached", timeout: 3000 });
      const focusReturned = await trigger.evaluate((node) => document.activeElement === node);
      return {
        ok: itemCount >= 3 && portalled && itemFocused && focusReturned,
        evidence: { action: "dropdown-keyboard-open-escape", itemCount, portalled, itemFocused, focusReturned },
      };
    }

    if (routeId === "form") {
      const root = page.locator('[data-uifn-component="form"]').first();
      const tagName = await root.evaluate((node) => node.tagName);
      const state = await root.getAttribute("data-state");
      const errorSummary = root.locator('[data-uifn-part="errorSummary"]');
      const actions = root.locator('[data-uifn-part="actions"]');
      const errorHidden = await errorSummary.getAttribute("hidden");
      const actionsDisabled = await actions.getAttribute("data-disabled");
      return {
        ok: tagName === "FORM" && state === "valid" && errorHidden !== null && (actionsDisabled === null || actionsDisabled === "false"),
        evidence: { action: "form-static-contract", tagName, state, errorHidden, actionsDisabled },
      };
    }

    if (routeId === "hover-card") {
      const root = page.locator('[data-uifn-component="hover-card"]').first();
      const trigger = root.locator('[data-uifn-part="trigger"]');
      const card = page.locator('[data-uifn-component="hover-card"][data-uifn-part="content"]').last();
      if (await card.isVisible().catch(() => false)) return { ok: false, evidence: { reason: "hover-card-visible-before-hover" } };
      const href = await trigger.getAttribute("href");
      await trigger.focus();
      await card.waitFor({ state: "visible", timeout: 3000 });
      const portalled = await card.evaluate(
        (node, rootNode) => rootNode instanceof Element && !rootNode.contains(node),
        await root.elementHandle(),
      );
      const text = (await card.textContent())?.trim() ?? "";
      await trigger.evaluate((node) => node.blur());
      await card.waitFor({ state: "hidden", timeout: 3000 });
      await trigger.hover();
      await card.waitFor({ state: "visible", timeout: 3000 });
      await page.mouse.move(2, 2);
      await card.waitFor({ state: "hidden", timeout: 3000 });
      return {
        ok: href === "#preview" && portalled && /Alex Morgan/i.test(text),
        evidence: { action: "hover-card-focus-and-hover", href, portalled, focusOpened: true, hoverOpened: true, dismissed: true, text },
      };
    }

    if (routeId === "input") {
      const input = page.locator('[data-uifn-component="input"]').first();
      await input.fill("hello@uifn.dev");
      const value = await input.inputValue();
      return {
        ok: value === "hello@uifn.dev",
        evidence: { action: "input-entry", value },
      };
    }

    if (routeId === "menubar") {
      const root = page.locator('[data-uifn-component="menubar"]').first();
      const triggers = root.locator('[data-uifn-part="trigger"]');
      const triggerCount = await triggers.count();
      const firstTrigger = triggers.first();
      const trigger = triggers.nth(1);
      await firstTrigger.focus();
      await page.keyboard.press("ArrowRight");
      await page.waitForFunction(
        (node) => node instanceof Element && document.activeElement === node,
        await trigger.elementHandle(),
        { timeout: 3000 },
      );
      const rovingFocusWorked = await trigger.evaluate((node) => document.activeElement === node);
      await page.keyboard.press("Enter");
      const menuId = await trigger.getAttribute("aria-controls");
      if (!menuId) return { ok: false, evidence: { reason: "menubar-trigger-missing-controls" } };
      const menu = page.locator(`[id=${JSON.stringify(menuId)}]`);
      await menu.waitFor({ state: "visible", timeout: 3000 });
      const itemCount = await menu.getByRole("menuitem").count();
      const contentOwnedByRoot = await menu.evaluate((node, rootNode) => rootNode instanceof Element && rootNode.contains(node), await root.elementHandle());
      await page.waitForFunction(
        (node) => node instanceof Element && node.contains(document.activeElement),
        await menu.elementHandle(),
        { timeout: 3000 },
      ).catch(() => undefined);
      const itemFocused = await menu.evaluate((node) => node.contains(document.activeElement) && document.activeElement?.getAttribute("role") === "menuitem");
      const activeBeforeEscape = await page.evaluate(() => ({
        component: document.activeElement?.getAttribute("data-uifn-component") ?? null,
        part: document.activeElement?.getAttribute("data-uifn-part") ?? null,
        role: document.activeElement?.getAttribute("role") ?? null,
        text: document.activeElement?.textContent?.trim() ?? null,
      }));
      const itemFocusEvidence = itemFocused ? [] : await menu.getByRole("menuitem").evaluateAll((nodes) => nodes.map((node) => ({
        id: node.id,
        tabIndex: node instanceof HTMLElement ? node.tabIndex : null,
        hidden: node.closest("[hidden]") !== null,
        connected: node.isConnected,
        part: node.getAttribute("data-uifn-part"),
        text: node.textContent?.trim() ?? null,
      })));
      await page.keyboard.press("Escape");
      await page.waitForTimeout(100);
      const expandedAfterEscape = await trigger.getAttribute("aria-expanded");
      const stateAfterEscape = await menu.getAttribute("data-state");
      const hiddenAfterEscape = await menu.getAttribute("hidden");
      if (expandedAfterEscape !== "false" || stateAfterEscape !== "closed" || hiddenAfterEscape === null) {
        return {
          ok: false,
          evidence: {
            reason: "menubar-did-not-close-on-escape",
            activeBeforeEscape,
            itemFocusEvidence,
            expandedAfterEscape,
            stateAfterEscape,
            hiddenAfterEscape,
          },
        };
      }
      await menu.waitFor({ state: "hidden", timeout: 3000 });
      const focusReturned = await trigger.evaluate((node) => document.activeElement === node);
      return {
        ok: triggerCount === 2 && rovingFocusWorked && itemCount >= 2 && contentOwnedByRoot && itemFocused && focusReturned,
        evidence: { action: "menubar-roving-open-escape", triggerCount, rovingFocusWorked, itemCount, contentOwnedByRoot, itemFocused, focusReturned, activeBeforeEscape, itemFocusEvidence },
      };
    }

    if (routeId === "pagination") {
      const root = page.locator('[data-uifn-component="pagination"]').first();
      const before = (await root.locator('[aria-current="page"]').textContent())?.trim() ?? "";
      const pageTriggers = root.locator('[data-uifn-part="pageTrigger"]');
      const triggerCount = await pageTriggers.count();
      const thirdPage = pageTriggers.nth(2);
      await thirdPage.click();
      const after = (await root.locator('[aria-current="page"]').textContent())?.trim() ?? "";
      const current = await thirdPage.getAttribute("aria-current");
      return {
        ok: triggerCount === 4 && before === "2" && after === "3" && current === "page",
        evidence: { action: "pagination-change", triggerCount, before, after, current },
      };
    }

    if (routeId === "radio-group") {
      const radios = page.locator('[data-uifn-component="radio-group"] [role="radio"]');
      const count = await radios.count();
      const target = radios.nth(1);
      await target.click();
      const checked = await target.getAttribute("aria-checked");
      return {
        ok: count === 3 && checked === "true",
        evidence: { action: "radio-select", count, checked },
      };
    }

    if (routeId === "resizable") {
      const separator = page.locator('[data-uifn-component="resizable"] [role="separator"]').first();
      const before = Number(await separator.getAttribute("aria-valuenow"));
      await separator.focus();
      await page.keyboard.press("ArrowRight");
      const after = Number(await separator.getAttribute("aria-valuenow"));
      return {
        ok: Number.isFinite(before) && after > before,
        evidence: { action: "resizable-keyboard", before, after },
      };
    }

    if (routeId === "scroll-area") {
      const root = page.locator('[data-uifn-component="scroll-area"]').first();
      const viewport = root.locator('[data-uifn-part="viewport"], .uifn-production-scroll-viewport').first();
      const dimensions = await viewport.evaluate((node) => ({
        clientHeight: node.clientHeight,
        scrollHeight: node.scrollHeight,
      }));
      await viewport.evaluate((node) => { node.scrollTop = node.scrollHeight; });
      const scrollTop = await viewport.evaluate((node) => node.scrollTop);
      return {
        ok: dimensions.scrollHeight > dimensions.clientHeight && scrollTop > 0,
        evidence: { action: "scroll-area-scroll", ...dimensions, scrollTop },
      };
    }

    if (routeId === "select") {
      const root = page.locator('[data-uifn-component="select"]').first();
      const trigger = root.getByRole("combobox");
      const listbox = page.locator('[role="listbox"]').last();
      if (await listbox.isVisible().catch(() => false)) return { ok: false, evidence: { reason: "select-visible-before-trigger" } };
      await trigger.focus();
      await page.keyboard.press("Enter");
      await listbox.waitFor({ state: "visible", timeout: 3000 });
      const portalled = await listbox.evaluate((node, rootNode) => rootNode instanceof Element && !rootNode.contains(node), await root.elementHandle());
      const activeDescendant = await trigger.getAttribute("aria-activedescendant");
      const optionActive = await listbox.evaluate((node, activeId) => {
        const activeOption = activeId ? document.getElementById(activeId) : null;
        return activeOption instanceof Element && node.contains(activeOption) && activeOption.getAttribute("role") === "option";
      }, activeDescendant);
      const activeBeforeEscape = await page.evaluate(() => ({
        component: document.activeElement?.getAttribute("data-uifn-component") ?? null,
        part: document.activeElement?.getAttribute("data-uifn-part") ?? null,
        role: document.activeElement?.getAttribute("role") ?? null,
        text: document.activeElement?.textContent?.trim() ?? null,
      }));
      await page.keyboard.press("Escape");
      await page.waitForTimeout(100);
      const expandedAfterEscape = await trigger.getAttribute("aria-expanded");
      const stateAfterEscape = await listbox.getAttribute("data-state");
      const hiddenAfterEscape = await listbox.getAttribute("hidden");
      if (expandedAfterEscape !== "false" || stateAfterEscape !== "idle" || hiddenAfterEscape === null) {
        return {
          ok: false,
          evidence: {
            reason: "select-did-not-close-on-escape",
            activeBeforeEscape,
            expandedAfterEscape,
            stateAfterEscape,
            hiddenAfterEscape,
          },
        };
      }
      await listbox.waitFor({ state: "hidden", timeout: 3000 });
      const focusReturned = await trigger.evaluate((node) => document.activeElement === node);
      await trigger.click();
      await listbox.waitFor({ state: "visible", timeout: 3000 });
      const secondOption = listbox.getByRole("option").nth(1);
      const selectedText = (await secondOption.textContent())?.trim() ?? "";
      await secondOption.click();
      await listbox.waitFor({ state: "hidden", timeout: 3000 });
      const triggerText = (await trigger.textContent())?.trim() ?? "";
      return {
        ok: portalled && optionActive && focusReturned && /Administrator/.test(selectedText) && /Administrator/.test(triggerText),
        evidence: { action: "select-keyboard-dismiss-and-pointer-select", portalled, optionActive, focusReturned, selectedText, triggerText, activeBeforeEscape },
      };
    }

    if (routeId === "sidebar") {
      const root = page.locator('[data-uifn-component="sidebar"]').first();
      const projectLink = root.getByRole("link", { name: /Projects/i });
      await projectLink.click();
      const active = await projectLink.getAttribute("aria-current");
      const collapse = root.getByRole("button", { name: /Collapse sidebar/i });
      await collapse.click();
      const collapsed = await root.getAttribute("data-collapsed");
      return {
        ok: active === "page" && collapsed === "true",
        evidence: { action: "sidebar-select-collapse", active, collapsed },
      };
    }

    if (routeId === "tabs") {
      const root = page.locator('[data-uifn-component="tabs"]').first();
      const tabs = root.getByRole("tab");
      const activity = tabs.nth(1);
      await activity.click();
      const selected = await activity.getAttribute("aria-selected");
      const panel = (await root.locator('[role="tabpanel"]:visible').textContent())?.trim() ?? "";
      return {
        ok: await tabs.count() === 3 && selected === "true" && /deployments|audit/i.test(panel),
        evidence: { action: "tabs-change", count: await tabs.count(), selected, label: (await activity.textContent())?.trim(), panel },
      };
    }

    if (routeId === "textarea") {
      const textarea = page.locator('[data-uifn-component="textarea"]').first();
      await textarea.fill("A production-ready component catalog.");
      const value = await textarea.inputValue();
      return {
        ok: value === "A production-ready component catalog.",
        evidence: { action: "textarea-entry", value },
      };
    }

    if (routeId === "toggle") {
      const control = page.locator('[data-uifn-component="toggle"]').first();
      const before = await control.getAttribute("aria-pressed");
      await control.click();
      const after = await control.getAttribute("aria-pressed");
      return {
        ok: before === "false" && after === "true",
        evidence: { action: "toggle-press", before, after },
      };
    }

    if (routeId === "toggle-group") {
      const root = page.locator('[data-uifn-component="toggle-group"]').first();
      const items = root.getByRole("button");
      const count = await items.count();
      const target = items.nth(1);
      await target.click();
      const pressed = await target.getAttribute("aria-pressed");
      return {
        ok: count === 3 && pressed === "true",
        evidence: { action: "toggle-group-select", count, pressed, text: (await target.textContent())?.trim() },
      };
    }

    if (routeId === "calendar") {
      const root = page.locator('[data-uifn-component="calendar"]').first();
      const before = await root.getAttribute("data-value");
      const day = root.locator('button[role="gridcell"]:not([disabled])').first();
      await day.click();
      const after = await root.getAttribute("data-value");
      const previousLabel = (await root.getByRole("button", { name: "Previous month" }).count()) === 1;
      return {
        ok: previousLabel && Boolean(after) && before !== after,
        evidence: { action: "calendar-select", before, after, previousLabel },
      };
    }

    if (routeId === "data-table") {
      const root = page.locator('[data-uifn-component="data-table"]').first();
      const search = root.locator('input[type="search"]').first();
      await search.fill("Taylor");
      const resultText = (await root.locator(".uifn-production-data-toolbar span").textContent())?.trim() ?? "";
      const checkbox = root.locator('tbody input[type="checkbox"]').first();
      await checkbox.click();
      const selected = await root.locator("tbody tr").first().getAttribute("data-selected");
      return {
        ok: /^1 results$/.test(resultText) && selected === "true",
        evidence: { action: "data-table-filter-select", resultText, selected },
      };
    }

    if (routeId === "context-menu") {
      const root = page.locator('[data-uifn-component="context-menu"]').first();
      const target = root.locator('[data-uifn-part="trigger"]');
      const menu = page.locator('[data-uifn-component="context-menu"][data-uifn-part="content"]').last();
      if (await menu.isVisible().catch(() => false)) return { ok: false, evidence: { reason: "menu-visible-before-contextmenu" } };
      await target.focus();
      await page.keyboard.press("Shift+F10");
      await menu.waitFor({ state: "visible", timeout: 3000 });
      await page.waitForFunction(
        (node) => node instanceof Element && node.contains(document.activeElement),
        await menu.elementHandle(),
        { timeout: 3000 },
      );
      const keyboardItemFocused = await menu.evaluate((node) => node.contains(document.activeElement) && document.activeElement?.getAttribute("role") === "menuitem");
      await page.keyboard.press("Escape");
      await menu.waitFor({ state: "hidden", timeout: 3000 });
      await page.waitForFunction(
        (node) => node instanceof Element && document.activeElement === node,
        await target.elementHandle(),
        { timeout: 3000 },
      ).catch(() => undefined);
      const focusReturned = await target.evaluate((node) => document.activeElement === node);
      const activeAfterEscape = await page.evaluate(() => ({
        tag: document.activeElement?.tagName ?? null,
        component: document.activeElement?.getAttribute("data-uifn-component") ?? null,
        part: document.activeElement?.getAttribute("data-uifn-part") ?? null,
        id: document.activeElement?.id ?? null,
      }));
      await target.click({ button: "right", position: { x: 20, y: 20 } });
      await menu.waitFor({ state: "visible", timeout: 3000 });
      const menuItemCount = await menu.locator('[role="menuitem"]').count();
      const portalled = await menu.evaluate(
        (node, rootNode) => rootNode instanceof Element && !rootNode.contains(node),
        await root.elementHandle(),
      );
      await menu.getByRole("menuitem").first().click();
      await menu.waitFor({ state: "hidden", timeout: 3000 });
      return {
        ok: menuItemCount >= 2 && portalled && keyboardItemFocused && focusReturned,
        evidence: { action: "contextmenu-keyboard-and-pointer", menuItemCount, portalled, keyboardItemFocused, focusReturned, activeAfterEscape },
      };
    }

    if (routeId === "dialog") {
      const trigger = page.locator('[data-uifn-component="dialog"] [data-uifn-part="trigger"]');
      const dialog = page.locator('[role="dialog"]').last();
      if (await dialog.isVisible().catch(() => false)) return { ok: false, evidence: { reason: "dialog-visible-before-trigger" } };
      await trigger.click();
      await dialog.waitFor({ state: "visible", timeout: 3000 });
      const overlayCount = await page.locator('[data-uifn-component="dialog"][data-uifn-part="backdrop"]').count();
      const bodyLocked = await page.evaluate(() => document.body.style.overflow === "hidden");
      const root = page.locator('[data-uifn-component="dialog"][data-uifn-part="root"]').first();
      const portalled = await dialog.evaluate((node, rootNode) => rootNode instanceof Element && !rootNode.contains(node), await root.elementHandle());
      await page.waitForFunction(
        (node) => node instanceof Element && node.contains(document.activeElement),
        await dialog.elementHandle(),
        { timeout: 3000 },
      );
      const focusInside = await dialog.evaluate((node) => node.contains(document.activeElement));
      const focusable = dialog.locator('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])');
      await focusable.last().focus();
      await page.keyboard.press("Tab");
      const trapped = await dialog.evaluate((node) => node.contains(document.activeElement));
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "hidden", timeout: 3000 });
      const bodyUnlocked = await page.evaluate(() => document.body.style.overflow !== "hidden");
      const focusReturned = await trigger.evaluate((node) => document.activeElement === node);
      return {
        ok: overlayCount === 1 && bodyLocked && bodyUnlocked && portalled && focusInside && trapped && focusReturned,
        evidence: { action: "dialog-modal-keyboard", overlayCount, bodyLocked, bodyUnlocked, portalled, focusInside, trapped, focusReturned },
      };
    }

    if (routeId === "sheet") {
      const trigger = page.locator('[data-uifn-component="sheet"] [data-uifn-part="trigger"]');
      const sheet = page.locator(".uifn-production-sheet").last();
      if (await sheet.count()) return { ok: false, evidence: { reason: "sheet-visible-before-trigger" } };
      await trigger.click();
      await sheet.waitFor({ state: "visible", timeout: 3000 });
      await page.waitForTimeout(250);
      const portalled = await sheet.evaluate((node) => !node.closest('[data-uifn-component="sheet"]'));
      const box = await sheet.boundingBox();
      const viewport = page.viewportSize();
      const edgeAligned = Boolean(box && viewport && Math.abs(viewport.width - (box.x + box.width)) <= 2);
      const focusInside = await sheet.evaluate((node) => node.contains(document.activeElement));
      const focusable = sheet.locator('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])');
      await focusable.last().focus();
      await page.keyboard.press("Tab");
      const trapped = await sheet.evaluate((node) => node.contains(document.activeElement));
      await page.keyboard.press("Escape");
      await sheet.waitFor({ state: "detached", timeout: 3000 });
      const focusReturned = await trigger.evaluate((node) => document.activeElement === node);
      return {
        ok: portalled && edgeAligned && focusInside && trapped && focusReturned,
        evidence: { action: "sheet-modal-keyboard", portalled, edgeAligned, focusInside, trapped, focusReturned, box },
      };
    }

    if (routeId === "popover") {
      const root = page.locator('[data-uifn-component="popover"][data-uifn-part="root"]').first();
      const trigger = root.locator('[data-uifn-part="trigger"]');
      const popover = page.locator('[data-uifn-component="popover"][data-uifn-part="content"]').last();
      if (await popover.isVisible().catch(() => false)) return { ok: false, evidence: { reason: "popover-visible-before-trigger" } };
      await trigger.focus();
      await page.keyboard.press("Enter");
      await popover.waitFor({ state: "visible", timeout: 3000 });
      const portalled = await popover.evaluate(
        (node, rootNode) => rootNode instanceof Element && !rootNode.contains(node),
        await root.elementHandle(),
      );
      await page.keyboard.press("Escape");
      await popover.waitFor({ state: "hidden", timeout: 3000 });
      const focusReturned = await trigger.evaluate((node) => document.activeElement === node);
      return {
        ok: portalled && focusReturned,
        evidence: { action: "popover-keyboard-open-escape", portalled, focusReturned },
      };
    }

    if (routeId === "tooltip") {
      const root = page.locator('[data-uifn-component="tooltip"]').first();
      const trigger = root.getByRole("button");
      const tooltip = page.locator('[role="tooltip"]').last();
      if (await tooltip.isVisible().catch(() => false)) return { ok: false, evidence: { reason: "tooltip-visible-before-hover" } };
      await trigger.focus();
      await tooltip.waitFor({ state: "visible", timeout: 3000 });
      const portalled = await tooltip.evaluate(
        (node, rootNode) => rootNode instanceof Element && !rootNode.contains(node),
        await root.elementHandle(),
      );
      const text = (await tooltip.textContent())?.trim();
      await trigger.evaluate((node) => node.blur());
      await tooltip.waitFor({ state: "hidden", timeout: 3000 });
      await trigger.hover();
      await tooltip.waitFor({ state: "visible", timeout: 3000 });
      await page.mouse.move(2, 2);
      await tooltip.waitFor({ state: "hidden", timeout: 3000 });
      return {
        ok: portalled,
        evidence: { action: "tooltip-focus-and-hover", portalled, focusOpened: true, hoverOpened: true, dismissed: true, text },
      };
    }

    if (routeId === "switch") {
      const control = page.locator('[role="switch"]').first();
      const before = await control.getAttribute("aria-checked");
      await control.click();
      await page.waitForTimeout(200);
      const after = await control.getAttribute("aria-checked");
      return {
        ok: ["true", "false"].includes(before ?? "") && ["true", "false"].includes(after ?? "") && before !== after,
        evidence: { action: "switch-toggle", before, after },
      };
    }

    if (routeId === "slider") {
      const root = page.locator('[data-uifn-component="slider"]').first();
      const control = root.locator('[role="slider"]').first();
      const hiddenInput = root.locator('input[type="hidden"]').first();
      const before = Number(await control.getAttribute("aria-valuenow"));
      await control.focus();
      await page.keyboard.press("ArrowRight");
      const after = Number(await control.getAttribute("aria-valuenow"));
      const hiddenValue = await hiddenInput.inputValue();
      const valueText = (await root.locator('[data-uifn-part="valueText"]').textContent())?.trim() ?? "";
      return {
        ok: Number.isFinite(before) && after > before && hiddenValue === String(after) && valueText.length > 0,
        evidence: { action: "slider-keyboard-change", before, after, hiddenValue, valueText },
      };
    }

    if (routeId === "input-otp") {
      const slots = page.locator('[data-uifn-component="input-otp"] [data-uifn-part="slot"]');
      const input = page.getByLabel("Six digit verification code");
      const slotCount = await slots.count();
      await input.fill("123456");
      await page.waitForFunction(() => {
        const control = document.querySelector('[data-uifn-component="input-otp"] input[aria-label="Six digit verification code"]');
        const rendered = Array.from(document.querySelectorAll('[data-uifn-component="input-otp"] [data-uifn-part="slot"]'))
          .map((slot) => slot.textContent ?? "")
          .join("");
        return control instanceof HTMLInputElement && control.value === "123456" && rendered === "123456";
      }, { timeout: 3000 }).catch(() => {});
      const value = await input.inputValue();
      const renderedValue = (await slots.allTextContents()).join("");
      return {
        ok: slotCount === 6 && value === "123456" && renderedValue === "123456",
        evidence: { action: "otp-entry", slotCount, value, renderedValue },
      };
    }

    if (routeId === "input-group") {
      const root = page.locator('[data-uifn-component="input-group"]').first();
      const input = root.locator('[data-uifn-part="input"]');
      const button = root.locator('[data-uifn-part="button"]');
      await input.fill("design-system");
      await button.focus();
      const value = await input.inputValue();
      const buttonFocused = await button.evaluate((node) => document.activeElement === node);
      const textareaHidden = await root.locator('[data-uifn-part="textarea"]').getAttribute("hidden");
      return {
        ok: value === "design-system" && buttonFocused && textareaHidden !== null,
        evidence: { action: "input-group-entry-and-action-focus", value, buttonFocused, textareaHidden: textareaHidden !== null },
      };
    }

    if (routeId === "command") {
      const input = page.locator('[data-uifn-component="command"] [role="combobox"]').first();
      await input.fill("search projects");
      const options = page.locator('[data-uifn-component="command"] [role="option"]:visible');
      const optionCount = await options.count();
      const option = options.first();
      const optionText = (await option.textContent())?.trim() ?? "";
      await option.click();
      const selected = await option.getAttribute("aria-selected");
      const hiddenValue = await page.locator('[data-uifn-component="command"] [data-uifn-part="hiddenInput"]').inputValue();
      return {
        ok: optionCount === 1 && /search projects/i.test(optionText) && selected === "true" && hiddenValue === "item-1",
        evidence: { action: "command-filter-select", optionCount, optionText, selected, hiddenValue },
      };
    }

    if (routeId === "date-picker") {
      const root = page.locator('[data-uifn-component="date-picker"]').first();
      const dialog = page.locator('[data-uifn-component="date-picker"][data-uifn-part="content"]').last();
      if (await dialog.isVisible().catch(() => false)) return { ok: false, evidence: { reason: "date-picker-visible-before-trigger" } };
      await root.locator('[data-uifn-part="trigger"]').click();
      await dialog.waitFor({ state: "visible", timeout: 3000 });
      const portalled = await dialog.evaluate((node, rootNode) => rootNode instanceof Element && !rootNode.contains(node), await root.elementHandle());
      const day = dialog.getByRole("button", { name: /July 22, 2026/i }).first();
      await day.click();
      await dialog.waitFor({ state: "hidden", timeout: 3000 });
      const value = await root.locator('[data-uifn-part="hiddenInput"]').inputValue();
      return {
        ok: portalled && Boolean(value),
        evidence: { action: "date-picker-select", portalled, value },
      };
    }

    if (routeId === "accordion") {
      const root = page.locator('[data-uifn-component="accordion"]').first();
      const trigger = root.locator('[data-uifn-part="trigger"]').first();
      const content = root.locator('[data-uifn-part="content"]').first();
      if (await content.isVisible().catch(() => false)) return { ok: false, evidence: { reason: "accordion-open-before-trigger" } };
      await trigger.click();
      await content.waitFor({ state: "visible", timeout: 3000 });
      const expanded = await trigger.getAttribute("aria-expanded");
      return {
        ok: expanded === "true",
        evidence: { action: "accordion-toggle", expanded, content: (await content.textContent())?.trim() },
      };
    }

    const primitive = canonicalPrimitiveBySlug.get(routeId);
    if (primitive) {
      const componentSpecific = await verifyRemainingComponentContract(page, routeId);
      if (componentSpecific) return componentSpecific;
      return {
        ok: false,
        evidence: {
          action: "missing-component-specific-contract",
          component: primitive.id,
          behaviorFamily: primitive.behaviorFamily,
        },
      };
    }
    return { ok: true, evidence: { action: "non-component-route-render" } };
  } catch (error) {
    return {
      ok: false,
      evidence: {
        action: routeId,
        framework,
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

async function capturePopupGeometry(page, trigger, positioner, focusTarget) {
  return page.evaluate(([triggerNode, positionerNode, focusNode]) => {
    const serializeBox = (node) => {
      if (!(node instanceof Element)) return null;
      const box = node.getBoundingClientRect();
      return {
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
      };
    };
    return {
      scrollX: window.scrollX,
      scrollY: window.scrollY,
      triggerBox: serializeBox(triggerNode),
      positionerBox: serializeBox(positionerNode),
      focusTargetBox: serializeBox(focusNode),
      positionerStyle: positionerNode instanceof HTMLElement
        ? positionerNode.getAttribute("style")
        : null,
      activePart: document.activeElement instanceof HTMLElement
        ? document.activeElement.dataset.uifnPart ?? null
        : null,
    };
  }, [
    await trigger.elementHandle(),
    await positioner.elementHandle(),
    await focusTarget.elementHandle(),
  ]);
}

async function waitForPopupPositioning(page, reference, positioner) {
  await page.waitForFunction(([referenceNode, positionerNode]) => {
    if (!(referenceNode instanceof Element) || !(positionerNode instanceof HTMLElement)) {
      return false;
    }
    const referenceBox = referenceNode.getBoundingClientRect();
    const positionerBox = positionerNode.getBoundingClientRect();
    const horizontalIntersection = Math.max(
      0,
      Math.min(referenceBox.right, positionerBox.right)
        - Math.max(referenceBox.left, positionerBox.left),
    );
    const style = getComputedStyle(positionerNode);
    return positionerNode.dataset.uifnPositioned === "true"
      && ["fixed", "absolute"].includes(style.position)
      && positionerBox.width > 0
      && positionerBox.height > 0
      && horizontalIntersection > 0
      && positionerBox.right > 0
      && positionerBox.bottom > 0
      && positionerBox.left < window.innerWidth
      && positionerBox.top < window.innerHeight;
  }, [
    await reference.elementHandle(),
    await positioner.elementHandle(),
  ], { timeout: 3000 });
}

async function verifyRemainingComponentContract(page, routeId) {
  const root = page.locator(`[data-uifn-component="${routeId}"][data-uifn-part="root"]`).first();

  if (routeId === "angle-slider") {
    const slider = root.getByRole("slider");
    const hiddenInput = root.locator('[data-uifn-part="hiddenInput"]');
    const before = Number(await slider.getAttribute("aria-valuenow"));
    await slider.focus();
    await page.keyboard.press("ArrowRight");
    await waitForPostInteractionPaint(page);
    const after = Number(await slider.getAttribute("aria-valuenow"));
    const hiddenValue = await hiddenInput.inputValue();
    return {
      ok: Number.isFinite(before) && after === before + 1 && hiddenValue === String(after),
      evidence: { action: "angle-slider-keyboard-change", before, after, hiddenValue },
    };
  }

  if (routeId === "autocomplete") {
    const input = root.getByRole("combobox");
    const listbox = page.locator(
      '[data-uifn-component="autocomplete"][data-uifn-part="content"][role="listbox"]'
    ).last();
    await input.fill("Sam");
    await listbox.waitFor({ state: "visible", timeout: 3000 });
    const second = listbox.locator('[data-uifn-part="item"][data-value="item-2"]');
    await second.click();
    await waitForPostInteractionPaint(page);
    const value = await input.inputValue();
    const expanded = await input.getAttribute("aria-expanded");
    const selected = await listbox.locator(
      '[data-uifn-part="item"][data-value="item-2"]'
    ).getAttribute("aria-selected");
    return {
      ok: value === "Sam Rivera" && expanded === "false" && selected === "true",
      evidence: { action: "autocomplete-filter-pointer-select", value, expanded, selected },
    };
  }

  if (routeId === "carousel") {
    const items = root.locator('[data-uifn-part="item"]');
    const indicators = root.locator('[data-uifn-part="indicator"]');
    const liveRegion = root.locator('[data-uifn-part="liveRegion"]');
    await root.locator('[data-uifn-part="next"]').click();
    await waitForPostInteractionPaint(page);
    const firstState = await items.nth(0).getAttribute("data-state");
    const secondState = await items.nth(1).getAttribute("data-state");
    const current = await indicators.nth(1).getAttribute("aria-current");
    const announcement = await liveRegion.getAttribute("data-message");
    return {
      ok: firstState === "inactive" && secondState === "active" && current === "true" && Boolean(announcement),
      evidence: { action: "carousel-next-slide", firstState, secondState, current, announcement },
    };
  }

  if (routeId === "checkbox-group") {
    const controls = root.getByRole("checkbox");
    const target = controls.nth(1);
    const hidden = root.locator('[data-uifn-part="hiddenInput"]').nth(1);
    await target.click();
    await waitForPostInteractionPaint(page);
    const checked = await target.getAttribute("aria-checked");
    const nativeChecked = await hidden.isChecked();
    return {
      ok: await controls.count() === 3 && checked === "true" && nativeChecked,
      evidence: { action: "checkbox-group-toggle-second", checked, nativeChecked },
    };
  }

  if (routeId === "clipboard") {
    const trigger = root.locator('[data-uifn-part="trigger"]');
    const status = root.getByRole("status");
    await trigger.click();
    await page.waitForFunction(
      (node) => node instanceof Element && ["copied", "error"].includes(node.getAttribute("data-state") ?? ""),
      await status.elementHandle(),
      { timeout: 3000 },
    );
    const state = await status.getAttribute("data-state");
    const message = await status.getAttribute("data-message");
    return {
      ok: state === "copied" && message === "Copied",
      evidence: { action: "clipboard-copy-success", state, message },
    };
  }

  if (routeId === "color-picker") {
    const trigger = root.locator('[data-uifn-part="trigger"]');
    const content = page.locator(
      '[data-uifn-component="color-picker"][data-uifn-part="content"][role="dialog"]'
    ).last();
    const channel = content.locator('[data-uifn-part="channelInput"]').first();
    const redSlider = content.locator(
      '[data-uifn-part="channelSlider"][data-channel="r"]'
    ).first();
    const positioner = page.locator(
      '[data-uifn-component="color-picker"][data-uifn-part="positioner"]'
    ).last();
    const hidden = root.locator('[data-uifn-part="hiddenInput"]');
    await trigger.click();
    await content.waitFor({ state: "visible", timeout: 3000 });
    await waitForPopupPositioning(page, trigger, positioner);
    const openGeometry = await capturePopupGeometry(page, trigger, positioner, redSlider);
    const before = await hidden.inputValue();
    await redSlider.evaluate((node) => node.focus());
    const focusedGeometry = await capturePopupGeometry(page, trigger, positioner, redSlider);
    const keyboardBefore = Number(await redSlider.getAttribute("aria-valuenow"));
    await page.keyboard.press("ArrowRight");
    await waitForPostInteractionPaint(page);
    const keyboardGeometry = await capturePopupGeometry(page, trigger, positioner, redSlider);
    const keyboardAfter = Number(await redSlider.getAttribute("aria-valuenow"));
    const sliderBox = await redSlider.boundingBox();
    if (!sliderBox) {
      return {
        ok: false,
        evidence: { action: "color-picker-keyboard-pointer-channel-change", reason: "slider-not-measurable" },
      };
    }
    const pointerPoint = {
      x: sliderBox.x + sliderBox.width * 0.75,
      y: sliderBox.y + sliderBox.height / 2,
    };
    const pointerHit = await page.evaluate(({ x, y }) => {
      const hit = document.elementFromPoint(x, y);
      const slider = hit?.closest?.(
        '[data-uifn-part="channelSlider"][data-channel="r"]',
      );
      return {
        component: slider?.getAttribute("data-uifn-component") ?? null,
        part: slider?.getAttribute("data-uifn-part") ?? null,
        channel: slider?.getAttribute("data-channel") ?? null,
      };
    }, pointerPoint);
    if (
      pointerHit.component !== "color-picker"
      || pointerHit.part !== "channelSlider"
      || pointerHit.channel !== "r"
    ) {
      const viewport = await page.evaluate(() => ({
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        scrollX: window.scrollX,
        scrollY: window.scrollY,
      }));
      return {
        ok: false,
        evidence: {
          action: "color-picker-keyboard-pointer-channel-change",
          reason: "slider-not-hit-testable",
          sliderBox,
          pointerPoint,
          pointerHit,
          viewport,
          openGeometry,
          focusedGeometry,
          keyboardGeometry,
        },
      };
    }
    await page.mouse.move(pointerPoint.x, pointerPoint.y);
    await page.mouse.down();
    await page.mouse.up();
    await waitForPostInteractionPaint(page);
    const pointerAfter = Number(await redSlider.getAttribute("aria-valuenow"));
    const contentStayedOpen = await content.isVisible();
    await channel.fill("64");
    await channel.press("Enter");
    await waitForPostInteractionPaint(page);
    const after = await hidden.inputValue();
    await page.keyboard.press("Escape");
    await content.waitFor({ state: "hidden", timeout: 3000 });
    const focusReturned = await trigger.evaluate((node) => document.activeElement === node);
    return {
      ok:
        keyboardAfter === keyboardBefore + 1
        && pointerAfter !== keyboardAfter
        && contentStayedOpen
        && before !== after
        && after.length > 0
        && focusReturned,
      evidence: {
        action: "color-picker-keyboard-pointer-channel-change-dismiss",
        before,
        after,
        keyboardBefore,
        keyboardAfter,
        pointerAfter,
        pointerHit,
        contentStayedOpen,
        focusReturned,
        openGeometry,
        focusedGeometry,
        keyboardGeometry,
      },
    };
  }

  if (routeId === "combobox") {
    const input = root.getByRole("combobox");
    const trigger = root.locator('[data-uifn-part="trigger"]');
    const listbox = page.locator('[role="listbox"]').last();
    const hidden = root.locator('[data-uifn-part="hiddenInput"]');
    await trigger.click();
    await listbox.waitFor({ state: "visible", timeout: 3000 });
    const second = listbox.locator('[data-uifn-part="item"][data-value="item-2"]');
    await second.click();
    await listbox.waitFor({ state: "hidden", timeout: 3000 });
    const value = await hidden.inputValue();
    const selected = await listbox.locator('[data-uifn-part="item"][data-value="item-2"]').getAttribute("aria-selected");
    const inputValue = await input.inputValue();
    return {
      ok: value === "item-2" && selected === "true" && /Sam Rivera/i.test(inputValue),
      evidence: { action: "combobox-pointer-select", value, selected, inputValue },
    };
  }

  if (routeId === "date-input") {
    const segments = root.getByRole("spinbutton");
    const day = segments.nth(1);
    const hidden = root.locator('[data-uifn-part="hiddenInput"]');
    const before = await hidden.inputValue();
    await day.focus();
    await page.keyboard.press("ArrowUp");
    await waitForPostInteractionPaint(page);
    const after = await hidden.inputValue();
    const valueNow = await day.getAttribute("aria-valuenow");
    const focused = await day.evaluate((node) => document.activeElement === node);
    return {
      ok: await segments.count() === 3 && before === "2026-07-22" && after === "2026-07-23" && valueNow === "23" && focused,
      evidence: { action: "date-input-day-increment", before, after, valueNow, focused },
    };
  }

  if (routeId === "drawer") {
    const trigger = root.locator('[data-uifn-part="trigger"]');
    const dialog = page.locator('[data-uifn-component="drawer"][data-uifn-part="content"]').last();
    await trigger.click();
    await dialog.waitFor({ state: "visible", timeout: 3000 });
    const modal = await dialog.getAttribute("aria-modal");
    await page.waitForFunction(
      (node) => node instanceof Element && node.contains(document.activeElement),
      await dialog.elementHandle(),
      { timeout: 3000 },
    );
    const focusInside = await dialog.evaluate((node) => node.contains(document.activeElement));
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden", timeout: 3000 });
    const focusReturned = await trigger.evaluate((node) => document.activeElement === node);
    return {
      ok: modal === "true" && focusInside && focusReturned,
      evidence: { action: "drawer-modal-open-escape", modal, focusInside, focusReturned },
    };
  }

  if (routeId === "editable") {
    const preview = root.locator('[data-uifn-part="preview"]');
    const input = root.locator('[data-uifn-part="input"]');
    const hidden = root.locator('[data-uifn-part="hiddenInput"]');
    await preview.click();
    await input.waitFor({ state: "visible", timeout: 3000 });
    await page.waitForFunction(
      (node) => node instanceof Element && document.activeElement === node,
      await input.elementHandle(),
      { timeout: 3000 },
    );
    const focused = await input.evaluate((node) => document.activeElement === node);
    await input.fill("Published value");
    await root.locator('[data-uifn-part="submit"]').click();
    await input.waitFor({ state: "hidden", timeout: 3000 });
    const hiddenValue = await hidden.inputValue();
    const state = await root.getAttribute("data-state");
    return {
      ok: focused && hiddenValue === "Published value" && state === "idle",
      evidence: { action: "editable-edit-submit", focused, hiddenValue, state },
    };
  }

  if (routeId === "field") {
    const label = root.locator('[data-uifn-part="label"]');
    const controlWrapper = root.locator('[data-uifn-part="control"]');
    const description = root.locator('[data-uifn-part="description"]');
    const labelFor = await label.getAttribute("for");
    const labelledControl = labelFor ? page.locator(`#${labelFor}`) : null;
    const labelledControlCount = labelledControl ? await labelledControl.count() : 0;
    const labelledControlTag = labelledControlCount > 0
      ? await labelledControl.first().evaluate((node) => node.tagName)
      : null;
    const describedBy = labelledControlCount > 0
      ? await labelledControl.first().getAttribute("aria-describedby")
      : null;
    const descriptionId = await description.getAttribute("id");
    const wrapperId = await controlWrapper.getAttribute("id");
    const errorHidden = await root.locator('[data-uifn-part="error"]').getAttribute("hidden");
    const nativeControl = ["INPUT", "SELECT", "TEXTAREA", "BUTTON"].includes(labelledControlTag ?? "");
    return {
      ok: Boolean(
        labelFor &&
        labelledControlCount === 1 &&
        nativeControl &&
        descriptionId &&
        describedBy?.split(/\s+/).includes(descriptionId) &&
        errorHidden !== null
      ),
      evidence: {
        action: "field-native-label-description-contract",
        labelFor,
        labelledControlCount,
        labelledControlTag,
        describedBy,
        descriptionId,
        wrapperId,
        errorHidden,
      },
    };
  }

  if (routeId === "fieldset") {
    const tagName = await root.evaluate((node) => node.tagName);
    const legend = root.locator('[data-uifn-part="legend"]');
    const description = root.locator('[data-uifn-part="description"]');
    const describedBy = await root.getAttribute("aria-describedby");
    const descriptionId = await description.getAttribute("id");
    const legendIsChild = await legend.evaluate((node, parent) => node.parentElement === parent, await root.elementHandle());
    return {
      ok: tagName === "FIELDSET" && legendIsChild && Boolean(descriptionId && describedBy?.split(/\s+/).includes(descriptionId)),
      evidence: { action: "fieldset-native-semantics", tagName, legendIsChild, describedBy, descriptionId },
    };
  }

  if (routeId === "file-upload") {
    const trigger = root.locator('[data-uifn-part="trigger"]');
    const status = root.getByRole("status");
    await trigger.click();
    await page.waitForFunction(
      (node) => node instanceof Element && node.getAttribute("data-state") === "accepted",
      await status.elementHandle(),
      { timeout: 3000 },
    );
    const state = await status.getAttribute("data-state");
    const count = await status.getAttribute("data-count");
    const deleteButtons = root.locator('[data-uifn-part="itemDelete"]');
    await deleteButtons.first().click();
    await waitForPostInteractionPaint(page);
    const countAfterDelete = await status.getAttribute("data-count");
    return {
      ok: state === "accepted" && count === "2" && countAfterDelete === "1",
      evidence: { action: "file-upload-capability-pick-remove", state, count, countAfterDelete },
    };
  }

  if (routeId === "floating-panel") {
    const trigger = root.locator('[data-uifn-part="trigger"]');
    const dialog = page.locator('[data-uifn-component="floating-panel"][data-uifn-part="content"]').last();
    await trigger.click();
    await dialog.waitFor({ state: "visible", timeout: 3000 });
    const resize = dialog.getByRole("separator");
    const before = Number(await resize.getAttribute("aria-valuenow"));
    await resize.focus();
    await page.keyboard.press("ArrowRight");
    await waitForPostInteractionPaint(page);
    const after = Number(await resize.getAttribute("aria-valuenow"));
    await dialog.locator('[data-uifn-part="close"]').click();
    await dialog.waitFor({ state: "hidden", timeout: 3000 });
    const focusReturned = await trigger.evaluate((node) => document.activeElement === node);
    return {
      ok: after > before && focusReturned,
      evidence: { action: "floating-panel-open-resize-close", before, after, focusReturned },
    };
  }

  if (routeId === "image-cropper") {
    const zoom = root.locator('[data-uifn-part="zoomControl"]');
    const handles = root.locator('[data-uifn-part="handle"]');
    const before = Number(await zoom.inputValue());
    await zoom.focus();
    await page.keyboard.press("ArrowRight");
    await waitForPostInteractionPaint(page);
    const after = Number(await zoom.inputValue());
    const cropState = await root.locator('[data-uifn-part="cropArea"]').getAttribute("data-state");
    return {
      ok: await handles.count() === 4 && after > before && cropState === "ready",
      evidence: { action: "image-cropper-zoom-keyboard", handleCount: await handles.count(), before, after, cropState },
    };
  }

  if (routeId === "listbox") {
    const listbox = root.getByRole("listbox");
    const second = listbox.locator('[data-uifn-part="item"][data-value="item-2"]');
    const hidden = root.locator('[data-uifn-part="hiddenInput"]');
    await second.click();
    await waitForPostInteractionPaint(page);
    const selected = await second.getAttribute("aria-selected");
    const value = await hidden.inputValue();
    return {
      ok: selected === "true" && value === "item-2",
      evidence: { action: "listbox-pointer-select", selected, value },
    };
  }

  if (routeId === "marquee") {
    const viewport = root.locator('[data-uifn-part="viewport"]');
    const track = root.locator('[data-uifn-part="track"]');
    const styles = await track.evaluate((node) => {
      const style = getComputedStyle(node);
      return {
        animationName: style.animationName,
        duration: style.animationDuration,
        playState: style.animationPlayState,
      };
    });
    const overflow = await viewport.evaluate((node) => getComputedStyle(node).overflow);
    return {
      ok: styles.animationName !== "none" && styles.duration !== "0s" && styles.playState === "running" && overflow === "hidden",
      evidence: { action: "marquee-styled-motion", ...styles, overflow },
    };
  }

  if (routeId === "menu") {
    const trigger = root.locator('[data-uifn-part="trigger"]');
    const menu = page.locator('[data-uifn-component="menu"][data-uifn-part="content"]').last();
    await trigger.focus();
    await page.keyboard.press("Enter");
    await menu.waitFor({ state: "visible", timeout: 3000 });
    await page.waitForFunction(
      (node) => node instanceof Element && node.contains(document.activeElement),
      await menu.elementHandle(),
      { timeout: 3000 },
    );
    const itemCount = await menu.getByRole("menuitem").count();
    const itemFocused = await menu.evaluate((node) => node.contains(document.activeElement));
    await page.keyboard.press("Escape");
    await menu.waitFor({ state: "hidden", timeout: 3000 });
    const focusReturned = await trigger.evaluate((node) => document.activeElement === node);
    return {
      ok: itemCount >= 2 && itemFocused && focusReturned,
      evidence: { action: "menu-keyboard-open-escape", itemCount, itemFocused, focusReturned },
    };
  }

  if (routeId === "meter") {
    const track = root.locator('[data-uifn-part="track"]');
    const range = root.locator('[data-uifn-part="range"]');
    const trackBox = await track.boundingBox();
    const rangeBox = await range.boundingBox();
    const ratio = trackBox && rangeBox ? rangeBox.width / trackBox.width : 0;
    const role = await root.getAttribute("role");
    const valueNow = await root.getAttribute("aria-valuenow");
    return {
      ok: role === "meter" && valueNow === "72" && ratio > 0.68 && ratio < 0.76,
      evidence: { action: "meter-value-and-range", role, valueNow, ratio },
    };
  }

  if (routeId === "navigation-menu") {
    const triggers = root.locator('[data-uifn-part="trigger"]');
    const first = triggers.first();
    await first.focus();
    await page.keyboard.press("ArrowRight");
    await waitForPostInteractionPaint(page);
    const secondFocused = await triggers.nth(1).evaluate((node) => document.activeElement === node);
    await page.keyboard.press("Enter");
    const content = root.locator('[data-uifn-part="content"]').nth(1);
    await content.waitFor({ state: "visible", timeout: 3000 });
    const expanded = await triggers.nth(1).getAttribute("aria-expanded");
    await page.keyboard.press("Escape");
    await content.waitFor({ state: "hidden", timeout: 3000 });
    const focusReturned = await triggers.nth(1).evaluate((node) => document.activeElement === node);
    return {
      ok: await triggers.count() === 3 && secondFocused && expanded === "true" && focusReturned,
      evidence: { action: "navigation-menu-roving-open-escape", triggerCount: await triggers.count(), secondFocused, expanded, focusReturned },
    };
  }

  if (routeId === "number-input") {
    const input = root.locator('[data-uifn-part="input"]');
    const hidden = root.locator('[data-uifn-part="hiddenInput"]');
    const increment = root.locator('[data-uifn-part="increment"]');
    const before = Number(await input.inputValue());
    await increment.click();
    await waitForPostInteractionPaint(page);
    const after = Number(await input.inputValue());
    const hiddenValue = Number(await hidden.inputValue());
    await root.locator('[data-uifn-part="decrement"]').click();
    await waitForPostInteractionPaint(page);
    const restored = Number(await input.inputValue());
    return {
      ok: Number.isFinite(before) && after === before + 1 && hiddenValue === after && restored === before,
      evidence: { action: "number-input-step-controls", before, after, hiddenValue, restored },
    };
  }

  if (routeId === "password-input") {
    const input = root.locator('[data-uifn-part="input"]');
    const toggle = root.locator('[data-uifn-part="visibilityTrigger"]');
    await input.fill("correct horse battery staple");
    const beforeType = await input.getAttribute("type");
    await toggle.click();
    await waitForPostInteractionPaint(page);
    const afterType = await input.getAttribute("type");
    const value = await input.inputValue();
    return {
      ok: beforeType === "password" && afterType === "text" && value === "correct horse battery staple",
      evidence: { action: "password-input-visibility-toggle", beforeType, afterType, valueLength: value.length },
    };
  }

  if (routeId === "pin-input") {
    const inputs = root.locator('[data-uifn-part="input"]');
    const hidden = root.locator('[data-uifn-part="hiddenInput"]');
    await inputs.nth(0).fill("1");
    await inputs.nth(1).fill("2");
    await inputs.nth(2).fill("3");
    await inputs.nth(3).fill("4");
    await inputs.nth(4).fill("5");
    await inputs.nth(5).fill("6");
    await waitForPostInteractionPaint(page);
    const value = await hidden.inputValue();
    return {
      ok: await inputs.count() === 6 && value === "123456",
      evidence: { action: "pin-input-six-digit-entry", inputCount: await inputs.count(), value },
    };
  }

  if (routeId === "qr-code") {
    const image = root.locator('[data-uifn-part="image"]');
    const caption = root.locator('[data-uifn-part="caption"]');
    const tagName = await image.evaluate((node) => node.tagName);
    const viewBox = await image.getAttribute("viewBox");
    const ariaLabel = await image.getAttribute("aria-label");
    const shapeCount = await image.locator("path, rect").count();
    const moduleCount = Number(await image.getAttribute("data-module-count"));
    const pathLength = (await image.locator("path").getAttribute("d"))?.length ?? 0;
    const captionText = (await caption.textContent())?.trim() ?? "";
    return {
      ok: tagName === "svg" && Boolean(viewBox) && /uifn documentation/i.test(ariaLabel ?? "") && shapeCount >= 1 && moduleCount >= 21 && pathLength > 100 && captionText.length > 10,
      evidence: { action: "qr-code-svg-semantics", tagName, viewBox, ariaLabel, shapeCount, moduleCount, pathLength, captionText },
    };
  }

  if (routeId === "rating-group") {
    const radios = root.getByRole("radio");
    const target = radios.nth(3);
    const hidden = root.locator('[data-uifn-part="hiddenInput"]');
    await target.click();
    await waitForPostInteractionPaint(page);
    const checked = await target.getAttribute("aria-checked");
    const value = await hidden.inputValue();
    return {
      ok: await radios.count() === 5 && checked === "true" && value === "4",
      evidence: { action: "rating-group-select-four", radioCount: await radios.count(), checked, value },
    };
  }

  if (routeId === "segment-group") {
    const radios = root.getByRole("radio");
    const target = radios.nth(1);
    const hidden = root.locator('[data-uifn-part="hiddenInput"]');
    await target.click();
    await waitForPostInteractionPaint(page);
    const checked = await target.getAttribute("aria-checked");
    const value = await hidden.inputValue();
    return {
      ok: checked === "true" && value === "item-2",
      evidence: { action: "segment-group-select-second", checked, value },
    };
  }

  if (routeId === "signature-pad") {
    const canvas = root.locator('[data-uifn-part="canvas"]');
    const hidden = root.locator('[data-uifn-part="hiddenInput"]');
    const box = await canvas.boundingBox();
    if (!box) return { ok: false, evidence: { action: "signature-pad-draw-undo", reason: "canvas-has-no-box" } };
    await page.mouse.move(box.x + 12, box.y + 12);
    await page.mouse.down();
    await page.mouse.move(box.x + Math.min(80, box.width - 12), box.y + Math.min(45, box.height - 12), { steps: 4 });
    await page.mouse.up();
    await waitForPostInteractionPaint(page);
    const drawnState = await root.getAttribute("data-state");
    const drawnValue = await hidden.inputValue();
    const undo = root.locator('[data-uifn-part="undo"]');
    const undoEnabled = !(await undo.isDisabled());
    await undo.click();
    await waitForPostInteractionPaint(page);
    const undoneValue = await hidden.inputValue();
    return {
      ok: drawnState === "complete" && drawnValue !== "[]" && undoEnabled && undoneValue === "[]",
      evidence: { action: "signature-pad-draw-undo", drawnState, drawnValueLength: drawnValue.length, undoEnabled, undoneValue },
    };
  }

  if (routeId === "splitter") {
    const separator = root.getByRole("separator");
    const panels = root.locator('[data-uifn-part="panel"]');
    const before = Number(await separator.getAttribute("aria-valuenow"));
    await separator.focus();
    await page.keyboard.press("ArrowRight");
    await waitForPostInteractionPaint(page);
    const after = Number(await separator.getAttribute("aria-valuenow"));
    return {
      ok: await panels.count() === 2 && after > before,
      evidence: { action: "splitter-keyboard-resize", panelCount: await panels.count(), before, after },
    };
  }

  if (routeId === "steps") {
    const triggers = root.locator('[data-uifn-part="trigger"]');
    const contents = root.locator('[data-uifn-part="content"]');
    await triggers.nth(2).click();
    await waitForPostInteractionPaint(page);
    const current = await triggers.nth(2).getAttribute("aria-current");
    const visible = await contents.nth(2).isVisible();
    const previousState = await triggers.nth(1).getAttribute("data-state");
    return {
      ok: current === "step" && visible && previousState === "complete",
      evidence: { action: "steps-advance-to-third", current, visible, previousState },
    };
  }

  if (routeId === "tags-input") {
    const input = root.locator('[data-uifn-part="input"]');
    const hidden = root.locator('[data-uifn-part="hiddenInput"]').first();
    await input.fill("release");
    await input.press("Enter");
    await waitForPostInteractionPaint(page);
    const selectedValues = await root.locator('[data-uifn-part="hiddenInput"]').evaluateAll((nodes) => (
      nodes.map((node) => node instanceof HTMLInputElement ? node.value : "")
    ));
    const releaseSelected = selectedValues.includes("release");
    const itemTexts = await root.locator('[data-uifn-part="itemText"]').allTextContents();
    return {
      ok: releaseSelected && itemTexts.some((text) => /release/i.test(text)) && await hidden.count() >= 1,
      evidence: { action: "tags-input-create-tag", selectedValues, itemTexts },
    };
  }

  if (routeId === "timer") {
    const value = root.locator('[data-uifn-part="value"]');
    const start = root.locator('[data-uifn-part="start"]');
    const pause = root.locator('[data-uifn-part="pause"]');
    const before = Number(await value.getAttribute("data-value"));
    await start.click();
    await page.waitForTimeout(260);
    const during = Number(await value.getAttribute("data-value"));
    const runningState = await root.getAttribute("data-state");
    await pause.click();
    await waitForPostInteractionPaint(page);
    const pausedState = await root.getAttribute("data-state");
    const pausedAt = Number(await value.getAttribute("data-value"));
    await page.waitForTimeout(180);
    const stillPausedAt = Number(await value.getAttribute("data-value"));
    return {
      ok: during < before && runningState === "running" && pausedState === "paused" && Math.abs(pausedAt - stillPausedAt) < 0.001,
      evidence: { action: "timer-start-pause", before, during, runningState, pausedState, pausedAt, stillPausedAt },
    };
  }

  if (routeId === "toolbar") {
    const controls = root.locator('[data-uifn-part="button"], [data-uifn-part="link"]');
    const first = controls.nth(0);
    const second = controls.nth(1);
    await first.focus();
    await page.keyboard.press("ArrowRight");
    await waitForPostInteractionPaint(page);
    const secondFocused = await second.evaluate((node) => document.activeElement === node);
    const firstTabIndex = await first.getAttribute("tabindex");
    const secondTabIndex = await second.getAttribute("tabindex");
    return {
      ok: await controls.count() === 2 && secondFocused && firstTabIndex === "-1" && secondTabIndex === "0",
      evidence: { action: "toolbar-roving-focus", controlCount: await controls.count(), secondFocused, firstTabIndex, secondTabIndex },
    };
  }

  if (routeId === "tour") {
    const dialog = root.getByRole("dialog");
    const progress = root.getByRole("status");
    await dialog.waitFor({ state: "visible", timeout: 3000 });
    const before = await progress.getAttribute("aria-label");
    await dialog.locator('[data-uifn-part="next"]').click();
    await waitForPostInteractionPaint(page);
    const after = await progress.getAttribute("aria-label");
    const step = await root.getAttribute("data-step");
    await dialog.locator('[data-uifn-part="close"]').click();
    await dialog.waitFor({ state: "hidden", timeout: 3000 });
    const targetFocused = await page.locator("#uifn-tour-target").evaluate((node) => document.activeElement === node);
    return {
      ok: before === "Step 1 of 3" && after === "Step 2 of 3" && step === "1" && targetFocused,
      evidence: { action: "tour-next-close-restore", before, after, step, targetFocused },
    };
  }

  if (routeId === "tree-view") {
    const tree = root.getByRole("tree");
    const items = root.getByRole("treeitem");
    const first = items.nth(0);
    const trigger = first.locator(':scope > [data-uifn-part="itemTrigger"]');
    await trigger.click();
    await waitForPostInteractionPaint(page);
    const expanded = await first.getAttribute("aria-expanded");
    const branch = first.locator(':scope > [data-uifn-part="branch"]');
    const branchVisible = await branch.isVisible();
    await first.focus();
    await page.keyboard.press("ArrowRight");
    await waitForPostInteractionPaint(page);
    const childFocused = await items.nth(1).evaluate((node) => document.activeElement === node);
    const focusEvidence = await page.evaluate(() => {
      const active = document.activeElement;
      return {
        activeElementId: active?.id ?? null,
        activeElementPart: active?.getAttribute("data-uifn-part") ?? null,
        treeItemTabIndexes: [...document.querySelectorAll('[data-uifn-component="tree-view"][data-uifn-part="item"]')]
          .map((node) => ({ id: node.id, tabIndex: node.getAttribute("tabindex") })),
      };
    });
    return {
      ok: await tree.count() === 1 && await items.count() === 2 && expanded === "true" && branchVisible && childFocused,
      evidence: {
        action: "tree-view-expand-focus-child",
        itemCount: await items.count(),
        expanded,
        branchVisible,
        childFocused,
        ...focusEvidence,
      },
    };
  }

  return null;
}

async function verifyDeclaredAdapterContract(page, primitive) {
  const root = page.locator(`[data-uifn-component="${primitive.id}"][data-uifn-part="root"]`).first();
  const rootVisible = await root.isVisible().catch(() => false);
  const partCount = await page.locator(`[data-uifn-component="${primitive.id}"][data-uifn-part]`).count();
  const expectedPartCount = primitive.anatomy.length;
  const interactive = page.locator(
    `[data-uifn-component="${primitive.id}"][data-uifn-part]:is(button, input:not([type="hidden"]), textarea, select, [tabindex]:not([tabindex="-1"])):not(:disabled):not([aria-disabled="true"])`
  );
  const interactiveCount = await interactive.count();
  let focusWorked = true;
  let focusTarget = null;
  let accessibleName = "";
  let keyboardProbe = null;
  if (interactiveCount > 0) {
    const control = interactive.first();
    await control.focus();
    await waitForPostInteractionPaint(page);
    focusTarget = await page.evaluate(() => ({
      tag: document.activeElement?.tagName ?? null,
      component: document.activeElement?.getAttribute("data-uifn-component") ?? null,
      part: document.activeElement?.getAttribute("data-uifn-part") ?? null,
      id: document.activeElement?.id ?? null,
    }));
    focusWorked = await root.evaluate((node) => (
      document.activeElement instanceof HTMLElement
      && (
        document.activeElement === node
        || node.contains(document.activeElement)
        || document.activeElement.getAttribute("data-uifn-component") === node.getAttribute("data-uifn-component")
      )
    ));
    accessibleName = await control.evaluate((node) => {
      const labelledBy = node.getAttribute("aria-labelledby");
      const labelledText = labelledBy
        ? labelledBy.split(/\s+/).map((id) => document.getElementById(id)?.textContent?.trim() ?? "").join(" ").trim()
        : "";
      return (
        node.getAttribute("aria-label") ||
        labelledText ||
        node.textContent?.trim() ||
        (node instanceof HTMLInputElement ? node.placeholder : "") ||
        ""
      );
    });
    const declaredKeys = primitive.accessibility.rules.keyboard.keys;
    const key = ["ArrowRight", "ArrowDown", "Enter", "Space"].find((candidate) => declaredKeys.includes(candidate));
    if (key) {
      const before = await control.evaluate((node) => ({
        state: node.getAttribute("data-state"),
        expanded: node.getAttribute("aria-expanded"),
        checked: node.getAttribute("aria-checked"),
        selected: node.getAttribute("aria-selected"),
        pressed: node.getAttribute("aria-pressed"),
        value: node instanceof HTMLInputElement ? node.value : node.getAttribute("aria-valuenow"),
      }));
      await page.keyboard.press(key);
      await waitForPostInteractionPaint(page);
      const after = await control.evaluate((node) => ({
        state: node.getAttribute("data-state"),
        expanded: node.getAttribute("aria-expanded"),
        checked: node.getAttribute("aria-checked"),
        selected: node.getAttribute("aria-selected"),
        pressed: node.getAttribute("aria-pressed"),
        value: node instanceof HTMLInputElement ? node.value : node.getAttribute("aria-valuenow"),
      }));
      keyboardProbe = { key, before, after };
    }
  }
  const needsInteractiveControl = primitive.implementationKind === "interactive-controller";
  const nameRequired = primitive.accessibility.rules.accessibleName.required && interactiveCount > 0;
  return {
    ok: rootVisible &&
      partCount >= expectedPartCount &&
      (!needsInteractiveControl || interactiveCount > 0) &&
      focusWorked &&
      (!nameRequired || accessibleName.length > 0),
    evidence: {
      action: `${primitive.id}-${primitive.behaviorFamily}-adapter-contract`,
      behaviorFamily: primitive.behaviorFamily,
      rootVisible,
      expectedPartCount,
      partCount,
      interactiveCount,
      focusWorked,
      focusTarget,
      accessibleName,
      keyboardProbe,
    },
  };
}

async function waitForVisualSettle(page) {
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  await page.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready;
  });
}

async function gotoWithTransientNetworkRetry(page, url, options) {
  const attempts = remoteBaseUrl ? 4 : 1;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await page.goto(url, options);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const retryable = message.includes("net::ERR_");
      if (!retryable || attempt === attempts) throw error;

      navigationRetries.push({
        url,
        failedAttempt: attempt,
        message: message.split("\n")[0],
      });
      await page.waitForTimeout(attempt * 2_000);
    }
  }

  throw new Error(`Navigation retry loop exited unexpectedly for ${url}`);
}

async function waitForPostInteractionPaint(page) {
  await page.evaluate(() => new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  }));
  await page.waitForTimeout(120);
}

function contentType(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".js") || filePath.endsWith(".mjs")) return "text/javascript; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".json")) return "application/json; charset=utf-8";
  if (filePath.endsWith(".svg")) return "image/svg+xml";
  if (filePath.endsWith(".png")) return "image/png";
  if (filePath.endsWith(".woff2")) return "font/woff2";
  return "application/octet-stream";
}
