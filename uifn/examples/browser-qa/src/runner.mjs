import { chromium } from "playwright";
import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { parseFilters, routeMatches } from "./filters.mjs";
import { ensureWorkbenchServer } from "./server.mjs";
import { assertA11y } from "./assertions/a11y.mjs";
import { assertNoMajorClipping, visibleBox } from "./assertions/geometry.mjs";
import { exerciseInteractions } from "./assertions/interaction.mjs";
import { assertVisual } from "./assertions/visual.mjs";

const viewports = {
  mobile: { width: 390, height: 844 },
  tablet: { width: 768, height: 1024 },
  desktop: { width: 1280, height: 900 },
};

function buildShared() {
  const result = spawnSync("npm", ["--workspace", "@uifn/examples-shared", "run", "build"], {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      PATH: `/opt/homebrew/opt/node@22/bin:/opt/homebrew/bin:${process.env.PATH ?? ""}`,
    },
  });
  if (result.status !== 0) {
    throw new Error(`examples-shared build failed: ${(result.stderr || result.stdout).split("\n").slice(-8).join("\n")}`);
  }
}

function sanitizeEvidence(input) {
  if (Array.isArray(input)) return input.map((value) => sanitizeEvidence(value));
  if (!input || typeof input !== "object") {
    if (typeof input === "string") {
      return input
        .replace(/\/(?:Users|home|private|tmp|var|Volumes)\/[^\s"',)]+/g, "[REDACTED_LOCAL_PATH]")
        .replace(/[A-Z]:\\[^\s"',)]+/gi, "[REDACTED_LOCAL_PATH]")
        .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[REDACTED_PII]")
        .replace(/\b(?:sk_live|sk_test|ghp_|xox[baprs]-|AKIA)[A-Za-z0-9_-]+\b/g, "[REDACTED]");
    }
    return input;
  }
  return Object.fromEntries(Object.entries(input).map(([key, value]) => {
    if (/^(token|accessToken|refreshToken|idToken|apiKey|uploadUrl)$/i.test(key) || /(secret|password)/i.test(key)) {
      return [key, "[REDACTED]"];
    }
    return [key, sanitizeEvidence(value)];
  }));
}

function fail(failures, code, message, route, framework, evidence = {}, assertionType = "route") {
  failures.push({
    code,
    message,
    slug: route?.slug,
    framework,
    route: route?.path,
    qaCaseId: route?.fixtureId ?? route?.id ?? "route",
    assertionType,
    evidence: sanitizeEvidence(evidence),
  });
}

function finalizeBrowserResult(shared, result) {
  const schemaFailures = shared.validateBrowserQaResult(result);
  if (schemaFailures.length === 0) return result;
  return {
    ...result,
    ok: false,
    failures: [
      ...(Array.isArray(result.failures) ? result.failures : []),
      {
        code: "UIFN_QA_RESULT_SCHEMA_INVALID",
        message: "Browser QA result did not match the versioned result schema.",
        qaCaseId: "result-envelope",
        assertionType: "schema",
        evidence: sanitizeEvidence({ schemaFailures }),
      },
    ],
  };
}

function progress(event) {
  if (process.env.UIFN_BROWSER_PROGRESS === "0") return;
  console.error(JSON.stringify({
    type: "uifn-browser-progress",
    time: new Date().toISOString(),
    ...event,
  }));
}

function artifactStem(framework, route) {
  return `${framework}-${route.path.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "index"}`;
}

async function captureFailureArtifacts(page, framework, route) {
  if (process.env.UIFN_CAPTURE_FAILURE_ARTIFACTS === "0") return [];
  const directory = path.join(process.cwd(), "uifn/.conduct/evidence/browser-qa");
  mkdirSync(directory, { recursive: true });
  const screenshotPath = path.join(directory, `${artifactStem(framework, route)}.png`);
  await page.screenshot({ path: screenshotPath, animations: "disabled", fullPage: true });
  return [path.relative(process.cwd(), screenshotPath)];
}

function failureTracePath(framework, route) {
  const directory = path.join(process.cwd(), "uifn/.conduct/evidence/browser-qa");
  mkdirSync(directory, { recursive: true });
  return path.join(directory, `${artifactStem(framework, route)}-trace.zip`);
}

function routeTimeoutMs(filters) {
  if (Number.isFinite(filters.routeTimeoutMs) && filters.routeTimeoutMs > 0) return Math.floor(filters.routeTimeoutMs);
  const fromEnv = Number(process.env.UIFN_BROWSER_ROUTE_TIMEOUT_MS);
  if (Number.isFinite(fromEnv) && fromEnv > 0) return Math.floor(fromEnv);
  return filters.scope === "visual" ? 180_000 : 75_000;
}

function withRouteTimeout(promise, { route, framework, timeoutMs, theme, viewport }) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error(`Route timed out after ${timeoutMs}ms`);
      error.code = "UIFN_BROWSER_ROUTE_TIMEOUT";
      error.details = {
        route: route?.path,
        slug: route?.slug,
        family: route?.family,
        framework,
        timeoutMs,
        theme,
        viewport,
      };
      reject(error);
    }, timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function runAssertion(name, framework, route, fn) {
  const startedAt = Date.now();
  progress({ phase: "assertion:start", framework, route: route.path, assertion: name });
  try {
    const result = await fn();
    progress({ phase: "assertion:end", framework, route: route.path, assertion: name, durationMs: Date.now() - startedAt, status: "passed" });
    return result;
  } catch (error) {
    progress({ phase: "assertion:end", framework, route: route.path, assertion: name, durationMs: Date.now() - startedAt, status: "failed" });
    throw error;
  }
}

function routeKey(route) {
  return `${route.family}:${route.slug ?? "index"}:${route.path}`;
}

function buildShardManifest(routes, shardCount = 1) {
  const count = Number.isFinite(shardCount) && shardCount > 0 ? Math.floor(shardCount) : 1;
  return Array.from({ length: count }, (_, index) => {
    const shardRoutes = routes.filter((_, routeIndex) => routeIndex % count === index);
    return {
      index,
      count,
      routeCount: shardRoutes.length,
      routes: shardRoutes.map((route) => route.path),
    };
  });
}

function applyShard(routes, filters) {
  const shardCount = Number.isFinite(filters.shardCount) && filters.shardCount > 0 ? Math.floor(filters.shardCount) : 1;
  const shardIndex = Number.isFinite(filters.shardIndex) ? Math.floor(filters.shardIndex) : undefined;
  const manifest = buildShardManifest(routes, shardCount);

  if (shardIndex === undefined) {
    return {
      routes,
      shard: {
        enabled: shardCount > 1,
        index: null,
        count: shardCount,
        routeCount: routes.length,
        manifest: filters.listShards ? manifest : undefined,
      },
    };
  }

  if (shardIndex < 0 || shardIndex >= shardCount) {
    return {
      routes: [],
      shard: {
        enabled: true,
        index: shardIndex,
        count: shardCount,
        routeCount: 0,
        invalid: true,
        manifest: filters.listShards ? manifest : undefined,
      },
    };
  }

  const shardRoutes = routes.filter((_, routeIndex) => routeIndex % shardCount === shardIndex);

  return {
    routes: shardRoutes,
    shard: {
      enabled: shardCount > 1,
      index: shardIndex,
      count: shardCount,
      routeCount: shardRoutes.length,
      manifest: filters.listShards ? manifest : undefined,
    },
  };
}

function summarizeChecks(checks, failures) {
  const byFramework = {};
  const byFamily = {};
  const byStatus = { passed: 0, failed: 0, skipped: 0 };
  for (const check of checks) {
    byStatus[check.status] = (byStatus[check.status] ?? 0) + 1;
    byFramework[check.framework] = (byFramework[check.framework] ?? 0) + 1;
    byFamily[check.family] = (byFamily[check.family] ?? 0) + 1;
  }
  return {
    checkCount: checks.length,
    passed: byStatus.passed,
    failed: byStatus.failed,
    skipped: byStatus.skipped,
    failureCount: failures.length,
    byFramework,
    byFamily,
  };
}

function coverageFor(shared, frameworks, routes, filters, shard) {
  const routeProfiles = new Set(routes.flatMap((route) => [
    route.profile,
    route.contract?.qaProfile,
    ...(route.contract?.qaProfiles ?? []),
  ].filter(Boolean)));
  return {
    frameworks,
    families: [...new Set(routes.map((route) => route.family))].sort(),
    profiles: [...routeProfiles].sort(),
    routes: {
      selected: routes.length,
      totalMatchingBeforeShard: shard.totalMatchingBeforeShard,
      truncatedByMaxRoutes: Boolean(filters.maxRoutes),
    },
    inventory: {
      components: shared.workbenchComponents.length,
      patterns: shared.workbenchPatterns.length,
      sfPanels: shared.workbenchSfPanels.length,
      scenarios: shared.workbenchScenarios?.length ?? 0,
    },
    matrix: {
      themes: filters.scope === "visual"
        ? (filters.theme ? [filters.theme] : [...shared.workbenchThemes])
        : [filters.theme ?? "light"],
      viewports: filters.scope === "visual"
        ? (filters.viewport ? [filters.viewport] : Object.keys(viewports))
        : [filters.viewport ?? "desktop"],
      reducedMotion: true,
      locale: "en-US",
      timezone: "UTC",
      executedCells: frameworks.length *
        routes.length *
        (filters.scope === "visual" ? (filters.theme ? 1 : shared.workbenchThemes.length) : 1) *
        (filters.scope === "visual" ? (filters.viewport ? 1 : Object.keys(viewports).length) : 1),
    },
    shard,
  };
}

function routeSelector(route) {
  if (route.family === "component") return `[data-uifn-component="${route.slug}"]`;
  if (route.family === "pattern") return `[data-uifn-pattern="${route.slug}"]`;
  if (route.family === "sf") return `[data-uifn-sf="${route.slug}"]`;
  return `[data-uifn-scenario="${route.slug}"]`;
}

function assertFixtureContract(route, evidence) {
  if (!route.contract || !route.fixtureId) return undefined;
  const fixture = route.contract.fixtures.find((entry) => entry.id === route.fixtureId);
  if (!fixture) {
    return { ok: false, reason: "fixture-contract-missing", fixtureId: route.fixtureId };
  }
  const actionResults = {
    "hover-root": evidence.interaction?.performed?.includes("hover-root") === true,
    "tab-root": evidence.interaction?.performed?.includes("tab") === true,
    "open-overlay": evidence.overlay?.contentCount > 0,
    "tab-overlay": evidence.overlay?.contentCount > 0,
    "escape-close": evidence.overlay?.dismissal?.escapeClosed === true,
    "reopen-overlay": evidence.overlay?.dismissal?.reopenedAfterEscape === true,
    "outside-click": evidence.overlay?.dismissal?.outsideAttempted === true,
    "cycle-focus-forward": evidence.overlay?.focusTrap?.forwardCycle === true,
    "cycle-focus-backward": evidence.overlay?.focusTrap?.backwardCycle === true,
    "enter-form-value": evidence.form?.changeCount > 0,
    "submit-form": Boolean(evidence.form?.submittedValue),
    "attempt-disabled-input": evidence.form?.disabledStable === true,
    "inspect-invalid-state": evidence.form?.ariaInvalid === "true",
    "exercise-data-rich-workflow": evidence.dataRich?.ok === true,
    "capture-visual": evidence.visual?.nonblank === true,
    "activate-primary-action": evidence.model?.actionFired === true,
    "tab-through-actions": evidence.interaction?.performed?.includes("tab") === true,
    "type-filter": evidence.overlay?.contentCount > 0,
    "keyboard-select": evidence.overlay?.contentCount > 0,
  };
  const behaviorResults = {
    nonblank: evidence.visual?.nonblank === true,
    geometry: evidence.overlay?.collisionCase === fixture.expectedBehavior.geometry,
    escapeCloses: evidence.overlay?.dismissal?.escapeClosed === true,
    outsideClickCloses:
      evidence.overlay?.dismissal?.outsideClosed === fixture.expectedBehavior.outsideClickCloses,
    focusTrap: evidence.overlay?.focusTrap?.forwardCycle === true && evidence.overlay?.focusTrap?.backwardCycle === true,
    focusReturn: evidence.overlay?.dismissal?.focusRestoredAfterEscape === true,
    componentOwnedForm: evidence.form?.componentOwned === true && evidence.form?.formDataValue !== undefined,
    deterministicLargeData: evidence.dataRich?.ok === true,
    status: evidence.model?.status === fixture.expectedBehavior.status,
    usesInjectedClient: evidence.model?.clientType === "fake",
    noLiveNetwork: evidence.network?.liveNetworkCalls === 0,
    contentVisible: evidence.overlay?.contentCount > 0,
    typeahead: evidence.overlay?.contentCount > 0,
  };
  const missingActions = fixture.actions.filter((action) => actionResults[action] !== true);
  const failedBehavior = Object.entries(fixture.expectedBehavior)
    .filter(([key]) => key in behaviorResults && behaviorResults[key] !== true)
    .map(([key]) => key);
  return {
    ok: missingActions.length === 0 && failedBehavior.length === 0,
    fixtureId: fixture.id,
    actions: fixture.actions,
    assertions: fixture.assertions,
    actionResults,
    behaviorResults,
    missingActions,
    failedBehavior,
  };
}

async function navigateToWorkbenchRoute(page, { url, framework, selector }) {
  let lastError;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      if (page.url() !== "about:blank") {
        await page.goto("about:blank", { waitUntil: "commit", timeout: 5_000 });
      }
      await page.goto(url, { waitUntil: "load", timeout: 20_000 });
      await page.waitForSelector(`[data-uifn-workbench="${framework}"][data-uifn-loaded='true']`, { timeout: 10_000 });
      await page.waitForSelector(selector, { timeout: 10_000 });
      await page.evaluate(() => new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(resolve));
      }));
      return { attempts: attempt };
    } catch (error) {
      lastError = error;
      if (attempt < 2) await page.waitForTimeout(100);
    }
  }
  const error = new Error("route rendered no framework-owned component root");
  error.code = "UIFN_BROWSER_ROUTE_BLANK";
  error.details = {
    selector,
    attempts: 2,
    bodyTextLength: await page.locator("body").innerText().then((text) => text.trim().length).catch(() => 0),
    cause: lastError instanceof Error ? lastError.message : String(lastError),
  };
  throw error;
}

