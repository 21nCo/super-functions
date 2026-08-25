import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { brotliCompressSync, constants as zlibConstants } from "node:zlib";
import { chromium } from "playwright";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const stageRoot = path.join(repoRoot, "uifn", "catalogs", "dist");
const evidenceRoot = path.join(
  repoRoot,
  "uifn",
  ".conduct",
  "evidence",
  "catalog-sites-performance",
);
const port = Number(process.env.UIFN_CATALOG_PERFORMANCE_PORT ?? 6315);
const baseUrl = `http://127.0.0.1:${port}`;
const frameworks = ["react", "svelte", "solid"];
const budgets = {
  htmlBytes: 20_000,
  jsCssRequests: 25,
  decodedJsCssBytes: 1_500_000,
  brotliJsCssBytes: 350_000,
  largestBrotliAssetBytes: 120_000,
};
const checks = [];
const findings = [];

const server = http.createServer((request, response) => {
  const requestUrl = new URL(request.url ?? "/", baseUrl);
  let filePath = path.join(stageRoot, decodeURIComponent(requestUrl.pathname).replace(/^\/+/, ""));
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, "index.html");
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

await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
fs.rmSync(evidenceRoot, { recursive: true, force: true });
fs.mkdirSync(evidenceRoot, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ["--disable-gpu", "--disable-gpu-compositing"],
});
try {
  for (const framework of frameworks) {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    });
    const page = await context.newPage();
    const consoleErrors = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => consoleErrors.push(error.message));

    const route = `/components/${framework}/components/dialog`;
    const response = await page.goto(`${baseUrl}${route}`, {
      waitUntil: "networkidle",
      timeout: 60_000,
    });
    await page.waitForSelector(
      `[data-uifn-workbench="${framework}"][data-uifn-loaded="true"]`,
      { timeout: 15_000 },
    );

    const resourceUrls = await page.evaluate(() => (
      performance.getEntriesByType("resource")
        .map((entry) => entry.name)
        .filter((url) => /\.(?:js|css)(?:\?|$)/.test(url))
    ));
    const assetPaths = [...new Set(resourceUrls.map((resourceUrl) => {
      const pathname = decodeURIComponent(new URL(resourceUrl).pathname);
      return path.join(stageRoot, pathname.replace(/^\/+/, ""));
    }))];
    const missingAssets = assetPaths.filter((assetPath) => !fs.existsSync(assetPath));
    const assets = assetPaths.filter((assetPath) => fs.existsSync(assetPath)).map((assetPath) => {
      const bytes = fs.readFileSync(assetPath);
      return {
        path: path.relative(stageRoot, assetPath),
        decodedBytes: bytes.byteLength,
        brotliBytes: brotliCompressSync(bytes, {
          params: {
            [zlibConstants.BROTLI_PARAM_QUALITY]: 11,
          },
        }).byteLength,
      };
    });
    const htmlPath = path.join(stageRoot, route.replace(/^\/+/, ""), "index.html");
    const metrics = await page.evaluate(() => {
      const navigation = performance.getEntriesByType("navigation")[0];
      return {
        domContentLoadedMs: Math.round(navigation.domContentLoadedEventEnd),
        loadMs: Math.round(navigation.loadEventEnd),
        firstContentfulPaintMs: Math.round(
          performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? 0,
        ),
      };
    });
    const evidence = {
      htmlBytes: fs.statSync(htmlPath).size,
      jsCssRequests: assets.length,
      decodedJsCssBytes: assets.reduce((total, asset) => total + asset.decodedBytes, 0),
      brotliJsCssBytes: assets.reduce((total, asset) => total + asset.brotliBytes, 0),
      largestBrotliAssetBytes: Math.max(...assets.map((asset) => asset.brotliBytes), 0),
      missingAssets: missingAssets.map((assetPath) => path.relative(stageRoot, assetPath)),
      consoleErrors,
      metrics,
      assets,
    };
    const problems = [
      ...(response?.ok() ? [] : [`route-status:${response?.status() ?? "missing"}`]),
      ...(evidence.htmlBytes <= budgets.htmlBytes ? [] : ["html-budget"]),
      ...(evidence.jsCssRequests <= budgets.jsCssRequests ? [] : ["request-budget"]),
      ...(evidence.decodedJsCssBytes <= budgets.decodedJsCssBytes ? [] : ["decoded-budget"]),
      ...(evidence.brotliJsCssBytes <= budgets.brotliJsCssBytes ? [] : ["brotli-budget"]),
      ...(evidence.largestBrotliAssetBytes <= budgets.largestBrotliAssetBytes
        ? []
        : ["single-asset-budget"]),
      ...(evidence.missingAssets.length === 0 ? [] : ["missing-assets"]),
      ...(consoleErrors.length === 0 ? [] : ["console-errors"]),
    ];
    checks.push({
      framework,
      route,
      status: problems.length === 0 ? "passed" : "failed",
      problems,
      evidence,
    });
    if (problems.length) {
      findings.push({
        severity: "high",
        framework,
        route,
        code: "UIFN_CATALOG_PERFORMANCE_BUDGET_FAILED",
        problems,
        evidence,
      });
    }
    await context.close();
  }
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

const result = {
  ok: findings.length === 0,
  command: "verify:uifn-catalog-performance",
  budgets,
  checks,
  findings,
  evidenceRoot,
};
fs.writeFileSync(
  path.join(evidenceRoot, "verification.json"),
  `${JSON.stringify(result, null, 2)}\n`,
);
console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exit(1);

function contentType(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".js") || filePath.endsWith(".mjs")) {
    return "text/javascript; charset=utf-8";
  }
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".json")) return "application/json; charset=utf-8";
  if (filePath.endsWith(".png")) return "image/png";
  if (filePath.endsWith(".woff2")) return "font/woff2";
  return "application/octet-stream";
}
