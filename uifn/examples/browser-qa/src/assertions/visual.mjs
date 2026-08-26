import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";

const baselinePath = path.resolve(
  process.cwd(),
  process.env.UIFN_VISUAL_BASELINE_PATH ?? "uifn/examples/browser-qa/baselines/visual-hashes.json"
);
const robustHashQuantizationStep = 8;
const robustHashOffsets = [0, 2, 4, 6];
let baselineManifest;

function loadBaselineManifest() {
  if (baselineManifest) return baselineManifest;
  if (!existsSync(baselinePath)) {
    baselineManifest = { schemaVersion: 2, hashes: {}, robustHashes: {} };
    return baselineManifest;
  }
  baselineManifest = JSON.parse(readFileSync(baselinePath, "utf8"));
  baselineManifest.hashes ??= {};
  baselineManifest.robustHashes ??= {};
  return baselineManifest;
}

function writeBaselineManifest(manifest) {
  mkdirSync(path.dirname(baselinePath), { recursive: true });
  writeFileSync(baselinePath, `${JSON.stringify(manifest, null, 2)}\n`);
}

function reportedBaselinePath() {
  return path.relative(process.cwd(), baselinePath);
}

function visualBaselineKey(key = {}) {
  return [
    key.framework,
    key.family,
    key.slug,
    key.route,
    key.state,
    key.theme,
    key.viewport ? `${key.viewport.width}x${key.viewport.height}` : undefined,
  ].filter(Boolean).join("|");
}

function createRobustHashes(buffer) {
  const image = PNG.sync.read(buffer);
  return robustHashOffsets.map((offset) => {
    const normalized = Buffer.allocUnsafe(image.width * image.height * 3);
    for (let source = 0, target = 0; source < image.data.length; source += 4) {
      normalized[target++] = Math.floor((image.data[source] + offset) / robustHashQuantizationStep);
      normalized[target++] = Math.floor((image.data[source + 1] + offset) / robustHashQuantizationStep);
      normalized[target++] = Math.floor((image.data[source + 2] + offset) / robustHashQuantizationStep);
    }
    return createHash("sha256").update(normalized).digest("hex");
  });
}

function resolveBaseline(key, hash, robustHashes, requireBaseline) {
  const manifest = loadBaselineManifest();
  const baselineKey = visualBaselineKey(key);
  const updateAllowed = process.env.UIFN_UPDATE_VISUAL_BASELINES === "1";
  const expectedHash = manifest.hashes[baselineKey];
  const expectedRobustHashes = manifest.robustHashes[baselineKey];
  const robustMatch = Array.isArray(expectedRobustHashes) &&
    expectedRobustHashes.some((expected, index) => expected === robustHashes[index]);

  if (updateAllowed) {
    manifest.schemaVersion = 2;
    manifest.hashes[baselineKey] = hash;
    manifest.robustHashes[baselineKey] = robustHashes;
    writeBaselineManifest(manifest);
    return {
      ok: true,
      mode: "threshold-hash-manifest",
      key: baselineKey,
      path: reportedBaselinePath(),
      updateAllowed,
      updateEnv: "UIFN_UPDATE_VISUAL_BASELINES",
      status: expectedHash && expectedHash !== hash ? "updated" : "recorded",
      expectedHash: expectedHash ?? null,
      actualHash: hash,
      robustMatch,
      quantizationStep: robustHashQuantizationStep,
    };
  }

  if (!expectedHash || !Array.isArray(expectedRobustHashes)) {
    return {
      ok: !requireBaseline,
      mode: "threshold-hash-manifest",
      key: baselineKey,
      path: reportedBaselinePath(),
      updateAllowed,
      updateEnv: "UIFN_UPDATE_VISUAL_BASELINES",
      status: "missing",
      expectedHash: expectedHash ?? null,
      actualHash: hash,
      robustMatch: false,
      quantizationStep: robustHashQuantizationStep,
    };
  }

  const exactMatch = expectedHash === hash;
  return {
    ok: !requireBaseline || exactMatch || robustMatch,
    mode: "threshold-hash-manifest",
    key: baselineKey,
    path: reportedBaselinePath(),
    updateAllowed,
    updateEnv: "UIFN_UPDATE_VISUAL_BASELINES",
    status: exactMatch ? "matched" : robustMatch ? "matched-within-threshold" : "mismatched",
    expectedHash,
    actualHash: hash,
    robustMatch,
    quantizationStep: robustHashQuantizationStep,
  };
}