function requiresKeyboardEvidence(route) {
  if (route.path.endsWith("/states")) return false;
  const fixture = route.fixtureId
    ? route.contract?.fixtures.find((candidate) => candidate.id === route.fixtureId)
    : undefined;
  if (fixture) {
    if (["control", "form", "overlay", "navigation", "data-rich"].includes(fixture.profile)) return true;
    return fixture.actions.some((action) => /keyboard|cycle-focus/.test(action));
  }
  return route.contract?.requiredInteractions?.some((interaction) => interaction.includes("keyboard")) === true;
}

async function assertRoute(page, baseUrl, framework, route, options) {
  const theme = options.theme ?? "light";
  const viewportId = route.fixtureId === "mobile" ? "mobile" : options.viewportId;
  if (viewportId && viewports[viewportId]) {
    await page.setViewportSize(viewports[viewportId]);
  }
  options.network?.reset(route);
  const url = `${baseUrl}${route.path}?theme=${encodeURIComponent(theme)}`;
  const selector = routeSelector(route);
  await runAssertion("navigate", framework, route, async () => {
    await navigateToWorkbenchRoute(page, { url, framework, selector });
  });
  await runAssertion("root", framework, route, async () => {
    await page.locator(selector).first().scrollIntoViewIfNeeded();
  });
  const rootCount = await page.locator(selector).count();
  const textLength = await page.locator("body").innerText().then((text) => text.trim().length);
  const geometry = await runAssertion("geometry", framework, route, () => assertNoMajorClipping(page, selector, {
    allowVerticalOverflow: route.family === "scenario" || route.profile === "data-rich" || route.fixtureId === "long-content",
  }));
  const rootBox = await runAssertion("root-box", framework, route, () => visibleBox(page, selector));
  const overlay = await runAssertion("overlay", framework, route, () => assertOverlay(page, route, selector));
  const interaction = await runAssertion("interaction", framework, route, () => exerciseInteractions(page, route, selector));
  const form = await runAssertion("form", framework, route, () => assertFormComponent(page, route, selector));
  const dataRich = await runAssertion("data-rich", framework, route, () => assertDataRich(page, route));
  const model = await runAssertion("model", framework, route, () => assertModelCard(page, route, selector));
  const scenario = await runAssertion("scenario", framework, route, () => assertScenarioBehavior(page, route, selector));
  const a11y = await runAssertion("a11y", framework, route, () => assertA11y(page, selector, {
    requiresKeyboard: requiresKeyboardEvidence(route),
  }));
  const visual = await runAssertion("visual", framework, route, () => assertVisual(page, {
    framework,
    family: route.family,
    slug: route.slug,
    route: route.path,
    state: route.fixtureId ?? "default",
    theme,
    viewport: page.viewportSize(),
  }));

  const networkEvidence = options.network?.snapshot(route);
  const measuredModel = model
    ? {
        ...model,
        noLiveNetworkCalls: networkEvidence?.liveNetworkCalls ?? 0,
        networkMeasured: Boolean(networkEvidence),
      }
    : model;

  const evidence = {
    rootCount,
    textLength,
    geometry,
    rootBox,
    ...(overlay ? { overlay } : {}),
    interaction,
    ...(form ? { form } : {}),
    ...(dataRich ? { dataRich } : {}),
    ...(measuredModel ? { model: measuredModel } : {}),
    ...(scenario ? { scenario } : {}),
    a11y,
    visual,
    theme,
    viewport: page.viewportSize(),
    urlPath: route.path,
    network: networkEvidence,
  };
  evidence.contract = assertFixtureContract(route, evidence);
  return evidence;
}

