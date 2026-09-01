#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { chromium, firefox, webkit } from "playwright";
import { createLogger, preview } from "vite";

const repositoryRoot = process.cwd();
const examplesRoot = path.join(repositoryRoot, "mdfn", "examples");
const packageGraph = JSON.parse(readFileSync(path.join(repositoryRoot, "mdfn", "package-graph.json"), "utf8"));
const packages = packageGraph.stable;
const runId = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
const artifactsRoot = path.join(examplesRoot, "test-results", runId);
const startedAt = new Date().toISOString();

const allExamples = [
  { framework: "react", workspace: "mdfn-example-react", ariaLabel: "MDFN React example editor" },
  { framework: "svelte", workspace: "mdfn-example-svelte", ariaLabel: "MDFN Svelte example editor" },
  { framework: "solid", workspace: "mdfn-example-solid", ariaLabel: "MDFN Solid example editor" },
];

const allBrowsers = [
  { name: "chromium", type: chromium, context: {} },
  { name: "firefox", type: firefox, context: {} },
  { name: "webkit", type: webkit, context: {} },
  { name: "chromium-mobile", type: chromium, context: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 } },
];

const frameworkFilter = process.argv.find((argument) => argument.startsWith("--framework="))?.split("=", 2)[1];
const browserFilter = process.argv.find((argument) => argument.startsWith("--browser="))?.split("=", 2)[1];
const skipPackageBuild = process.argv.includes("--skip-package-build");
const examples = frameworkFilter ? allExamples.filter((example) => example.framework === frameworkFilter) : allExamples;
const browsers = browserFilter ? allBrowsers.filter((browser) => browser.name === browserFilter) : allBrowsers;
if (examples.length === 0) throw new Error(`MDFN_EXAMPLE_FRAMEWORK_UNKNOWN:${frameworkFilter}`);
if (browsers.length === 0) throw new Error(`MDFN_EXAMPLE_BROWSER_UNKNOWN:${browserFilter}`);

mkdirSync(artifactsRoot, { recursive: true });

const result = {
  ok: false,
  runId,
  startedAt,
  finishedAt: undefined,
  artifactsRoot,
  preflight: [],
  servers: [],
  runs: [],
};

function writeResult() {
  result.finishedAt = new Date().toISOString();
  writeFileSync(path.join(artifactsRoot, "result.json"), `${JSON.stringify(result, null, 2)}\n`);
  writeFileSync(path.join(examplesRoot, "test-results", "latest.json"), `${JSON.stringify(result, null, 2)}\n`);
}

function check(condition, code) {
  if (!condition) throw new Error(code);
}

function runPreflight(example, task) {
  const invocation = ["run", task, `--workspace=${example.workspace}`];
  const execution = spawnSync("npm", invocation, {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: { ...process.env, CI: "1" },
    maxBuffer: 50 * 1024 * 1024,
  });
  const log = `${execution.stdout ?? ""}${execution.stderr ?? ""}`;
  const logFile = path.join(artifactsRoot, `${example.framework}-${task}.log`);
  writeFileSync(logFile, log);
  const entry = { framework: example.framework, task, ok: execution.status === 0, status: execution.status, logFile };
  result.preflight.push(entry);
  if (log.trim()) process.stdout.write(log);
  check(entry.ok, `MDFN_EXAMPLE_${task.toUpperCase()}_FAILED:${example.framework}`);
}

function buildPackage(packageEntry) {
  const invocation = ["run", "build", `--workspace=${packageEntry.path}`];
  const execution = spawnSync("npm", invocation, {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: { ...process.env, CI: "1" },
    maxBuffer: 50 * 1024 * 1024,
  });
  const log = `${execution.stdout ?? ""}${execution.stderr ?? ""}`;
  const safeName = packageEntry.name.replaceAll("@", "").replaceAll("/", "-");
  const logFile = path.join(artifactsRoot, `package-${safeName}-build.log`);
  writeFileSync(logFile, log);
  const entry = { package: packageEntry.name, task: "build", ok: execution.status === 0, status: execution.status, logFile };
  result.preflight.push(entry);
  if (log.trim()) process.stdout.write(log);
  check(entry.ok, `MDFN_EXAMPLE_PACKAGE_BUILD_FAILED:${packageEntry.name}`);
}