async function inspectVisualDom(page) {
  return await page.evaluate(() => {
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const pageCanScrollVertically =
      document.documentElement.scrollHeight > viewport.height + 8 ||
      document.body.scrollHeight > viewport.height + 8;
    const readThemeVars = (element) => {
      const style = window.getComputedStyle(element);
      const names = [
        "--uifn-color-surface-canvas",
        "--uifn-color-surface-raised",
        "--uifn-color-text-primary",
        "--uifn-color-accent-solid",
        "--uifn-radius-md",
        "--uifn-density-comfortable",
        "--uifn-motion-duration-normal",
      ];
      return Object.fromEntries(names.map((name) => [name, style.getPropertyValue(name).trim()]).filter(([, value]) => value));
    };

    const themeHosts = Array.from(new Set([
      document.documentElement,
      document.body,
      ...Array.from(document.querySelectorAll("[data-uifn-theme], [data-theme], [data-uifn-workbench]")),
    ].filter(Boolean)));
    const themeHostSamples = themeHosts.map((node) => ({
      selector:
        node === document.documentElement ? "html" :
        node === document.body ? "body" :
        node.getAttribute("data-uifn-theme") ? `[data-uifn-theme="${node.getAttribute("data-uifn-theme")}"]` :
        node.getAttribute("data-theme") ? `[data-theme="${node.getAttribute("data-theme")}"]` :
        node.getAttribute("data-uifn-workbench") ? `[data-uifn-workbench="${node.getAttribute("data-uifn-workbench")}"]` :
        node.tagName.toLowerCase(),
      vars: readThemeVars(node),
    }));

    const elements = Array.from(document.querySelectorAll("[data-uifn-component], [data-uifn-part], [data-uifn-pattern], [data-uifn-sf], [data-uifn-scenario]"))
      .filter((node) => {
        const element = node;
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
      })
      .map((node, index) => {
        const element = node;
        const rect = element.getBoundingClientRect();
        const ownTextNodes = Array.from(element.childNodes)
          .filter((child) => child.nodeType === Node.TEXT_NODE && (child.textContent ?? "").trim().length > 0);
        const ownText = ownTextNodes.map((child) => child.textContent ?? "").join("").trim();
        const ownTextBoxes = ownTextNodes.flatMap((child) => {
          const range = document.createRange();
          range.selectNodeContents(child);
          const boxes = Array.from(range.getClientRects())
            .filter((box) => box.width > 0 && box.height > 0)
            .map((box) => ({
              x: Math.round(box.x),
              y: Math.round(box.y),
              width: Math.round(box.width),
              height: Math.round(box.height),
              right: Math.round(box.right),
              bottom: Math.round(box.bottom),
            }));
          range.detach();
          return boxes;
        });
        return {
          index,
          selector: element.getAttribute("data-uifn-component") || element.getAttribute("data-uifn-part") || element.getAttribute("data-uifn-pattern") || element.getAttribute("data-uifn-sf") || element.getAttribute("data-uifn-scenario") || element.tagName.toLowerCase(),
          ownTextLength: ownText.length,
          ownTextBoxes,
          textLength: (element.textContent ?? "").trim().length,
          box: {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            right: Math.round(rect.right),
            bottom: Math.round(rect.bottom),
          },
          themeVars: readThemeVars(element),
        };
      });

    const intersectsViewport = (entry) =>
      entry.box.right > -8 &&
      entry.box.bottom > -8 &&
      entry.box.x < viewport.width + 8 &&
      entry.box.y < viewport.height + 8;
    const visibleViewportElements = elements.filter(intersectsViewport);
    const offscreenCount = elements.length - visibleViewportElements.length;
    const clipped = visibleViewportElements.filter((entry) =>
      entry.box.x < -8 ||
      (!pageCanScrollVertically && entry.box.y < -8) ||
      entry.box.right > viewport.width + 8 ||
      (!pageCanScrollVertically && entry.box.bottom > viewport.height + 8) ||
      entry.box.width <= 0 ||
      entry.box.height <= 0
    );

    const textLeaves = visibleViewportElements.flatMap((entry) =>
      entry.ownTextBoxes.map((box, boxIndex) => ({
        selector: `${entry.selector}#text-${boxIndex}`,
        box,
      }))
    );
    const overlaps = [];
    for (let leftIndex = 0; leftIndex < textLeaves.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < textLeaves.length; rightIndex += 1) {
        const left = textLeaves[leftIndex];
        const right = textLeaves[rightIndex];
        const xOverlap = Math.max(0, Math.min(left.box.right, right.box.right) - Math.max(left.box.x, right.box.x));
        const yOverlap = Math.max(0, Math.min(left.box.bottom, right.box.bottom) - Math.max(left.box.y, right.box.y));
        if (xOverlap > 4 && yOverlap > 4) {
          overlaps.push({
            left: left.selector,
            right: right.selector,
            overlap: { x: xOverlap, y: yOverlap },
          });
        }
      }
    }

    const tokenized = themeHostSamples.some((entry) => Object.keys(entry.vars).length > 0) ||
      elements.some((entry) => Object.keys(entry.themeVars).length > 0);
    return {
      viewport,
      inspectedElements: elements.length,
      clipping: {
        ok: clipped.length === 0,
        failures: clipped.slice(0, 10),
        offscreenCount,
      },
      textOverlap: {
        ok: overlaps.length === 0,
        failures: overlaps.slice(0, 10),
      },
      themeTokens: {
        ok: tokenized,
        hostCount: themeHostSamples.length,
        hostsWithVars: themeHostSamples.filter((entry) => Object.keys(entry.vars).length > 0).map((entry) => entry.selector),
        componentVarSamples: elements
          .filter((entry) => Object.keys(entry.themeVars).length > 0)
          .slice(0, 5)
          .map((entry) => ({ selector: entry.selector, vars: Object.keys(entry.themeVars) })),
      },
    };
  });
}

export async function assertVisual(page, key = {}) {
  const buffer = await page.screenshot({ animations: "disabled" });
  const dom = await inspectVisualDom(page);
  const hash = createHash("sha256").update(buffer).digest("hex");
  const robustHashes = createRobustHashes(buffer);
  const baseline = resolveBaseline(key, hash, robustHashes, key.requireBaseline === true);
  return {
    key: {
      framework: key.framework,
      family: key.family,
      slug: key.slug,
      route: key.route,
      state: key.state,
      theme: key.theme,
      viewport: key.viewport ? `${key.viewport.width}x${key.viewport.height}` : undefined,
    },
    screenshotBytes: buffer.length,
    screenshotHash: hash,
    dimensions: key.viewport ? { width: key.viewport.width, height: key.viewport.height } : undefined,
    nonblank: buffer.length > 1200,
    clipping: dom.clipping,
    textOverlap: dom.textOverlap,
    themeTokens: dom.themeTokens,
    inspectedElements: dom.inspectedElements,
    baseline,
  };
}