function createNetworkMonitor(page, baseUrl) {
  const baseOrigin = new URL(baseUrl).origin;
  const events = [];
  let routeStart = 0;

  page.on("request", (request) => {
    const url = request.url();
    if (/^(data|blob|about):/i.test(url)) return;
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      return;
    }
    const resourceType = request.resourceType();
    const sameOrigin = parsed.origin === baseOrigin;
    const allowedWorkbenchAsset = sameOrigin && ["document", "script", "stylesheet", "image", "font", "media", "manifest"].includes(resourceType);
    if (allowedWorkbenchAsset) return;
    events.push({
      at: Date.now(),
      type: resourceType,
      method: request.method(),
      origin: parsed.origin,
      pathname: parsed.pathname,
      sameOrigin,
    });
  });

  return {
    reset() {
      routeStart = Date.now();
      events.length = 0;
    },
    snapshot(route) {
      const liveEvents = events.filter((event) => event.at >= routeStart);
      return {
        route: route?.path,
        liveNetworkCalls: liveEvents.length,
        events: liveEvents.slice(0, 20).map(({ at, ...event }) => event),
      };
    },
  };
}

function isOverlayRoute(route) {
  const fixtureProfile = route.fixtureId
    ? route.contract?.fixtures.find((fixture) => fixture.id === route.fixtureId)?.profile
    : undefined;
  return (fixtureProfile ?? route.profile ?? route.contract?.qaProfile) === "overlay";
}

async function assertOverlay(page, route, selector) {
  if (!isOverlayRoute(route)) return undefined;
  const openStateRoot = page.locator(
    `${selector}[data-uifn-part='root'][data-uifn-fixture-id='open']`
  ).first();
  const semanticRoot = page.locator(`${selector}[data-uifn-part='root']`).first();
  const root = await openStateRoot.count()
    ? openStateRoot
    : await semanticRoot.count()
      ? semanticRoot
      : page.locator(selector).first();
  if (!(await root.count())) {
    return { ok: false, reason: "missing-overlay-root" };
  }
  const box = root.locator("xpath=ancestor::*[contains(concat(' ', normalize-space(@class), ' '), ' qa-edge-box ')][1]");
  const fixtureId = route.fixtureId ?? await box.getAttribute("data-case") ?? "default";
  const triggerSelectors = [
    "[data-uifn-part='trigger']",
    "input[role='combobox']",
    "[role='combobox']",
    "[role='menuitem']",
    "button",
  ];
  const matchingRootCount = await page.locator(selector).count();
  const contentSelector = [
    "[data-uifn-part='content']",
    "[data-uifn-part='listbox']",
    "[data-uifn-part='menu']:not([role='none'])",
    "[data-uifn-combobox-content]",
    "[role='dialog']",
    "[role='alertdialog']",
    "[role='menu']",
    "[role='listbox']",
    "[role='tooltip']",
  ].join(", ");
  let trigger = root.locator(triggerSelectors.at(-1)).first();
  for (const triggerSelector of triggerSelectors) {
    const candidate = root.locator(triggerSelector).first();
    if (await candidate.count() && await candidate.isVisible()) {
      trigger = candidate;
      break;
    }
  }
  const locateContent = async () => {
    const associatedId =
      await trigger.getAttribute("aria-controls") ??
      await trigger.getAttribute("aria-describedby");
    if (associatedId) {
      const associated = page.locator(`[id="${associatedId.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"]`).first();
      if (await associated.count()) return associated;
    }
    const rooted = root.locator(contentSelector).first();
    if (await rooted.count()) return rooted;
    return matchingRootCount === 1
      ? page.locator(contentSelector).first()
      : page.locator("[data-uifn-no-associated-overlay-content]").first();
  };
  const openOverlay = async () => {
    if (route.slug === "context-menu") {
      await trigger.click({ button: "right" });
    } else if (route.slug === "hover-card" || route.slug === "tooltip") {
      await page.mouse.move(1, 1);
      await trigger.hover({ force: true });
      await page.waitForTimeout(250);
    } else {
      await trigger.click();
    }
  };
  let content = await locateContent();
  const triggerCount = await trigger.count();
  if (!triggerCount) return { ok: false, reason: "missing-trigger", triggerCount: 0 };
  if (fixtureId === "scroll-container" && await box.count()) {
    await box.evaluate((node) => {
      node.scrollTop = node.scrollHeight;
    });
  }
  if (!(await content.count()) || !(await content.isVisible())) {
    await openOverlay();
    await page.waitForTimeout(50);
    content = await locateContent();
  }
  const contentCount = await content.count();
  if (!contentCount || !(await content.isVisible())) {
    return { ok: false, reason: "content-did-not-open", triggerCount, contentCount };
  }
  await page.evaluate(() => new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  }));

  const triggerBox = await trigger.boundingBox();
  const contentBox = await content.boundingBox();
  const boundaryBox = await box.boundingBox();
  const viewport = page.viewportSize();
  const insideViewport = Boolean(contentBox && viewport &&
    contentBox.x >= -1 &&
    contentBox.y >= -1 &&
    contentBox.x + contentBox.width <= viewport.width + 1 &&
    contentBox.y + contentBox.height <= viewport.height + 1);
  const viewportBoundedOverlay =
    [
      "alert-dialog",
      "combobox",
      "context-menu",
      "dialog",
      "dropdown-menu",
      "hover-card",
      "menubar",
      "popover",
      "select",
      "sheet",
      "tooltip",
    ].includes(route.slug);
  const insideBoundary = viewportBoundedOverlay
    ? insideViewport
    : Boolean(contentBox && boundaryBox &&
        contentBox.x >= boundaryBox.x - 1 &&
        contentBox.y >= boundaryBox.y - 1 &&
        contentBox.x + contentBox.width <= boundaryBox.x + boundaryBox.width + 1 &&
        contentBox.y + contentBox.height <= boundaryBox.y + boundaryBox.height + 1);
  const fixtureMatches =
    !route.fixtureId ||
    await box.getAttribute("data-uifn-collision-case") === fixtureId;
  const [ariaControls, ariaDescribedBy, ariaExpanded, contentId, contentRole, contentAlign] = await Promise.all([
    trigger.getAttribute("aria-controls"),
    trigger.getAttribute("aria-describedby"),
    trigger.getAttribute("aria-expanded"),
    content.getAttribute("id"),
    content.getAttribute("role"),
    content.getAttribute("data-align"),
  ]);
  const controlsMatch = route.slug === "tooltip"
    ? Boolean(ariaDescribedBy && contentId && ariaDescribedBy === contentId)
    : Boolean(ariaControls && contentId && ariaControls === contentId);
  const expandedMatch = route.slug === "tooltip" || ariaExpanded === "true";
  const alignmentDelta = triggerBox && contentBox
    ? contentAlign === "center"
      ? Math.abs(
          (contentBox.x + contentBox.width / 2) -
          (triggerBox.x + triggerBox.width / 2)
        )
      : Math.min(
          Math.abs(contentBox.x - triggerBox.x),
          Math.abs((contentBox.x + contentBox.width) - (triggerBox.x + triggerBox.width))
        )
    : Number.POSITIVE_INFINITY;
  const anchoredOverlaySlugs = new Set(["combobox", "dropdown-menu", "hover-card", "menubar", "popover", "select", "tooltip"]);
  const alignmentRequired =
    Boolean(route.fixtureId) &&
    anchoredOverlaySlugs.has(route.slug) &&
    ["default", "default-placement", "edge-top-left", "edge-top-right", "edge-bottom-left", "edge-bottom-right"].includes(fixtureId);
  const nestedOverlay = fixtureId === "nested-overlay"
    ? await content.locator("[data-uifn-nested-overlay] [role='menu']").isVisible()
    : true;
  const longContentProbe = content.locator("[data-uifn-long-content]").first();
  const longContentMetrics = fixtureId === "long-content" && (await longContentProbe.count()) > 0
    ? await longContentProbe.evaluate((node) => {
      const parent = node.parentElement;
      return parent ? {
        probeConnected: node.isConnected,
        probeTextLength: (node.textContent ?? "").length,
        clientHeight: parent.clientHeight,
        scrollHeight: parent.scrollHeight,
        overflowY: getComputedStyle(parent).overflowY,
      } : null;
    })
    : null;
  const longContentScrollable = fixtureId === "long-content"
    ? Boolean(longContentMetrics && longContentMetrics.scrollHeight > longContentMetrics.clientHeight)
    : true;
  const mobileViewport = fixtureId === "mobile" ? viewport?.width === viewports.mobile.width : true;

  let focusTrap;
  if (fixtureId === "focus-trap") {
    const focusables = content.locator("button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])");
    const focusableCount = await focusables.count();
    const first = focusables.first();
    const last = focusables.nth(Math.max(0, focusableCount - 1));
    const locked = await page.locator("body").getAttribute("data-uifn-scroll-locked");
    await last.focus();
    await page.keyboard.press("Tab");
    const forwardCycle = await first.evaluate((node) => document.activeElement === node);
    await page.keyboard.press("Shift+Tab");
    const backwardCycle = await last.evaluate((node) => document.activeElement === node);
    focusTrap = { locked, focusableCount, forwardCycle, backwardCycle };
  } else {
    const focusable = content.locator("button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex='-1'])").first();
    if (await focusable.count()) await focusable.focus();
    await page.keyboard.press("Tab");
  }

  if (fixtureId !== "focus-trap") await trigger.focus();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(75);
  content = await locateContent();
  const escapeClosed = !(await content.count()) || !(await content.isVisible());
  let focusRestoredAfterEscape = await trigger.evaluate((node) => document.activeElement === node);
  for (let attempt = 0; !focusRestoredAfterEscape && attempt < 10; attempt += 1) {
    await page.waitForTimeout(25);
    focusRestoredAfterEscape = await trigger.evaluate((node) => document.activeElement === node);
  }
  if (!focusRestoredAfterEscape) {
    focusRestoredAfterEscape = await root.evaluate((node) => {
      const active = document.activeElement;
      return active instanceof HTMLElement &&
        node.contains(active) &&
        active.getAttribute("data-uifn-part") === "trigger";
    });
  }
  const activeAfterEscape = await page.evaluate(() => {
    const active = document.activeElement;
    return active instanceof HTMLElement
      ? {
          tag: active.tagName.toLowerCase(),
          role: active.getAttribute("role"),
          part: active.getAttribute("data-uifn-part"),
          component: active.getAttribute("data-uifn-component"),
          text: (active.textContent ?? "").trim().slice(0, 80),
        }
      : null;
  });

  await openOverlay();
  await page.waitForTimeout(75);
  content = await locateContent();
  const reopenedAfterEscape = Boolean(await content.count()) && await content.isVisible();
  const outsideShouldClose = route.slug !== "alert-dialog";
  let outsideAttempted = false;
  let outsideClosed = false;
  if (reopenedAfterEscape) {
    const backdrop = page.locator("[data-uifn-part='overlay']:visible").first();
    if (await backdrop.count()) {
      await backdrop.click({ position: { x: 2, y: 2 }, timeout: 5_000, force: true });
    } else {
      const outsidePoints = viewport
        ? [
            { x: 2, y: 2 },
            { x: viewport.width - 2, y: 2 },
            { x: 2, y: viewport.height - 2 },
            { x: viewport.width - 2, y: viewport.height - 2 },
          ]
        : [{ x: 2, y: 2 }];
      const outsidePoint = outsidePoints.find((point) =>
        !contentBox ||
        point.x < contentBox.x ||
        point.x > contentBox.x + contentBox.width ||
        point.y < contentBox.y ||
        point.y > contentBox.y + contentBox.height
      ) ?? outsidePoints[0];
      await page.mouse.click(outsidePoint.x, outsidePoint.y);
    }
    outsideAttempted = true;
    await page.waitForTimeout(75);
    content = await locateContent();
    outsideClosed = !(await content.count()) || !(await content.isVisible());
    if (!outsideClosed) {
      await page.keyboard.press("Escape");
      await page.waitForTimeout(75);
    }
  }
  await trigger.evaluate((node) => {
    const controlledId = node.getAttribute("aria-controls");
    if (controlledId && !document.getElementById(controlledId)) {
      node.removeAttribute("aria-controls");
    }
  });
  const outsideBehaviorOk = outsideAttempted && outsideClosed === outsideShouldClose;
  const geometryCase = route.contract?.fixtures.find((fixture) => fixture.id === fixtureId)?.expectedBehavior?.geometry ?? fixtureId;
  return {
    ok: contentCount > 0 &&
      fixtureMatches &&
      insideViewport &&
      insideBoundary &&
      controlsMatch &&
      expandedMatch &&
      (!alignmentRequired || alignmentDelta <= 8) &&
      escapeClosed &&
      focusRestoredAfterEscape &&
      reopenedAfterEscape &&
      outsideBehaviorOk &&
      nestedOverlay &&
      longContentScrollable &&
      mobileViewport &&
      (fixtureId !== "focus-trap" || (
        focusTrap?.locked === "true" &&
        focusTrap.forwardCycle === true &&
        focusTrap.backwardCycle === true
      )),
    triggerCount,
    contentCount,
    fixtureMatches,
    collisionCase: geometryCase,
    triggerBox,
    contentBox,
    boundaryBox,
    viewport,
    placement: {
      insideViewport,
      insideBoundary,
      alignmentDeltaPx: Math.round(alignmentDelta),
      tolerancePx: 8,
      alignmentRequired,
    },
    association: { ariaControls, ariaDescribedBy, ariaExpanded, contentId, contentRole, contentAlign, controlsMatch },
    dismissal: {
      escapeClosed,
      focusRestoredAfterEscape,
      activeAfterEscape,
      reopenedAfterEscape,
      outsideAttempted,
      outsideClosed,
      outsideShouldClose,
      outsideBehaviorOk,
    },
    focusTrap,
    nestedOverlay,
    longContentScrollable,
    longContentMetrics,
    mobileViewport,
  };
}