function createCapturedLogger(framework) {
  const base = createLogger("info", { allowClearScreen: false });
  const events = [];
  const logger = Object.create(base);
  logger.info = (message, options) => { events.push({ level: "info", message: String(message) }); base.info(message, options); };
  logger.warn = (message, options) => { events.push({ level: "warn", message: String(message) }); base.warn(message, options); };
  logger.warnOnce = (message, options) => { events.push({ level: "warn", message: String(message) }); base.warnOnce(message, options); };
  logger.error = (message, options) => { events.push({ level: "error", message: String(message) }); base.error(message, options); };
  return {
    events,
    logger,
    persist() {
      const logFile = path.join(artifactsRoot, `${framework}-server.json`);
      writeFileSync(logFile, `${JSON.stringify(events, null, 2)}\n`);
      return logFile;
    },
  };
}

async function startExample(example) {
  const root = path.join(examplesRoot, example.framework);
  const capture = createCapturedLogger(example.framework);
  const server = await preview({
    root,
    configFile: path.join(root, "vite.config.ts"),
    customLogger: capture.logger,
    preview: { host: "127.0.0.1", port: 0, strictPort: false },
  });
  const url = server.resolvedUrls?.local[0];
  check(url, `MDFN_EXAMPLE_SERVER_URL_MISSING:${example.framework}`);
  result.servers.push({ framework: example.framework, url, logFile: path.join(artifactsRoot, `${example.framework}-server.json`) });
  const close = () => new Promise((resolve, reject) => server.httpServer.close((error) => error ? reject(error) : resolve()));
  return { ...example, server, close, url, capture };
}

function attachRuntimeCapture(page, events) {
  page.on("pageerror", (error) => events.push({ kind: "pageerror", severity: "error", message: error.message }));
  page.on("console", (message) => events.push({ kind: "console", severity: message.type(), message: message.text() }));
  page.on("requestfailed", (request) => events.push({ kind: "requestfailed", severity: "error", message: `${request.method()} ${request.url()}: ${request.failure()?.errorText ?? "failed"}` }));
  page.on("response", (response) => {
    if (response.status() >= 400) events.push({ kind: "response", severity: "error", message: `${response.status()} ${response.url()}` });
  });
}

async function screenshot(page, directory, name) {
  const file = path.join(directory, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true, animations: "disabled" });
  return file;
}

