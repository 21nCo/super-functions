#!/usr/bin/env node

import { chromium, firefox, webkit } from "playwright";
import { createServer } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import path from "node:path";

const fixture = path.join(process.cwd(), "mdfn", "testing", "browser");
const server = await createServer({
  root: fixture,
  logLevel: "error",
  plugins: [svelte()],
  resolve: {
    conditions: ["browser", "development"],
    dedupe: ["react", "react-dom"],
  },
  server: { host: "127.0.0.1", port: 0 },
});
const results = [];

function check(condition, code) {
  if (!condition) throw new Error(code);
}

async function runBrowser(name, browserType, contextOptions = {}) {
  const browser = await browserType.launch({ headless: true });
  const errors = [];
  try {
    const context = await browser.newContext(contextOptions);
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    await page.goto(server.resolvedUrls.local[0]);
    await page.locator("#status").getByText("ready").waitFor();
    const textbox = page.getByRole("textbox", { name: "Browser verification editor" });
    check(await textbox.getAttribute("aria-multiline") === "true", "MDFN_BROWSER_A11Y_ROLE_FAILED");
    await textbox.locator("p").last().click();
    await page.keyboard.press("End");
    await page.keyboard.type(" typed");
    await page.waitForFunction(() => globalThis.__MDFN_BROWSER__.markdown().includes("typed"));

    const unsafePaste = '<a href="javascript:alert(1)" onclick="alert(1)">pasted</a><img src="javascript:alert(2)" onerror="alert(2)">';
    const sanitized = await page.evaluate((html) => globalThis.__MDFN_BROWSER__.sanitize(html), unsafePaste);
    check(!/javascript:|onclick|onerror/i.test(sanitized), "MDFN_BROWSER_PASTE_POLICY_FAILED");
    if (name.startsWith("chromium")) {
      await page.evaluate((html) => {
        const target = document.querySelector(".ProseMirror");
        const transfer = new DataTransfer();
        transfer.setData("text/plain", "pasted");
        transfer.setData("text/html", html);
        target.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: transfer }));
      }, unsafePaste);
    } else {
      await page.keyboard.insertText("pasted");
    }
    await page.waitForFunction(() => globalThis.__MDFN_BROWSER__.markdown().includes("pasted"));
    const pasteState = await page.evaluate(() => ({ markdown: globalThis.__MDFN_BROWSER__.markdown(), html: document.querySelector(".ProseMirror").innerHTML }));
    check(!/javascript:|onclick|onerror/i.test(`${pasteState.markdown}\n${pasteState.html}`), "MDFN_BROWSER_PASTE_SANITIZATION_FAILED");

    await textbox.locator("p").last().click();
    await page.evaluate(() => document.activeElement?.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true, data: "" })));
    await page.keyboard.insertText("文");
    await page.evaluate(() => document.activeElement?.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: "文" })));
    await page.waitForFunction(() => globalThis.__MDFN_BROWSER__.markdown().includes("文"));

    await page.evaluate(() => {
      const transfer = new DataTransfer();
      transfer.items.add(new File(["asset"], "asset.txt", { type: "text/plain" }));
      document.querySelector(".ProseMirror").dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: transfer }));
    });
    await page.waitForFunction(() => globalThis.__MDFN_BROWSER__.files().includes("asset.txt"));
    check((await page.evaluate(() => globalThis.__MDFN_BROWSER__.markdown())).includes("assets.example.test"), "MDFN_BROWSER_FILE_ROUTE_FAILED");
    const adapterParity = await page.evaluate(() => globalThis.__MDFN_BROWSER__.adapterParity());
    check(adapterParity.ok && adapterParity.steps === 4, `MDFN_BROWSER_ADAPTER_PARITY_FAILED:${adapterParity.mismatches.join(",")}`);
    check(errors.length === 0, `MDFN_BROWSER_RUNTIME_ERROR:${errors.join("|")}`);
    await page.evaluate(() => globalThis.__MDFN_BROWSER__.destroy());
    check(await page.locator(".ProseMirror").count() === 0, "MDFN_BROWSER_CLEANUP_FAILED");
    await context.close();
    results.push({ browser: name, keyboard: true, clipboardPolicy: true, clipboardEvent: name.startsWith("chromium"), composition: true, fileDrop: true, adapterParity: true, accessibility: true, cleanup: true });
  } finally {
    await browser.close();
  }
}

await server.listen();
try {
  await runBrowser("chromium", chromium);
  await runBrowser("firefox", firefox);
  await runBrowser("webkit", webkit);
  await runBrowser("chromium-mobile", chromium, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
  console.log(JSON.stringify({ ok: true, browsers: results }, null, 2));
} finally {
  await server.close();
}