async function assertFormComponent(page, route, selector) {
  if (route.fixtureId !== "form-submit") return undefined;
  const root = page.locator(selector).first();
  if (!(await root.count())) {
    return { ok: false, reason: "missing-component-root", componentOwned: false };
  }
  const form = page.locator("[data-uifn-form-harness]").first();
  const controlSelector = [
    "input:not([hidden]):not([type='hidden']):not([aria-hidden='true']):not([tabindex='-1'])",
    "textarea:not([hidden]):not([aria-hidden='true']):not([tabindex='-1'])",
    "select:not([hidden]):not([aria-hidden='true']):not([tabindex='-1'])",
  ].join(", ");
  const rootIsControl = await root.evaluate((node, candidateSelector) => node.matches(candidateSelector), controlSelector);
  const ownedControl = page.locator(
    `:is(input:not([hidden]):not([type='hidden']):not([aria-hidden='true']):not([tabindex='-1']), textarea:not([hidden]):not([aria-hidden='true']):not([tabindex='-1']), select:not([hidden]):not([aria-hidden='true']):not([tabindex='-1']))[data-uifn-component-owner="${route.slug}"]`
  ).first();
  const control = rootIsControl
    ? root
    : (await ownedControl.count())
      ? ownedControl
      : root.locator(controlSelector).first();
  if (!(await form.count()) || !(await control.count())) {
    return {
      ok: false,
      reason: "missing-component-owned-form-control",
      componentOwned: false,
      formCount: await form.count(),
      controlCount: await control.count(),
    };
  }

  const containedByRoot = await control.evaluate((node, rootNode) => rootNode.contains(node), await root.elementHandle());
  const componentOwned = containedByRoot || await control.getAttribute("data-uifn-component-owner") === route.slug;
  const controlType = await control.evaluate((node) => node instanceof HTMLInputElement ? node.type : node.tagName.toLowerCase());
  let expectedValue;
  if (controlType === "checkbox" || controlType === "radio") {
    const initiallyChecked = await control.isChecked();
    await control.click();
    expectedValue = "on";
    if (await control.isChecked() === initiallyChecked) {
      return { ok: false, reason: "checked-state-did-not-change", componentOwned, controlType };
    }
  } else if (controlType === "select") {
    await control.selectOption("beta");
    expectedValue = "beta";
  } else if (controlType === "range") {
    await control.fill("70");
    expectedValue = "70";
  } else {
    await control.fill("123456");
    expectedValue = "123456";
  }

  const valueAfterInput = controlType === "checkbox" || controlType === "radio"
    ? String(await control.isChecked())
    : await control.inputValue();
  const callbackValue = await root.getAttribute("data-uifn-callback-value");
  const domValue = await root.getAttribute("data-uifn-dom-value");
  const changeCount = Number(await root.getAttribute("data-uifn-change-count") ?? 0);
  await form.locator("[data-uifn-action='form-submit']").click();
  const submittedValue = await form.locator("[data-uifn-form-result]").getAttribute("data-submitted-value");

  const disable = form.locator("[data-uifn-action='form-disable']");
  await disable.click();
  const valueBeforeDisabledAttempt = controlType === "checkbox" || controlType === "radio"
    ? String(await control.isChecked())
    : await control.inputValue();
  let disabledRejected = false;
  try {
    if (controlType === "checkbox" || controlType === "radio") await control.click({ timeout: 800 });
    else await control.fill("654321", { timeout: 800 });
  } catch {
    disabledRejected = true;
  }
  const valueAfterDisabledAttempt = controlType === "checkbox" || controlType === "radio"
    ? String(await control.isChecked())
    : await control.inputValue();
  const disabledStable = disabledRejected && valueBeforeDisabledAttempt === valueAfterDisabledAttempt;
  await disable.click();

  const invalidate = form.locator("[data-uifn-action='form-invalid']");
  await invalidate.click();
  const ariaInvalid = await control.getAttribute("aria-invalid");
  const rootAriaInvalid = await root.getAttribute("aria-invalid");
  await invalidate.click();

  return {
    ok: componentOwned &&
      changeCount > 0 &&
      domValue === valueAfterInput &&
      callbackValue === valueAfterInput &&
      submittedValue === expectedValue &&
      disabledStable &&
      ariaInvalid === "true" &&
      rootAriaInvalid === "true",
    componentOwned,
    controlType,
    expectedValue,
    valueAfterInput,
    domValue,
    callbackValue,
    changeCount,
    submittedValue,
    formDataValue: submittedValue,
    disabledRejected,
    disabledStable,
    valueBeforeDisabledAttempt,
    valueAfterDisabledAttempt,
    ariaInvalid,
    rootAriaInvalid,
  };
}