async function runExample(browserName, browser, example, contextOptions) {
  const directory = path.join(artifactsRoot, browserName, example.framework);
  mkdirSync(directory, { recursive: true });
  const events = [];
  const checkpoints = [];
  const run = {
    browser: browserName,
    framework: example.framework,
    url: example.url,
    ok: false,
    checkpoints,
    eventsFile: path.join(directory, "runtime-events.json"),
    failure: undefined,
  };
  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  page.setDefaultTimeout(10_000);
  attachRuntimeCapture(page, events);

  try {
    await page.goto(example.url, { waitUntil: "networkidle" });
    const root = page.locator(`[data-example-framework="${example.framework}"]`);
    await root.waitFor();
    await page.locator("[data-example-status]").getByText("ready", { exact: true }).waitFor();
    check(await root.count() === 1, `MDFN_EXAMPLE_ROOT_MISSING:${example.framework}`);
    check(await page.locator('[data-mdfn-component="editor-shell"]').count() === 1, `MDFN_EXAMPLE_SHELL_MISSING:${example.framework}`);
    check(await page.getByRole("navigation", { name: "Editor mode" }).count() === 1, `MDFN_EXAMPLE_MODE_SWITCHER_MISSING:${example.framework}`);
    checkpoints.push(await screenshot(page, directory, "01-loaded"));

    const visual = page.getByRole("textbox", { name: example.ariaLabel, exact: true });
    await visual.waitFor();
    check(await visual.getAttribute("aria-multiline") === "true", `MDFN_EXAMPLE_VISUAL_A11Y_FAILED:${example.framework}`);
    await visual.locator("p").last().click();
    await page.keyboard.press("End");
    const visualMarker = ` browser-${example.framework}`;
    await page.keyboard.insertText(visualMarker);
    await page.waitForFunction((marker) => document.querySelector("[data-example-markdown]")?.textContent?.includes(marker), visualMarker);
    checkpoints.push(await screenshot(page, directory, "02-visual-edit"));

    const modeSwitcher = page.getByRole("navigation", { name: "Editor mode" });
    await modeSwitcher.getByRole("button", { name: "source", exact: true }).click();
    await page.locator('[data-example-mode]').getByText("source", { exact: true }).waitFor();
    const source = page.getByRole("textbox", { name: `${example.ariaLabel} source`, exact: true });
    await source.waitFor();
    const currentMarkdown = await page.locator("[data-example-markdown]").textContent() ?? "";
    await source.click();
    const platform = await page.evaluate(() => navigator.platform);
    await page.keyboard.press(`${platform.includes("Mac") ? "Meta" : "Control"}+A`);
    await page.keyboard.insertText(`${currentMarkdown}\n\n## Browser verified\n`);
    await page.waitForFunction(() => document.querySelector("[data-example-markdown]")?.textContent?.includes("## Browser verified"));
    checkpoints.push(await screenshot(page, directory, "03-source-edit"));

    await modeSwitcher.getByRole("button", { name: "preview", exact: true }).click();
    await page.locator('[data-example-mode]').getByText("preview", { exact: true }).waitFor();
    await page.locator('[data-mdfn-surface="preview"] h2').getByText("Browser verified", { exact: true }).waitFor();
    checkpoints.push(await screenshot(page, directory, "04-preview"));

    await modeSwitcher.getByRole("button", { name: "visual", exact: true }).click();
    await page.getByRole("textbox", { name: example.ariaLabel, exact: true }).waitFor();
    await page.getByLabel("Select files", { exact: true }).setInputFiles({
      name: "browser-note.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("browser probe"),
    });
    await page.waitForFunction(() => document.querySelector("[data-example-markdown]")?.textContent?.includes("https://assets.example.test/browser-note.txt"));
    const markdownAfterFile = await page.locator("[data-example-markdown]").textContent() ?? "";
    check(
      markdownAfterFile.includes("[MDFN package documentation](https://github.com/21nCo/super-functions/tree/next/mdfn)."),
      `MDFN_EXAMPLE_EXISTING_LINK_CORRUPTED:${example.framework}`,
    );
    check(
      markdownAfterFile.includes("\n[browser-note.txt](https://assets.example.test/browser-note.txt)"),
      `MDFN_EXAMPLE_FILE_INSERTION_POSITION_FAILED:${example.framework}`,
    );

    await page.getByRole("textbox", { name: "Comment", exact: true }).fill("Browser review note");
    await page.getByRole("button", { name: "Add comment", exact: true }).click();
    await page.getByRole("list", { name: "Comments" }).getByText(/Browser review note/).waitFor();
    await page.locator('[aria-label="Review transitions"]').getByRole("button", { name: "in-review", exact: true }).click();
    await page.locator('[data-mdfn-surface="editorial"]').getByText("State: in-review", { exact: true }).waitFor();
    checkpoints.push(await screenshot(page, directory, "05-files-and-review"));

    await page.getByRole("button", { name: "Reset example document", exact: true }).click();
    await page.waitForFunction(() => {
      const markdown = document.querySelector("[data-example-markdown]")?.textContent ?? "";
      return markdown.startsWith("# Product launch brief") && !markdown.includes("Browser verified") && !markdown.includes("browser-note.txt");
    });
    await page.locator('[data-mdfn-surface="editorial"]').getByText("State: draft", { exact: true }).waitFor();
    check(await page.getByRole("list", { name: "Comments" }).locator("li").count() === 0, `MDFN_EXAMPLE_RESET_SIDECAR_FAILED:${example.framework}`);
    checkpoints.push(await screenshot(page, directory, "06-reset"));

    const runtimeErrors = events.filter((event) => event.severity === "error");
    check(runtimeErrors.length === 0, `MDFN_EXAMPLE_RUNTIME_ERRORS:${example.framework}:${runtimeErrors.map((event) => event.message).join("|")}`);
    run.ok = true;
  } catch (error) {
    run.failure = error instanceof Error ? { message: error.message, stack: error.stack } : { message: String(error) };
    try { writeFileSync(path.join(directory, "failure.html"), await page.content()); } catch {}
    try { await screenshot(page, directory, "failure"); } catch {}
  } finally {
    writeFileSync(run.eventsFile, `${JSON.stringify(events, null, 2)}\n`);
    await context.close();
  }
  result.runs.push(run);
}

const activeServers = [];
try {
  if (!skipPackageBuild) for (const packageEntry of packages) buildPackage(packageEntry);
  for (const example of examples) {
    runPreflight(example, "typecheck");
    runPreflight(example, "build");
  }
  for (const example of examples) activeServers.push(await startExample(example));

  for (const browserConfig of browsers) {
    const browser = await browserConfig.type.launch({ headless: true });
    try {
      for (const example of activeServers) await runExample(browserConfig.name, browser, example, browserConfig.context);
    } finally {
      await browser.close();
    }
  }
  result.ok = result.runs.length === browsers.length * examples.length && result.runs.every((run) => run.ok);
} catch (error) {
  result.fatal = error instanceof Error ? { message: error.message, stack: error.stack } : { message: String(error) };
} finally {
  for (const example of activeServers) {
    example.capture.persist();
    await example.close();
  }
  writeResult();
}

console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exit(1);