async function assertModelCard(page, route, selector) {
  if (route.family !== "pattern" && route.family !== "sf") return undefined;
  const root = page.locator(selector).first();
  if (!(await root.count())) return { ok: false, reason: "missing-model-root" };
  const action = root.locator("[data-uifn-action='primary']").first();
  if (await action.count()) await action.click();
  const modelEvidence = await root.evaluate((node) => {
    const metadata = Object.fromEntries(Array.from(node.querySelectorAll("dt")).map((term) => {
      const value = term.nextElementSibling?.textContent ?? "";
      return [term.textContent ?? "", value];
    }));
    return {
      ok: true,
      status: node.getAttribute("data-status"),
      dataItemCount: Number(node.getAttribute("data-item-count") ?? 0),
      callbackCount: Number(node.getAttribute("data-callback-count") ?? 0),
      callbacks: (node.getAttribute("data-callbacks") ?? "").split(",").filter(Boolean),
      productItemCount: node.querySelectorAll("[data-uifn-product-item]").length,
      productDetailsCount: node.querySelectorAll("[data-uifn-product-data] dt").length,
      hasProductState: Boolean(node.querySelector("[data-uifn-product-state], [data-uifn-empty-state]")),
      backendImportCount: Number(node.getAttribute("data-backend-import-count") ?? 0),
      actionsVisible: Boolean(node.querySelector("[data-uifn-action]")),
      actionFired: node.getAttribute("data-uifn-action-fired") === "true",
      callbackInvocations: Number(node.getAttribute("data-uifn-callback-invocations") ?? 0),
      lastCallback: node.getAttribute("data-uifn-last-callback"),
      actionResult: node.querySelector("[data-uifn-action-result]")?.textContent ?? null,
      clientType: node.getAttribute("data-uifn-meta-client-type") ?? (metadata.usesInjectedClient === "true" ? "fake" : undefined),
      clientCallCount: Number(node.getAttribute("data-uifn-meta-client-call-count") ?? 0),
      usesInjectedClient: metadata.usesInjectedClient,
      metadata,
    };
  });
  const productDataRendered = modelEvidence.productItemCount > 0 || modelEvidence.productDetailsCount > 0 || modelEvidence.hasProductState;
  return {
    ...modelEvidence,
    productDataRendered,
    noBackendImports: modelEvidence.backendImportCount === 0,
    ok: modelEvidence.ok &&
      productDataRendered &&
      modelEvidence.backendImportCount === 0 &&
      modelEvidence.actionsVisible &&
      modelEvidence.actionFired &&
      modelEvidence.callbackInvocations > 0 &&
      modelEvidence.actionResult?.startsWith("callback:") === true,
    ...(route.family === "sf" ? { sfCallCount: modelEvidence.clientCallCount } : {}),
  };
}

async function assertDataRich(page, route) {
  if (route.fixtureId !== "large-data") return undefined;
  const selector = routeSelector(route);
  const root = page.locator(selector).first();
  if (!(await root.count())) {
    return { ok: false, reason: "missing-component-root", componentOwned: false };
  }
  const slug = route.slug;
  const base = await root.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    return {
      componentOwned: true,
      textLength: (node.textContent ?? "").trim().length,
      box: { width: Math.round(rect.width), height: Math.round(rect.height) },
    };
  });

  if (slug === "data-table") {
    const controls = page.locator("[data-uifn-data-controls='data-table']").first();
    const sort = controls.locator("[data-uifn-action='data-sort']");
    const filter = controls.locator("[data-uifn-action='data-filter']");
    await sort.click();
    await filter.fill("Row 42");
    const row42 = root.locator("[data-row-id='row-42']");
    if (!(await row42.count()) || !(await row42.isVisible())) {
      return { ok: false, reason: "row-42-not-visible-after-filter", ...base };
    }
    await row42.focus();
    await page.keyboard.press("Space");
    const evidence = await root.evaluate((node) => {
      const visibleRows = Array.from(node.querySelectorAll("[data-row-id]")).filter((row) => {
        const element = row;
        return !element.hidden && window.getComputedStyle(element).display !== "none";
      });
      const selected = node.querySelector("[data-row-id][data-selected='true']");
      const selectedBox = selected?.getBoundingClientRect();
      return {
        totalRows: Number(node.getAttribute("data-total-rows") ?? 0),
        filteredRows: Number(node.getAttribute("data-filtered-rows") ?? 0),
        renderedRows: node.querySelectorAll("[data-row-id]").length,
        visibleRows: visibleRows.length,
        selectedRow: node.getAttribute("data-selected-row"),
        selectedBox: selectedBox ? { width: Math.round(selectedBox.width), height: Math.round(selectedBox.height) } : null,
        sort: node.getAttribute("data-sort"),
        ariaSort: node.querySelector("[data-column-id='score']")?.getAttribute("aria-sort"),
      };
    });
    return {
      ok: evidence.totalRows >= 250 &&
        evidence.filteredRows === 1 &&
        evidence.visibleRows === 1 &&
        evidence.selectedRow === "row-42" &&
        evidence.sort === "score-desc" &&
        evidence.ariaSort === "descending" &&
        evidence.selectedBox?.width > 0 &&
        evidence.selectedBox?.height > 0,
      ...base,
      dataTable: evidence,
      virtualizedBlankSpace: false,
    };
  }

  if (slug === "calendar" || slug === "date-picker") {
    if (slug === "date-picker") {
      const trigger = root.locator("[data-uifn-part='trigger'], [aria-haspopup='dialog']").first();
      if (await trigger.count() && await trigger.getAttribute("aria-expanded") !== "true") {
        await trigger.click();
        await page.waitForTimeout(50);
      }
    }
    const before = await root.getAttribute("data-focused-date");
    await root.focus();
    await page.keyboard.press("ArrowRight");
    await page.evaluate(() => new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    }));
    const focusedDate = await root.getAttribute("data-focused-date");
    const controlled = root.locator("[aria-controls]").first();
    const controlledId = await controlled.count()
      ? await controlled.getAttribute("aria-controls")
      : null;
    const focusedCell = focusedDate
      ? (controlledId
          ? page.locator(`[id="${controlledId.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"] [data-date="${focusedDate}"]`).first()
          : root.locator(`[data-date="${focusedDate}"]`).first())
      : null;
    if (focusedCell && await focusedCell.count() && await focusedCell.isVisible()) {
      await focusedCell.press("Enter");
    } else {
      await root.press("Enter");
    }
    if (
      await root.getAttribute("data-value") !==
      await root.getAttribute("data-focused-date")
    ) {
      await root.press("Enter");
    }
    await page.evaluate(() => new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    }));
    const calendar = await root.evaluate((node) => {
      const controlledId = node.querySelector("[aria-controls]")?.getAttribute("aria-controls");
      const scope = controlledId ? document.getElementById(controlledId) ?? node : node;
      return {
        before: node.getAttribute("data-value"),
        value: node.getAttribute("data-value"),
        focusedDate: node.getAttribute("data-focused-date"),
        min: node.getAttribute("data-min"),
        max: node.getAttribute("data-max"),
        locale: node.getAttribute("data-locale"),
        timeZone: node.getAttribute("data-time-zone"),
        pickerOpen: node.getAttribute("data-state-open"),
        selectedCells: scope.querySelectorAll("[aria-selected='true']").length,
        disabledSelected: scope.querySelector("[role='gridcell'][aria-disabled='true'][aria-selected='true']") !== null,
      };
    });
    return {
      ok: Boolean(
        before &&
        calendar.focusedDate &&
        calendar.focusedDate !== before &&
        (!calendar.min || calendar.focusedDate >= calendar.min) &&
        (!calendar.max || calendar.focusedDate <= calendar.max) &&
        calendar.value === calendar.focusedDate &&
        calendar.locale === "en-US" &&
        calendar.timeZone === "UTC" &&
        (calendar.selectedCells > 0 || (slug === "date-picker" && calendar.pickerOpen === "false")) &&
        !calendar.disabledSelected
      ),
      ...base,
      calendar,
    };
  }

  if (slug === "command") {
    const search = page.locator("[data-uifn-action='command-filter']").first();
    await search.fill("Archive");
    await search.press("ArrowDown");
    await search.press("Enter");
    const command = await root.evaluate((node) => ({
      filteredOptions: Number(node.getAttribute("data-filtered-options") ?? 0),
      highlightedOption: node.getAttribute("data-highlighted-option"),
      selectedOption: node.getAttribute("data-selected-option"),
      disabledOptions: node.querySelectorAll("[role='option'][aria-disabled='true']").length,
    }));
    return {
      ok: command.filteredOptions === 1 && command.selectedOption === "Archive Project" && command.highlightedOption === "Archive Project",
      ...base,
      command,
    };
  }

  if (slug === "resizable") {
    const handle = root.locator("[data-uifn-part='handle'], [role='separator']").first();
    const before = Number(await handle.getAttribute("aria-valuenow"));
    await handle.dispatchEvent("pointerdown", { pointerId: 1 });
    const afterPointer = Number(await handle.getAttribute("aria-valuenow"));
    await handle.focus();
    await page.keyboard.press("ArrowRight");
    const afterKeyboard = Number(await handle.getAttribute("aria-valuenow"));
    const min = Number(await handle.getAttribute("aria-valuemin"));
    const max = Number(await handle.getAttribute("aria-valuemax"));
    const resizable = {
      before,
      afterPointer,
      afterKeyboard,
      min,
      max,
      source: await root.getAttribute("data-resize-source"),
      orientation: await root.getAttribute("data-orientation"),
      nested: await root.getAttribute("data-nested"),
      panels: await root.locator("[data-uifn-part='panel']").count(),
    };
    return {
      ok: resizable.panels >= 2 &&
        afterPointer !== before &&
        afterKeyboard !== afterPointer &&
        afterKeyboard >= min &&
        afterKeyboard <= max &&
        resizable.source === "keyboard" &&
        resizable.nested === "true",
      ...base,
      resizable,
    };
  }

  if (slug === "sidebar") {
    const toggle = page.locator("[data-uifn-action='sidebar-toggle']").first();
    const before = await root.getAttribute("data-collapsed");
    await toggle.click();
    const collapsed = await root.getAttribute("data-collapsed");
    const persisted = await page.evaluate(() => localStorage.getItem("uifn-workbench-sidebar-collapsed"));
    const originalViewport = page.viewportSize();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => window.dispatchEvent(new Event("resize")));
    const mobileMode = await root.getAttribute("data-mode");
    if (originalViewport) await page.setViewportSize(originalViewport);
    const nested = root.locator("[data-sidebar-item='members']").first();
    await nested.focus();
    const focusedPath = await root.getAttribute("data-focused-path");
    const sidebar = {
      before,
      collapsed,
      persisted,
      mobileMode,
      focusedPath,
      items: await root.locator("[data-sidebar-item]").count(),
    };
    return {
      ok: before !== collapsed &&
        persisted === collapsed &&
        mobileMode === "mobile" &&
        focusedPath === "/settings/members" &&
        sidebar.items >= 3,
      ...base,
      sidebar,
    };
  }

  const scrollBefore = await root.evaluate((node) => node.scrollTop);
  await root.evaluate((node) => {
    node.scrollTop = node.scrollHeight;
  });
  const scrollAfter = await root.evaluate((node) => node.scrollTop);
  return {
    ok: base.textLength > 0 && base.box.width > 0 && base.box.height > 0 && scrollAfter >= scrollBefore,
    ...base,
    scroll: { before: scrollBefore, after: scrollAfter },
  };
}

async function assertScenarioBehavior(page, route, selector) {
  if (route.family !== "scenario") return undefined;
  const root = page.locator(selector).first();
  if (!(await root.count())) return { ok: false, reason: "missing-scenario-root" };
  const workflow = root.locator("[data-uifn-scenario-workflow]").first();
  if (!(await workflow.count())) return { ok: false, reason: "missing-product-workflow" };
  const textInput = workflow.locator("input:not([type='checkbox']):not([type='file']), textarea").first();
  if (await textInput.count()) await textInput.fill("uifn product workflow");
  const filter = workflow.locator("[data-uifn-action='scenario-filter']").first();
  if (await filter.count()) await filter.fill("API");
  const action = root.locator("[data-uifn-action='scenario-primary']").first();
  const actionCount = await action.count();
  if (actionCount) await action.click();
  return await root.evaluate((node) => {
    const componentCount = new Set(Array.from(node.querySelectorAll("[data-uifn-component-use]")).map((entry) => entry.getAttribute("data-uifn-component-use"))).size;
    const patternCount = node.querySelectorAll("[data-uifn-scenario-pattern]").length;
    const sfCount = node.querySelectorAll("[data-uifn-scenario-sf]").length;
    const state = node.querySelector("[data-uifn-scenario-state]")?.textContent ?? null;
    const workflow = node.querySelector("[data-uifn-scenario-workflow]");
    const interactiveControls = workflow?.querySelectorAll("button, input, select, textarea, a").length ?? 0;
    const qaLinkCount = node.querySelectorAll("[data-uifn-scenario-qa-link]").length;
    return {
      ok: componentCount > 0 &&
        patternCount > 0 &&
        sfCount > 0 &&
        interactiveControls >= 3 &&
        qaLinkCount >= componentCount &&
        node.getAttribute("data-uifn-scenario-fired") === "true" &&
        node.getAttribute("data-uifn-workflow-state") === "saved" &&
        state === "saved",
      componentCount,
      patternCount,
      sfCount,
      interactiveControls,
      qaLinkCount,
      actionFired: node.getAttribute("data-uifn-scenario-fired") === "true",
      workflowState: node.getAttribute("data-uifn-workflow-state"),
      state,
    };
  });
}

async function assertVisualVariant(page, baseUrl, framework, route, theme, viewportId) {
  await page.setViewportSize(viewports[viewportId]);
  const url = `${baseUrl}${route.path}?theme=${encodeURIComponent(theme)}`;
  const selector = routeSelector(route);
  await navigateToWorkbenchRoute(page, { url, framework, selector });
  await page.locator(selector).first().evaluate((node) => {
    node.scrollIntoView({ block: "start", inline: "nearest", behavior: "instant" });
  });
  await page.mouse.move(0, 0);
  await page.evaluate(async () => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    await document.fonts?.ready;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  const geometry = await assertNoMajorClipping(page, selector, {
    allowVerticalOverflow: route.profile === "data-rich" || route.family !== "component",
  });
  const a11y = await assertA11y(page, selector, {
    requiresKeyboard: requiresKeyboardEvidence(route),
  });
  const visual = await assertVisual(page, {
    framework,
    family: route.family,
    slug: route.slug,
    route: route.path,
    state: route.fixtureId ?? "default",
    theme,
    viewport: page.viewportSize(),
    requireBaseline: true,
  });
  return { geometry, a11y, visual };
}

async function runVisualMatrix(page, baseUrl, framework, route, themes, viewportIds) {
  const entries = [];
  const configuredTimeout = Number(process.env.UIFN_VISUAL_CELL_TIMEOUT_MS);
  const timeoutMs = Number.isFinite(configuredTimeout) && configuredTimeout > 0 ? Math.floor(configuredTimeout) : 30_000;
  for (const theme of themes) {
    for (const viewportId of viewportIds) {
      const evidence = await withRouteTimeout(
        assertVisualVariant(page, baseUrl, framework, route, theme, viewportId),
        { route, framework, timeoutMs, theme, viewport: viewportId }
      );
      entries.push({
        theme,
        viewport: viewportId,
        screenshotBytes: evidence.visual.screenshotBytes,
        screenshotHash: evidence.visual.screenshotHash,
        nonblank: evidence.visual.nonblank,
        clippingOk: evidence.visual.clipping?.ok,
        textOverlapOk: evidence.visual.textOverlap?.ok,
        themeTokensOk: evidence.visual.themeTokens?.ok,
        baselineOk: evidence.visual.baseline?.ok,
        baselineStatus: evidence.visual.baseline?.status,
        baseline: evidence.visual.baseline,
        geometryOk: evidence.geometry.ok,
        a11yOk: evidence.a11y.ok,
        a11yViolations: evidence.a11y.violationCount,
      });
    }
  }
  return entries;
}

async function newFrameworkBrowserPage(options) {
  let lastError;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage(options);
      return { browser, page };
    } catch (error) {
      lastError = error;
      await browser.close().catch(() => undefined);
    }
  }

  throw lastError;
}

export async function runBrowserQa({ command, argv }) {
  buildShared();
  const shared = await import(path.join(process.cwd(), "uifn/examples/shared/dist/index.js"));
  const filters = parseFilters(argv);
  const frameworks = filters.framework ? [filters.framework] : [...shared.workbenchFrameworks];
  const timeoutMs = routeTimeoutMs(filters);
  let routes = shared.workbenchRoutes.filter((route) => routeMatches(route, filters));
  if (!routes.length && filters.route) {
    routes = shared.workbenchRoutes.filter((route) => route.path === filters.route);
  }
  const totalMatchingBeforeShard = routes.length;
  const sharded = applyShard(routes, filters);
  routes = sharded.routes;
  sharded.shard.totalMatchingBeforeShard = totalMatchingBeforeShard;
  if (filters.listShards) {
    const coverage = coverageFor(shared, frameworks, routes, filters, sharded.shard);
    return finalizeBrowserResult(shared, {
      ok: !sharded.shard.invalid,
      command,
      schemaVersion: 1,
      mode: "list-shards",
      frameworkCount: frameworks.length,
      componentCount: shared.workbenchComponents.length,
      patternCount: shared.workbenchPatterns.length,
      sfPanelCount: shared.workbenchSfPanels.length,
      routeCount: routes.length,
      coverage,
      checks: [],
      failures: sharded.shard.invalid ? [{
        code: "UIFN_BROWSER_SHARD_INVALID",
        message: "Shard index must be within shard count.",
        qaCaseId: "shard",
        assertionType: "filter",
        evidence: sharded.shard,
      }] : [],
      artifacts: [],
      summary: { checkCount: 0, passed: 0, failed: 0, skipped: 0, failureCount: sharded.shard.invalid ? 1 : 0 },
    });
  }
  if (Number.isFinite(filters.maxRoutes) && filters.maxRoutes > 0) {
    routes = routes.slice(0, filters.maxRoutes);
    sharded.shard.truncatedByMaxRoutes = true;
    sharded.shard.routeCount = routes.length;
  }
  if (!routes.length) {
    const coverage = coverageFor(shared, frameworks, routes, filters, sharded.shard);
    return finalizeBrowserResult(shared, {
      ok: false,
      command,
      schemaVersion: 1,
      mode: filters.scope ?? "full",
      frameworkCount: frameworks.length,
      componentCount: shared.workbenchComponents.length,
      patternCount: shared.workbenchPatterns.length,
      sfPanelCount: shared.workbenchSfPanels.length,
      routeCount: 0,
      coverage,
      checks: [],
      failures: [{
        code: "UIFN_BROWSER_NO_ROUTES",
        message: "No Workbench routes matched filters.",
        qaCaseId: "route-filter",
        assertionType: "filter",
        evidence: filters,
      }],
      artifacts: [],
      summary: { checkCount: 0, passed: 0, failed: 0, skipped: 0, failureCount: 1 },
    });
  }

  const checks = [];
  const failures = [];
  const artifacts = [];

  for (const framework of frameworks) {
    let server;
    let browser;
    let page;
    try {
      progress({ phase: "framework:start", framework, routeCount: routes.length });
      server = await ensureWorkbenchServer(framework);
      progress({ phase: "server:start", framework, baseUrl: server.baseUrl });
        ({ browser, page } = await newFrameworkBrowserPage({
          viewport: viewports[filters.viewport ?? "desktop"],
          reducedMotion: "reduce",
          locale: "en-US",
          timezoneId: "UTC",
        }));
        const traceEnabled = process.env.UIFN_CAPTURE_TRACES === "1";
        if (traceEnabled) await page.context().tracing.start({ screenshots: true, snapshots: true });
        const network = createNetworkMonitor(page, server.baseUrl);

        for (const route of routes) {
          const id = `${framework}:${route.path}`;
          let traceChunkOpen = false;
          try {
            if (traceEnabled) {
              await page.context().tracing.startChunk({ title: id });
              traceChunkOpen = true;
            }
            progress({ phase: "route:start", framework, route: route.path, family: route.family, slug: route.slug });
            const evidence = filters.scope === "visual"
              ? {
                  visualMatrix: await runVisualMatrix(
                    page,
                    server.baseUrl,
                    framework,
                    route,
                    filters.theme ? [filters.theme] : [...shared.workbenchThemes],
                    filters.viewport ? [filters.viewport] : Object.keys(viewports)
                  ),
                }
              : await withRouteTimeout(
                  assertRoute(page, server.baseUrl, framework, route, {
                    theme: filters.theme ?? "light",
                    viewportId: filters.viewport ?? "desktop",
                    network,
                  }),
                  { route, framework, timeoutMs }
                );
            if (evidence.a11y?.ok === false) {
              fail(failures, "UIFN_BROWSER_A11Y", "Axe reported accessibility violations.", route, framework, evidence.a11y, "a11y");
              checks.push({ id, family: route.family, slug: route.slug, framework, route: route.path, status: "failed", evidence: sanitizeEvidence(evidence) });
            } else if (evidence.visualMatrix?.some((entry) => !entry.nonblank || !entry.geometryOk || !entry.a11yOk || entry.a11yViolations > 0 || !entry.clippingOk || !entry.textOverlapOk || !entry.themeTokensOk || entry.baselineOk === false)) {
              fail(failures, "UIFN_VISUAL_MATRIX_FAILED", "Visual matrix has blank, clipped, or inaccessible entries.", route, framework, {
                failedEntries: evidence.visualMatrix.filter((entry) => !entry.nonblank || !entry.geometryOk || !entry.a11yOk || entry.a11yViolations > 0 || !entry.clippingOk || !entry.textOverlapOk || !entry.themeTokensOk || entry.baselineOk === false),
              }, "visual");
              checks.push({ id, family: route.family, slug: route.slug, framework, route: route.path, status: "failed", evidence: sanitizeEvidence(evidence) });
            } else if (filters.scope === "visual") {
              checks.push({ id, family: route.family, slug: route.slug, framework, route: route.path, status: "passed", evidence: sanitizeEvidence(evidence) });
            } else if (evidence.geometry && !evidence.geometry.ok) {
              fail(failures, "UIFN_BROWSER_GEOMETRY", "Route root is clipped or invisible.", route, framework, evidence.geometry, "geometry");
              checks.push({ id, family: route.family, slug: route.slug, framework, route: route.path, status: "failed", evidence: sanitizeEvidence(evidence) });
            } else if (evidence.overlay && !evidence.overlay.ok) {
              const overlayCode = !evidence.overlay.placement?.insideViewport || !evidence.overlay.placement?.insideBoundary
                ? "UIFN_OVERLAY_OUT_OF_VIEWPORT"
                : "UIFN_OVERLAY_CONTENT_GEOMETRY";
              fail(failures, overlayCode, "Overlay route did not expose associated visible content geometry.", route, framework, evidence.overlay, "geometry");
              checks.push({ id, family: route.family, slug: route.slug, framework, route: route.path, status: "failed", evidence: sanitizeEvidence(evidence) });
            } else if (evidence.visual && !evidence.visual.nonblank) {
              fail(failures, "UIFN_BROWSER_VISUAL_BLANK", "Route screenshot appears blank.", route, framework, evidence.visual, "visual");
              checks.push({ id, family: route.family, slug: route.slug, framework, route: route.path, status: "failed", evidence: sanitizeEvidence(evidence) });
            } else if (evidence.visual && !evidence.visual.clipping?.ok) {
              fail(failures, "UIFN_VISUAL_CLIPPING", "Visual DOM inspection found clipped rendered elements.", route, framework, evidence.visual.clipping, "visual");
              checks.push({ id, family: route.family, slug: route.slug, framework, route: route.path, status: "failed", evidence: sanitizeEvidence(evidence) });
            } else if (evidence.visual && !evidence.visual.textOverlap?.ok) {
              fail(failures, "UIFN_VISUAL_TEXT_OVERLAP", "Visual DOM inspection found overlapping text boxes.", route, framework, evidence.visual.textOverlap, "visual");
              checks.push({ id, family: route.family, slug: route.slug, framework, route: route.path, status: "failed", evidence: sanitizeEvidence(evidence) });
            } else if (evidence.visual && !evidence.visual.themeTokens?.ok) {
              fail(failures, "UIFN_VISUAL_THEME_TOKEN_MISSING", "Visual DOM inspection did not find applied theme tokens.", route, framework, evidence.visual.themeTokens, "visual");
              checks.push({ id, family: route.family, slug: route.slug, framework, route: route.path, status: "failed", evidence: sanitizeEvidence(evidence) });
            } else if (evidence.visual?.baseline?.ok === false) {
              fail(failures, "UIFN_VISUAL_BASELINE_MISMATCH", "Visual screenshot hash does not match the recorded baseline.", route, framework, evidence.visual.baseline, "visual");
              checks.push({ id, family: route.family, slug: route.slug, framework, route: route.path, status: "failed", evidence: sanitizeEvidence(evidence) });
            } else if (evidence.network?.liveNetworkCalls > 0) {
              fail(failures, "UIFN_BROWSER_LIVE_NETWORK_CALL", "Workbench route made live network calls.", route, framework, evidence.network, "security");
              checks.push({ id, family: route.family, slug: route.slug, framework, route: route.path, status: "failed", evidence: sanitizeEvidence(evidence) });
            } else if (evidence.contract && !evidence.contract.ok) {
              fail(failures, "UIFN_QA_CONTRACT_ASSERTION_FAILED", "Executable QA contract actions or expected behavior were not proven.", route, framework, evidence.contract, "contract");
              checks.push({ id, family: route.family, slug: route.slug, framework, route: route.path, status: "failed", evidence: sanitizeEvidence(evidence) });
            } else if (evidence.interaction && !evidence.interaction.ok) {
              fail(failures, "UIFN_BROWSER_INTERACTION_NOT_OBSERVED", "Required browser interaction events were not observed.", route, framework, evidence.interaction, "interaction");
              checks.push({ id, family: route.family, slug: route.slug, framework, route: route.path, status: "failed", evidence: sanitizeEvidence(evidence) });
            } else if (route.fixtureId === "form-submit" && (!evidence.form || !evidence.form.ok)) {
              const formCode = evidence.form?.disabledStable === false
                ? "UIFN_FORM_DISABLED_MUTATED"
                : "UIFN_FORM_COMPONENT_BEHAVIOR_MISMATCH";
              fail(failures, formCode, "Form fixture did not prove component-owned value, state, or interaction behavior.", route, framework, evidence.form ?? {}, "interaction");
              checks.push({ id, family: route.family, slug: route.slug, framework, route: route.path, status: "failed", evidence: sanitizeEvidence(evidence) });
            } else if (route.fixtureId === "focus-trap" && (
              evidence.overlay?.focusTrap?.forwardCycle !== true ||
              evidence.overlay?.focusTrap?.backwardCycle !== true
            )) {
              fail(failures, "UIFN_A11Y_FOCUS_ESCAPE", "Focus escaped dialog-like fixture before Escape.", route, framework, evidence.overlay?.focusTrap ?? {}, "interaction");
              checks.push({ id, family: route.family, slug: route.slug, framework, route: route.path, status: "failed", evidence: sanitizeEvidence(evidence) });
            } else if (route.fixtureId === "large-data" && evidence.dataRich && !evidence.dataRich.ok) {
              fail(failures, "UIFN_DATA_RICH_STATE_MISMATCH", "Large-data fixture did not preserve filter and selection behavior.", route, framework, evidence.dataRich, "interaction");
              checks.push({ id, family: route.family, slug: route.slug, framework, route: route.path, status: "failed", evidence: sanitizeEvidence(evidence) });
            } else if (route.family === "pattern" && evidence.model?.actionsVisible !== true) {
              fail(failures, "UIFN_PATTERN_ACTION_MISSING", "Pattern route did not expose an action surface.", route, framework, evidence.model, "interaction");
              checks.push({ id, family: route.family, slug: route.slug, framework, route: route.path, status: "failed", evidence: sanitizeEvidence(evidence) });
            } else if (route.family === "pattern" && evidence.model?.noBackendImports !== true) {
              fail(failures, "UIFN_PATTERN_BACKEND_IMPORT", "Controlled pattern route included a backend client import.", route, framework, evidence.model, "security");
              checks.push({ id, family: route.family, slug: route.slug, framework, route: route.path, status: "failed", evidence: sanitizeEvidence(evidence) });
            } else if (route.family === "pattern" && evidence.model?.ok !== true) {
              fail(failures, "UIFN_PATTERN_ACTION_STATE_MISMATCH", "Pattern route action did not produce a visible state transition.", route, framework, evidence.model, "interaction");
              checks.push({ id, family: route.family, slug: route.slug, framework, route: route.path, status: "failed", evidence: sanitizeEvidence(evidence) });
            } else if (route.family === "sf" && evidence.model?.clientType !== "fake") {
              fail(failures, "UIFN_SF_GLOBAL_CLIENT_READ", "SF route did not report an injected fake client.", route, framework, evidence.model, "interaction");
              checks.push({ id, family: route.family, slug: route.slug, framework, route: route.path, status: "failed", evidence: sanitizeEvidence(evidence) });
            } else if (route.family === "sf" && (!evidence.model?.ok || evidence.model?.sfCallCount <= 0)) {
              fail(failures, "UIFN_SF_FAKE_CLIENT_CALL_MISSING", "SF route did not prove injected fake-client method calls and action state.", route, framework, evidence.model, "interaction");
              checks.push({ id, family: route.family, slug: route.slug, framework, route: route.path, status: "failed", evidence: sanitizeEvidence(evidence) });
            } else if (route.family === "scenario" && evidence.scenario?.ok !== true) {
              fail(failures, "UIFN_SCENARIO_STATE_MISMATCH", "Scenario route did not produce a user-visible workflow state transition.", route, framework, evidence.scenario, "interaction");
              checks.push({ id, family: route.family, slug: route.slug, framework, route: route.path, status: "failed", evidence: sanitizeEvidence(evidence) });
            } else {
              checks.push({ id, family: route.family, slug: route.slug, framework, route: route.path, status: "passed", evidence: sanitizeEvidence(evidence) });
            }
            if (checks.at(-1)?.status === "failed") {
              const routeArtifacts = await captureFailureArtifacts(page, framework, route);
              if (traceChunkOpen) {
                const tracePath = failureTracePath(framework, route);
                await page.context().tracing.stopChunk({ path: tracePath });
                traceChunkOpen = false;
                routeArtifacts.push(path.relative(process.cwd(), tracePath));
              }
              artifacts.push(...routeArtifacts);
              const routeFailure = [...failures].reverse().find((failure) => failure.framework === framework && failure.route === route.path);
              if (routeFailure && routeArtifacts.length) routeFailure.artifacts = routeArtifacts;
              checks.at(-1).evidence = sanitizeEvidence({ ...evidence, artifacts: routeArtifacts });
            } else if (traceChunkOpen) {
              await page.context().tracing.stopChunk();
              traceChunkOpen = false;
            }
            progress({ phase: "route:end", framework, route: route.path, status: checks.at(-1)?.status ?? "unknown" });
          } catch (error) {
            if (error?.code === "UIFN_BROWSER_ROUTE_TIMEOUT") {
              fail(failures, "UIFN_BROWSER_ROUTE_TIMEOUT", error.message, route, framework, error.details ?? {}, "timeout");
              checks.push({ id, family: route.family, slug: route.slug, framework, route: route.path, status: "failed", evidence: sanitizeEvidence({ timeout: error.details ?? {} }) });
            } else if (error?.code === "UIFN_BROWSER_ROUTE_BLANK") {
              fail(failures, "UIFN_BROWSER_ROUTE_BLANK", error.message, route, framework, error.details ?? {}, "route");
              checks.push({ id, family: route.family, slug: route.slug, framework, route: route.path, status: "failed", evidence: sanitizeEvidence(error.details ?? {}) });
            } else {
              fail(failures, "UIFN_BROWSER_ROUTE_FAILED", error instanceof Error ? error.message : String(error), route, framework, {}, "route");
              checks.push({ id, family: route.family, slug: route.slug, framework, route: route.path, status: "failed", evidence: {} });
            }
            const routeArtifacts = page ? await captureFailureArtifacts(page, framework, route).catch(() => []) : [];
            if (traceChunkOpen) {
              const tracePath = failureTracePath(framework, route);
              await page.context().tracing.stopChunk({ path: tracePath }).catch(() => undefined);
              traceChunkOpen = false;
              routeArtifacts.push(path.relative(process.cwd(), tracePath));
            }
            artifacts.push(...routeArtifacts);
            const routeFailure = [...failures].reverse().find((failure) => failure.framework === framework && failure.route === route.path);
            if (routeFailure && routeArtifacts.length) routeFailure.artifacts = routeArtifacts;
            checks.at(-1).evidence = sanitizeEvidence({ ...checks.at(-1).evidence, artifacts: routeArtifacts });
            progress({ phase: "route:end", framework, route: route.path, status: "failed" });
          }
        }
    } catch (error) {
      fail(failures, "UIFN_BROWSER_FRAMEWORK_FAILED", error instanceof Error ? error.message : String(error), { family: "framework", path: framework }, framework, {}, "framework");
    } finally {
      if (page && process.env.UIFN_CAPTURE_TRACES === "1") {
        await page.context().tracing.stop().catch(() => undefined);
      }
      await page?.close().catch(() => undefined);
      await browser?.close().catch(() => undefined);
      await server?.stop().catch(() => undefined);
      progress({ phase: "framework:end", framework });
    }
  }

  const summary = summarizeChecks(checks, failures);
  const coverage = coverageFor(shared, frameworks, routes, filters, sharded.shard);
  return finalizeBrowserResult(shared, {
    ok: failures.length === 0,
    command,
    schemaVersion: 1,
    mode: filters.scope ?? "full",
    frameworkCount: frameworks.length,
    componentCount: shared.workbenchComponents.length,
    patternCount: shared.workbenchPatterns.length,
    sfPanelCount: shared.workbenchSfPanels.length,
    routeCount: routes.length,
    coverage,
    checks,
    failures,
    artifacts,
    summary,
  });
}
